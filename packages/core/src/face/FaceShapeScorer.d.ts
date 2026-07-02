import type { FaceMetrics, FaceQualityWarning, FaceShapeResult, NormalizedFaceResult } from "../types/index.js";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";
export declare const FACE_SHAPE_SCORER_VERSION = "0.2.0";
/**
 * Scores face shapes from geometric metrics.
 *
 * v0.2.0: Exact port of visutry's classifyFaceGeometry algorithm.
 * Uses if/else integer scoring on 2D ratios — not bell/softmax.
 * This ensures numerical equivalence with visutry's main site.
 *
 * Future enhancements (bell functions, softmax, chinType, multi-frame)
 * can be layered on top of this known-good baseline.
 */
export declare class FaceShapeScorer {
    private readonly metricsCalculator;
    constructor(metricsCalculator?: FaceMetricsCalculator);
    /**
     * Score a single face result.
     */
    score(face: NormalizedFaceResult): FaceShapeResult;
    /**
     * Score from pre-aggregated metrics.
     */
    scoreFromMetrics(metrics: FaceMetrics, warnings?: FaceQualityWarning[]): FaceShapeResult;
    /**
     * Multi-frame scoring: aggregate metrics first, then score.
     */
    scoreFrames(frames: NormalizedFaceResult[]): FaceShapeResult;
    /**
     * Get raw integer scores for all 7 shapes — same as visutry's scoring.
     */
    private getAllScores;
    private unknownResult;
}
//# sourceMappingURL=FaceShapeScorer.d.ts.map