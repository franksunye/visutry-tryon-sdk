import type { GlassesFittingConfig, GlassesPose, GlassesPoseSolverInput } from "../types/index.js";
/**
 * Calibration constant: maps millimetres to render-world units.
 *
 * The render-world is defined so that the full frame height maps to 1.0 unit and
 * the x-axis is scaled by aspect ratio. We assume a representative adult face
 * height of ~200 mm, hence 1 mm ≈ 0.005 render-world units. This is a documented
 * calibration anchor; the manifest `defaultScale` and `GlassesFittingConfig`
 * fine-tune per model.
 */
export declare const MM_TO_RENDER_WORLD: number;
/** Default fitting configuration. */
export declare const DEFAULT_FITTING_CONFIG: GlassesFittingConfig;
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
export declare class GlassesPoseSolver {
    /**
     * Solve the glasses pose for a single face result.
     */
    solve(input: GlassesPoseSolverInput): GlassesPose;
    private computeRoll;
    private computeScale;
    /**
     * The face-side width in render-world units used to fit the glasses. The model
     * frame width should match the outer-eye span, so we use that directly.
     */
    private fitMetricRW;
    private modelFrameWidthMm;
    private computePosition;
    private computeRotation;
    private applyPositionOffsets;
    private applyRotationOffsets;
    private clampScale;
    private assessVisibility;
    private deriveAspect;
}
/**
 * Decompose a column-major 4x4 rigid transformation matrix into Euler angles
 * (radians) in YXZ order. Used when `useTransformationMatrix` is enabled.
 */
export declare function decomposeMatrixToEuler(matrix: number[]): {
    x: number;
    y: number;
    z: number;
};
/** Convert degrees to radians for manifest authors who think in degrees. */
export declare function degreesToRadians(deg: number): number;
//# sourceMappingURL=GlassesPoseSolver.d.ts.map