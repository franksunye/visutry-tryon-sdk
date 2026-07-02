import type { QualityGateInput, QualityGateResult } from "../types/index.js";
/**
 * Decides whether a face result is good enough for analysis, try-on, or
 * snapshot, emitting structured warnings when it is not (spec §11).
 *
 * The gate is stateless and pure: given the same input it always returns the
 * same verdict, which makes it trivially testable.
 */
export declare class QualityGate {
    evaluate(input: QualityGateInput): QualityGateResult;
    /**
     * Photo quality checks adapted from visutry: eye line tilt, facial symmetry,
     * and face span. These help reject poor-quality selfies before analysis.
     */
    private checkPhotoQuality;
    /**
     * Composite quality score in [0,1] blending confidence, frontality,
     * stability, lighting and occlusion (when available).
     */
    private computeScore;
}
//# sourceMappingURL=QualityGate.d.ts.map