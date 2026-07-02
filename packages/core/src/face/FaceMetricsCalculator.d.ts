import type { FaceMetrics, FaceSemanticPoints, NormalizedFaceResult } from "../types/index.js";
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
export declare class FaceMetricsCalculator {
    /**
     * Compute metrics for a single normalized face result.
     */
    compute(face: NormalizedFaceResult): FaceMetrics;
    /**
     * Compute metrics directly from semantic points. This is the core entry
     * point — `NormalizedFaceResult` is only a thin wrapper around it.
     */
    computeFromSemantic(s: FaceSemanticPoints): FaceMetrics;
    /**
     * Aggregate metrics across multiple frames (spec §12.3). Distances use the
     * median; ratios are recomputed from medians to stay internally consistent;
     * `measurementQuality` blends per-frame quality with cross-frame stability.
     */
    aggregate(frames: NormalizedFaceResult[]): FaceMetrics;
    private safeDistance;
    /**
     * 2D distance (x, y only — no z). Used for visutry-compatible ratios.
     */
    private safeDistance2D;
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
    private computeVisutryRatios;
    private countKeyPoints;
    private computeQuality;
    private classifyChin;
    private stabilityFactor;
    private majorityVote;
    private emptyMetrics;
}
//# sourceMappingURL=FaceMetricsCalculator.d.ts.map