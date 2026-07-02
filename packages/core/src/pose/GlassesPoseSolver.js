import { clamp, clamp01, distance3D, DEG2RAD } from "../utils/math.js";
import { CoordinateSystem } from "../coordinate/CoordinateSystem.js";
/**
 * Calibration constant: maps millimetres to render-world units.
 *
 * The render-world is defined so that the full frame height maps to 1.0 unit and
 * the x-axis is scaled by aspect ratio. We assume a representative adult face
 * height of ~200 mm, hence 1 mm ≈ 0.005 render-world units. This is a documented
 * calibration anchor; the manifest `defaultScale` and `GlassesFittingConfig`
 * fine-tune per model.
 */
export const MM_TO_RENDER_WORLD = 1 / 200;
/** Default fitting configuration. */
export const DEFAULT_FITTING_CONFIG = {
    scaleMultiplier: 1,
    positionOffset: { x: 0, y: 0, z: 0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
    useTransformationMatrix: false,
    fitBy: "eyeOuterDistance",
    verticalAnchor: "noseBridge",
    depthStrategy: "noseTip",
};
/**
 * Converts a normalized `NormalizedFaceResult` into a `GlassesPose` that the
 * renderer can apply directly to a glasses model.
 *
 * Coordinate contract:
 *  - Face landmarks arrive in *normalized-image* space (origin top-left, y down).
 *  - The solver converts them to *render-world* space (origin centre, y up,
 *    x scaled by aspect ratio, 1.0 unit = frame height) before computing.
 *  - The renderer must use the same render-world convention so that
 *    `GlassesPose.position` lands the model on the face.
 *
 * Solve pipeline (spec §15.5):
 *   1. eye centre line → roll
 *   2. outer-eye distance → scale
 *   3. noseBridge / eyeLine → position
 *   4. yaw / pitch (or matrix) → 3D rotation
 *   5. manifest defaults + config offsets applied
 */
export class GlassesPoseSolver {
    /**
     * Solve the glasses pose for a single face result.
     */
    solve(input) {
        const { face, asset, config } = input;
        const cfg = { ...DEFAULT_FITTING_CONFIG, ...config };
        const aspect = this.deriveAspect(face);
        const sem = face.landmarks.semantic;
        // Visibility / confidence gate (tryon-level, spec §11.4).
        const visibility = this.assessVisibility(face);
        if (!visibility.visible) {
            return {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: asset.fitting.defaultScale, y: asset.fitting.defaultScale, z: asset.fitting.defaultScale },
                visible: false,
                confidence: visibility.confidence,
                reason: visibility.reason,
            };
        }
        // --- 1. Roll from the eye centre line --------------------------------
        const roll = this.computeRoll(sem, aspect);
        // --- 2. Scale from the chosen fit metric -----------------------------
        const scale = this.computeScale(face, asset, cfg, aspect);
        // --- 3. Position -----------------------------------------------------
        const position = this.computePosition(sem, asset, cfg, aspect, face);
        // --- 4. Rotation (yaw/pitch + roll) ----------------------------------
        const rotation = this.computeRotation(face, cfg, roll);
        // --- 5. Apply manifest defaults & config offsets ---------------------
        const finalPosition = this.applyPositionOffsets(position, asset, cfg);
        const finalRotation = this.applyRotationOffsets(rotation, asset, cfg);
        const finalScale = this.clampScale(scale, asset, cfg);
        return {
            position: finalPosition,
            rotation: finalRotation,
            scale: { x: finalScale, y: finalScale, z: finalScale },
            visible: true,
            confidence: clamp01(visibility.confidence * 0.7 + face.pose.confidence * 0.3),
        };
    }
    // -----------------------------------------------------------------------
    // Roll
    // -----------------------------------------------------------------------
    computeRoll(sem, aspect) {
        const le = sem.leftEyeCenter ?? sem.leftEyeOuter;
        const re = sem.rightEyeCenter ?? sem.rightEyeOuter;
        if (!le || !re)
            return 0;
        const leRW = CoordinateSystem.normalizedToRenderWorld(le, aspect);
        const reRW = CoordinateSystem.normalizedToRenderWorld(re, aspect);
        // Angle of the eye line in render-world (y up). Rotating the glasses by
        // this angle around Z keeps it parallel to the eyes.
        return Math.atan2(reRW.y - leRW.y, reRW.x - leRW.x);
    }
    // -----------------------------------------------------------------------
    // Scale
    // -----------------------------------------------------------------------
    computeScale(face, asset, cfg, aspect) {
        const sem = face.landmarks.semantic;
        const fitMetric = this.fitMetricRW(sem, cfg.fitBy ?? "eyeOuterDistance", aspect);
        const modelWidthMm = this.modelFrameWidthMm(asset);
        const modelWidthRW = modelWidthMm * MM_TO_RENDER_WORLD;
        if (fitMetric <= 1e-6 || modelWidthRW <= 1e-6) {
            return asset.fitting.defaultScale;
        }
        const rawScale = fitMetric / modelWidthRW;
        const scale = rawScale * asset.fitting.defaultScale * (cfg.scaleMultiplier ?? 1);
        return scale;
    }
    /**
     * The face-side width in render-world units used to fit the glasses. The model
     * frame width should match the outer-eye span, so we use that directly.
     */
    fitMetricRW(sem, fitBy, aspect) {
        const toRW = (p) => (p ? CoordinateSystem.normalizedToRenderWorld(p, aspect) : undefined);
        let a;
        let b;
        switch (fitBy) {
            case "eyeOuterDistance":
                a = toRW(sem.leftEyeOuter);
                b = toRW(sem.rightEyeOuter);
                break;
            case "eyeCenterDistance":
                a = toRW(sem.leftEyeCenter);
                b = toRW(sem.rightEyeCenter);
                break;
            case "faceWidth":
                a = toRW(sem.leftCheek);
                b = toRW(sem.rightCheek);
                break;
        }
        if (!a || !b) {
            // Fallback to whatever eye points exist.
            a = toRW(sem.leftEyeOuter ?? sem.leftEyeCenter);
            b = toRW(sem.rightEyeOuter ?? sem.rightEyeCenter);
        }
        if (!a || !b)
            return 0;
        return distance3D(a, b);
    }
    modelFrameWidthMm(asset) {
        const unitFactor = asset.coordinateSystem.unit === "millimeter"
            ? 1
            : asset.coordinateSystem.unit === "centimeter"
                ? 10
                : 1000;
        return asset.dimensions.frameWidthMm * unitFactor;
    }
    // -----------------------------------------------------------------------
    // Position
    // -----------------------------------------------------------------------
    computePosition(sem, _asset, cfg, aspect, face) {
        const anchor = cfg.verticalAnchor ?? "noseBridge";
        let baseNorm;
        switch (anchor) {
            case "noseBridge":
                baseNorm = sem.noseBridge ?? sem.eyesCenter;
                break;
            case "eyeLine":
                baseNorm = sem.eyesCenter;
                break;
            case "browLine":
                baseNorm =
                    sem.leftBrowCenter && sem.rightBrowCenter
                        ? {
                            x: (sem.leftBrowCenter.x + sem.rightBrowCenter.x) / 2,
                            y: (sem.leftBrowCenter.y + sem.rightBrowCenter.y) / 2,
                            z: (sem.leftBrowCenter.z + sem.rightBrowCenter.z) / 2,
                        }
                        : sem.eyesCenter;
                break;
        }
        if (!baseNorm) {
            return { x: 0, y: 0, z: 0 };
        }
        const rw = CoordinateSystem.normalizedToRenderWorld(baseNorm, aspect);
        // Depth strategy.
        let z = 0;
        const depth = cfg.depthStrategy ?? "noseTip";
        if (depth === "noseTip" && sem.noseTip) {
            // The nose tip z (relative to face centre) pushes the glasses forward.
            z = (sem.noseTip.z ?? 0) * 0.5;
        }
        else if (depth === "matrix" && face.pose.matrix) {
            z = face.pose.matrix[14] ?? 0; // translation z of a column-major 4x4
        }
        return { x: rw.x, y: rw.y, z };
    }
    // -----------------------------------------------------------------------
    // Rotation
    // -----------------------------------------------------------------------
    computeRotation(face, cfg, roll) {
        if (cfg.useTransformationMatrix && face.pose.matrix) {
            const euler = decomposeMatrixToEuler(face.pose.matrix);
            // Replace roll with the eye-line-derived value (more stable than matrix roll).
            return { x: euler.x, y: euler.y, z: roll };
        }
        return { x: face.pose.pitch, y: face.pose.yaw, z: roll };
    }
    // -----------------------------------------------------------------------
    // Offsets & clamping
    // -----------------------------------------------------------------------
    applyPositionOffsets(position, asset, cfg) {
        const off = asset.fitting.defaultOffset;
        const cfgOff = cfg.positionOffset ?? { x: 0, y: 0, z: 0 };
        return {
            x: position.x + off.x + cfgOff.x,
            y: position.y + off.y + cfgOff.y,
            z: position.z + off.z + cfgOff.z,
        };
    }
    applyRotationOffsets(rotation, asset, cfg) {
        const off = asset.fitting.defaultRotation;
        const cfgOff = cfg.rotationOffset ?? { x: 0, y: 0, z: 0 };
        return {
            x: rotation.x + off.x + cfgOff.x,
            y: rotation.y + off.y + cfgOff.y,
            z: rotation.z + off.z + cfgOff.z,
        };
    }
    clampScale(scale, asset, cfg) {
        const min = asset.fitting.minScale ?? 0.1;
        const max = asset.fitting.maxScale ?? 5;
        const mult = cfg.scaleMultiplier ?? 1;
        return clamp(scale / (mult || 1) * mult, min, max);
    }
    // -----------------------------------------------------------------------
    // Visibility
    // -----------------------------------------------------------------------
    assessVisibility(face) {
        const sem = face.landmarks.semantic;
        const hasEyesCenter = !!sem.eyesCenter;
        const hasNose = !!sem.noseBridge || !!sem.noseTip;
        const confidence = face.pose.confidence;
        const bboxWidth = face.bbox.width;
        if (!hasEyesCenter) {
            return { visible: false, confidence, reason: "MISSING_EYES_CENTER" };
        }
        if (!hasNose) {
            return { visible: false, confidence, reason: "MISSING_NOSE_REFERENCE" };
        }
        if (confidence < 0.55) {
            return { visible: false, confidence, reason: "LOW_TRACKER_CONFIDENCE" };
        }
        if (bboxWidth < 0.18) {
            return { visible: false, confidence, reason: "FACE_TOO_SMALL" };
        }
        return { visible: true, confidence };
    }
    // -----------------------------------------------------------------------
    deriveAspect(face) {
        // Without an explicit frame size we fall back to a 4:3 aspect, which is the
        // default camera resolution. The web adapter passes the real aspect via the
        // renderer setup; the solver stays robust to a missing value.
        const b = face.bbox;
        if (b.width > 0 && b.height > 0) {
            return b.width / b.height;
        }
        return 4 / 3;
    }
}
/**
 * Decompose a column-major 4x4 rigid transformation matrix into Euler angles
 * (radians) in YXZ order. Used when `useTransformationMatrix` is enabled.
 */
export function decomposeMatrixToEuler(matrix) {
    // Column-major: matrix[0..3] = column 0, [4..7] = column 1, etc.
    // Rotation sub-matrix:
    //   | m0 m4 m8 |
    //   | m1 m5 m9 |
    //   | m2 m6 m10|
    const m0 = matrix[0] ?? 1;
    const m1 = matrix[1] ?? 0;
    const m2 = matrix[2] ?? 0;
    const m5 = matrix[5] ?? 1;
    const m6 = matrix[6] ?? 0;
    const m9 = matrix[9] ?? 0;
    const m10 = matrix[10] ?? 1;
    // YXZ extraction.
    const y = Math.asin(clamp(-m2, -1, 1));
    let x;
    let z;
    if (Math.abs(m2) < 0.99999) {
        x = Math.atan2(m6, m10);
        z = Math.atan2(m1, m0);
    }
    else {
        // Gimbal lock fallback.
        x = Math.atan2(-m9, m5);
        z = 0;
    }
    return { x, y, z };
}
/** Convert degrees to radians for manifest authors who think in degrees. */
export function degreesToRadians(deg) {
    return deg * DEG2RAD;
}
//# sourceMappingURL=GlassesPoseSolver.js.map