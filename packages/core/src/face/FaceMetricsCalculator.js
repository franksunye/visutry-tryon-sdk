import { distance2D, distance3D, median, trimmedMean, clamp01 } from "../utils/math.js";
/**
 * Computes geometric `FaceMetrics` from `FaceSemanticPoints`.
 *
 * Design rules (spec §12.2):
 *  - All distances use normalized coordinates.
 *  - Missing points are tolerated — a metric is simply left undefined / the
 *    measurement quality degrades. The calculator never throws on missing data.
 *  - Every result carries a `measurementQuality` in [0,1].
 *  - Multi-frame analysis aggregates via median (distances) / trimmed mean (ratios).
 */
export class FaceMetricsCalculator {
    /**
     * Compute metrics for a single normalized face result.
     */
    compute(face) {
        return this.computeFromSemantic(face.landmarks.semantic);
    }
    /**
     * Compute metrics directly from semantic points. This is the core entry
     * point — `NormalizedFaceResult` is only a thin wrapper around it.
     */
    computeFromSemantic(s) {
        const present = this.countKeyPoints(s);
        // --- Horizontal widths -------------------------------------------------
        const cheekboneWidth = this.safeDistance(s.leftCheek, s.rightCheek);
        const jawWidth = this.safeDistance(s.leftJaw, s.rightJaw);
        const eyeOuterDistance = this.safeDistance(s.leftEyeOuter, s.rightEyeOuter);
        const eyeInnerDistance = this.safeDistance(s.leftEyeInner, s.rightEyeInner);
        const eyeCenterDistance = this.safeDistance(s.leftEyeCenter, s.rightEyeCenter);
        // visutry additions: face outline width, forehead width, nose bridge width
        const faceOutlineWidth = this.safeDistance(s.leftFace, s.rightFace);
        const foreheadWidth = this.safeDistance(s.leftForehead, s.rightForehead);
        const noseBridgeWidth = this.safeDistance(s.noseLeft, s.noseRight);
        // faceWidth: prefer face outline width (widest part, visutry convention);
        // fall back to cheekbone width, then eye outer distance.
        const faceWidth = faceOutlineWidth ?? cheekboneWidth ?? eyeOuterDistance ?? 0;
        // --- Vertical height ---------------------------------------------------
        let faceHeight;
        if (s.foreheadCenter && s.chin) {
            faceHeight = distance3D(s.foreheadCenter, s.chin);
        }
        else if (s.eyesCenter && s.chin) {
            faceHeight = distance3D(s.eyesCenter, s.chin) / 0.55;
        }
        // --- Nose bridge to eye line ------------------------------------------
        let noseBridgeToEyeLine = 0;
        if (s.noseBridge && s.eyesCenter) {
            noseBridgeToEyeLine = Math.abs(s.noseBridge.y - s.eyesCenter.y);
        }
        // --- Ratios ------------------------------------------------------------
        const widthHeightRatio = faceHeight && faceHeight > 1e-6 ? faceWidth / faceHeight : 0;
        const jawCheekRatio = jawWidth !== undefined && cheekboneWidth && cheekboneWidth > 1e-6
            ? jawWidth / cheekboneWidth
            : 0;
        const foreheadCheekRatio = foreheadWidth !== undefined && cheekboneWidth && cheekboneWidth > 1e-6
            ? foreheadWidth / cheekboneWidth
            : undefined;
        // --- Eye line tilt (degrees) ------------------------------------------
        // Angle of the line connecting left/right eye outer corners relative to
        // horizontal. Positive = right side higher. Used for photo quality check.
        let eyeLineTiltDeg;
        if (s.leftEyeOuter && s.rightEyeOuter) {
            const dx = s.rightEyeOuter.x - s.leftEyeOuter.x;
            const dy = s.rightEyeOuter.y - s.leftEyeOuter.y;
            if (Math.abs(dx) > 1e-6) {
                eyeLineTiltDeg = Math.atan2(dy, dx) * (180 / Math.PI);
            }
        }
        // --- Symmetry offset ---------------------------------------------------
        // Nose bridge deviation from face center (midpoint of leftFace/rightFace).
        // 0 = perfectly symmetric, larger = more offset.
        let symmetryOffset;
        if (s.noseBridge && s.leftFace && s.rightFace && faceWidth > 1e-6) {
            const faceCenterX = (s.leftFace.x + s.rightFace.x) / 2;
            symmetryOffset = Math.abs(s.noseBridge.x - faceCenterX) / faceWidth;
        }
        // --- Face span (bounding box max dimension) ----------------------------
        let faceSpan;
        if (s.leftFace && s.rightFace && s.foreheadCenter && s.chin) {
            const w = Math.abs(s.rightFace.x - s.leftFace.x);
            const h = Math.abs(s.chin.y - s.foreheadCenter.y);
            faceSpan = Math.max(w, h);
        }
        // --- Chin type classification (geometric heuristic, width/height aware) -
        const chinType = this.classifyChin(jawCheekRatio, widthHeightRatio, jawWidth, cheekboneWidth, s.chin, s.leftJaw, s.rightJaw);
        // --- Measurement quality ----------------------------------------------
        const measurementQuality = this.computeQuality(present, s);
        // --- visutry-compatible 2D ratios -------------------------------------
        // visutry uses 2D distances (Math.hypot(dx, dy) with no z-component).
        // We compute these separately to ensure exact numerical equivalence.
        const visutry = this.computeVisutryRatios(s);
        return {
            faceWidth,
            faceHeight: faceHeight ?? 0,
            cheekboneWidth: cheekboneWidth ?? 0,
            jawWidth: jawWidth ?? 0,
            foreheadWidth,
            faceOutlineWidth,
            eyeOuterDistance: eyeOuterDistance ?? 0,
            eyeInnerDistance: eyeInnerDistance ?? 0,
            eyeCenterDistance: eyeCenterDistance ?? 0,
            noseBridgeToEyeLine,
            noseBridgeWidth,
            widthHeightRatio,
            jawCheekRatio,
            foreheadCheekRatio,
            eyeLineTiltDeg,
            symmetryOffset,
            faceSpan,
            chinType,
            measurementQuality,
            visutry,
        };
    }
    /**
     * Aggregate metrics across multiple frames (spec §12.3). Distances use the
     * median; ratios are recomputed from medians to stay internally consistent;
     * `measurementQuality` blends per-frame quality with cross-frame stability.
     */
    aggregate(frames) {
        if (frames.length === 0) {
            return this.emptyMetrics();
        }
        if (frames.length === 1) {
            return this.compute(frames[0]);
        }
        const perFrame = frames.map((f) => this.compute(f));
        const pick = (key) => perFrame.map((m) => m[key]).filter((v) => typeof v === "number" && !Number.isNaN(v));
        const faceWidth = median(pick("faceWidth"));
        const faceHeight = median(pick("faceHeight"));
        const cheekboneWidth = median(pick("cheekboneWidth"));
        const jawWidth = median(pick("jawWidth"));
        const eyeOuterDistance = median(pick("eyeOuterDistance"));
        const eyeInnerDistance = median(pick("eyeInnerDistance"));
        const eyeCenterDistance = median(pick("eyeCenterDistance"));
        const noseBridgeToEyeLine = median(pick("noseBridgeToEyeLine"));
        // visutry additions — aggregate optional metrics when available
        const foreheadWidthArr = perFrame.map((m) => m.foreheadWidth).filter((v) => typeof v === "number" && !Number.isNaN(v));
        const faceOutlineWidthArr = perFrame.map((m) => m.faceOutlineWidth).filter((v) => typeof v === "number" && !Number.isNaN(v));
        const noseBridgeWidthArr = perFrame.map((m) => m.noseBridgeWidth).filter((v) => typeof v === "number" && !Number.isNaN(v));
        const eyeLineTiltArr = perFrame.map((m) => m.eyeLineTiltDeg).filter((v) => typeof v === "number" && !Number.isNaN(v));
        const symmetryOffsetArr = perFrame.map((m) => m.symmetryOffset).filter((v) => typeof v === "number" && !Number.isNaN(v));
        const faceSpanArr = perFrame.map((m) => m.faceSpan).filter((v) => typeof v === "number" && !Number.isNaN(v));
        const foreheadWidth = foreheadWidthArr.length > 0 ? median(foreheadWidthArr) : undefined;
        const faceOutlineWidth = faceOutlineWidthArr.length > 0 ? median(faceOutlineWidthArr) : undefined;
        const noseBridgeWidth = noseBridgeWidthArr.length > 0 ? median(noseBridgeWidthArr) : undefined;
        const eyeLineTiltDeg = eyeLineTiltArr.length > 0 ? median(eyeLineTiltArr) : undefined;
        const symmetryOffset = symmetryOffsetArr.length > 0 ? median(symmetryOffsetArr) : undefined;
        const faceSpan = faceSpanArr.length > 0 ? median(faceSpanArr) : undefined;
        const widthHeightRatio = faceHeight > 1e-6 ? faceWidth / faceHeight : 0;
        const jawCheekRatio = cheekboneWidth > 1e-6 ? jawWidth / cheekboneWidth : 0;
        const foreheadCheekRatio = foreheadWidth !== undefined && cheekboneWidth > 1e-6
            ? foreheadWidth / cheekboneWidth
            : undefined;
        const qualities = pick("measurementQuality");
        const avgQuality = trimmedMean(qualities, 0.2);
        // Stability bonus: low variance across frames increases confidence.
        const wds = pick("faceWidth");
        const stability = this.stabilityFactor(wds);
        const measurementQuality = clamp01(avgQuality * 0.6 + stability * 0.4);
        // Chin type: majority vote across frames.
        const chinVotes = perFrame.map((m) => m.chinType);
        const chinType = this.majorityVote(chinVotes);
        // Aggregate visutry-compatible ratios (median of per-frame values)
        const visutryArr = perFrame.map((m) => m.visutry).filter((v) => v !== undefined);
        const visutry = visutryArr.length > 0
            ? {
                faceAspectRatio: median(visutryArr.map((v) => v.faceAspectRatio)),
                cheekToFaceWidth: median(visutryArr.map((v) => v.cheekToFaceWidth)),
                jawToCheekWidth: median(visutryArr.map((v) => v.jawToCheekWidth)),
                foreheadToCheekWidth: median(visutryArr.map((v) => v.foreheadToCheekWidth)),
                eyeLineTiltDeg: median(visutryArr.map((v) => v.eyeLineTiltDeg)),
                symmetryOffset: median(visutryArr.map((v) => v.symmetryOffset)),
                noseBridgeToFaceWidth: median(visutryArr.map((v) => v.noseBridgeToFaceWidth)),
            }
            : undefined;
        return {
            faceWidth,
            faceHeight,
            cheekboneWidth,
            jawWidth,
            foreheadWidth,
            faceOutlineWidth,
            eyeOuterDistance,
            eyeInnerDistance,
            eyeCenterDistance,
            noseBridgeToEyeLine,
            noseBridgeWidth,
            widthHeightRatio,
            jawCheekRatio,
            foreheadCheekRatio,
            eyeLineTiltDeg,
            symmetryOffset,
            faceSpan,
            chinType,
            measurementQuality,
            visutry,
        };
    }
    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    safeDistance(a, b) {
        if (!a || !b)
            return undefined;
        return distance3D({ x: a.x, y: a.y, z: a.z ?? 0 }, { x: b.x, y: b.y, z: b.z ?? 0 });
    }
    /**
     * 2D distance (x, y only — no z). Used for visutry-compatible ratios.
     */
    safeDistance2D(a, b) {
        if (!a || !b)
            return undefined;
        return distance2D({ x: a.x, y: a.y }, { x: b.x, y: b.y });
    }
    /**
     * Compute visutry-compatible ratios using 2D distances.
     * This mirrors visutry's analyzeFaceLandmarks() exactly:
     *   - faceAspectRatio = faceHeight / faceWidth (H/W, 2D)
     *   - cheekToFaceWidth = cheekWidth / faceWidth
     *   - jawToCheekWidth = jawWidth / cheekWidth
     *   - foreheadToCheekWidth = foreheadWidth / cheekWidth
     *   - eyeLineTiltDeg = atan2(dy, dx) * 180/PI
     *   - symmetryOffset = |noseBridge.x - faceCenterX| / faceWidth
     *   - noseBridgeToFaceWidth = noseBridgeWidth / faceWidth
     */
    computeVisutryRatios(s) {
        const required = [s.foreheadCenter, s.chin, s.leftFace, s.rightFace,
            s.leftCheek, s.rightCheek, s.leftJaw, s.rightJaw,
            s.leftForehead, s.rightForehead, s.leftEyeOuter, s.rightEyeOuter,
            s.noseLeft, s.noseRight, s.noseBridge];
        if (required.some((p) => !p))
            return undefined;
        // 2D distances — visutry multiplies by imageWidth/imageHeight but since
        // these are ratios, the scaling cancels out. We compute with normalized
        // coordinates directly.
        const faceHeight = this.safeDistance2D(s.foreheadCenter, s.chin);
        const faceWidth = this.safeDistance2D(s.leftFace, s.rightFace);
        const cheekWidth = this.safeDistance2D(s.leftCheek, s.rightCheek);
        const jawWidth = this.safeDistance2D(s.leftJaw, s.rightJaw);
        const foreheadWidth = this.safeDistance2D(s.leftForehead, s.rightForehead);
        const noseBridgeWidth = this.safeDistance2D(s.noseLeft, s.noseRight);
        if (faceHeight <= 0 || faceWidth <= 0 || cheekWidth <= 0)
            return undefined;
        // Eye line tilt — visutry uses atan2(dy*H, dx*W). With normalized coords
        // (W=H=1), this is atan2(dy, dx).
        const dx = s.rightEyeOuter.x - s.leftEyeOuter.x;
        const dy = s.rightEyeOuter.y - s.leftEyeOuter.y;
        const eyeLineTiltDeg = Math.atan2(dy, dx) * (180 / Math.PI);
        // Symmetry offset
        const faceCenterX = (s.leftFace.x + s.rightFace.x) / 2;
        const symmetryOffset = Math.abs(s.noseBridge.x - faceCenterX) / faceWidth;
        return {
            faceAspectRatio: faceHeight / faceWidth,
            cheekToFaceWidth: cheekWidth / faceWidth,
            jawToCheekWidth: jawWidth / cheekWidth,
            foreheadToCheekWidth: foreheadWidth / cheekWidth,
            eyeLineTiltDeg,
            symmetryOffset,
            noseBridgeToFaceWidth: noseBridgeWidth / faceWidth,
        };
    }
    countKeyPoints(s) {
        const keys = [
            "leftEyeOuter",
            "leftEyeInner",
            "rightEyeInner",
            "rightEyeOuter",
            "leftEyeCenter",
            "rightEyeCenter",
            "eyesCenter",
            "noseBridge",
            "noseTip",
            "chin",
            "leftCheek",
            "rightCheek",
            "leftJaw",
            "rightJaw",
            "leftBrowCenter",
            "rightBrowCenter",
            "foreheadCenter",
            // visutry additions
            "leftFace",
            "rightFace",
            "leftForehead",
            "rightForehead",
            "noseLeft",
            "noseRight",
        ];
        let count = 0;
        for (const k of keys)
            if (s[k])
                count++;
        return count;
    }
    computeQuality(present, s) {
        // Base quality from coverage of 23 key points.
        const coverage = clamp01(present / 23);
        // Critical points weight: eyes, noseBridge, chin, cheeks, jaw are essential.
        const critical = [
            "leftEyeCenter",
            "rightEyeCenter",
            "eyesCenter",
            "noseBridge",
            "chin",
            "leftCheek",
            "rightCheek",
            "leftJaw",
            "rightJaw",
        ];
        const criticalPresent = critical.filter((k) => s[k]).length;
        const criticalRatio = criticalPresent / critical.length;
        // Blend: critical points matter more than peripheral coverage.
        return clamp01(coverage * 0.35 + criticalRatio * 0.65);
    }
    classifyChin(jawCheekRatio, widthHeightRatio, jawWidth, cheekboneWidth, chin, leftJaw, rightJaw) {
        if (jawWidth === undefined || cheekboneWidth === undefined || !chin || !leftJaw || !rightJaw) {
            return "unknown";
        }
        // A pointed chin tapers strongly: jaw much narrower than cheekbone.
        if (jawCheekRatio < 0.72) {
            return "pointed";
        }
        // A broad jaw (jaw ≈ cheekbone) is square when proportions are medium and
        // rounded when the face is nearly as wide as it is tall (a round face).
        if (jawCheekRatio >= 0.86) {
            return widthHeightRatio >= 0.9 ? "rounded" : "square";
        }
        // Intermediate taper => rounded.
        return "rounded";
    }
    stabilityFactor(values) {
        if (values.length < 2)
            return 1;
        const m = values.reduce((a, b) => a + b, 0) / values.length;
        if (m < 1e-6)
            return 0.5;
        const variance = values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length;
        const cv = Math.sqrt(variance) / m; // coefficient of variation
        // cv near 0 => stable (1); cv >= 0.15 => unstable (0).
        return clamp01(1 - cv / 0.15);
    }
    majorityVote(values) {
        const counts = new Map();
        for (const v of values)
            counts.set(v, (counts.get(v) ?? 0) + 1);
        let best = "unknown";
        let bestCount = 0;
        for (const [k, c] of counts) {
            if (c > bestCount) {
                best = k;
                bestCount = c;
            }
        }
        return best;
    }
    emptyMetrics() {
        return {
            faceWidth: 0,
            faceHeight: 0,
            cheekboneWidth: 0,
            jawWidth: 0,
            eyeOuterDistance: 0,
            eyeInnerDistance: 0,
            eyeCenterDistance: 0,
            noseBridgeToEyeLine: 0,
            widthHeightRatio: 0,
            jawCheekRatio: 0,
            chinType: "unknown",
            measurementQuality: 0,
        };
    }
}
//# sourceMappingURL=FaceMetricsCalculator.js.map