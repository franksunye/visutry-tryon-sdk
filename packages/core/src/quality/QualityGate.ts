import type {
  FaceQualityWarning,
  FaceSemanticPoints,
  NormalizedFaceResult,
  QualityGateInput,
  QualityGateMode,
  QualityGateResult,
} from "../types/index.js";
import { FaceSemanticMapper } from "../face/FaceSemanticMapper.js";
import { clamp01 } from "../utils/math.js";

interface ModeThresholds {
  minConfidence: number;
  minFrontalScore?: number;
  minStabilityScore?: number;
  minBboxWidth: number;
  requiredSemanticPoints?: (keyof FaceSemanticPoints)[];
  anyOfSemanticPoints?: (keyof FaceSemanticPoints)[][];
}

const THRESHOLDS: Record<QualityGateMode, ModeThresholds> = {
  analysis: {
    minConfidence: 0.75,
    minFrontalScore: 0.75,
    minStabilityScore: 0.7,
    minBboxWidth: 0.25,
    requiredSemanticPoints: [
      "leftEyeCenter",
      "rightEyeCenter",
      "noseBridge",
      "chin",
      "leftCheek",
      "rightCheek",
      "leftJaw",
      "rightJaw",
    ],
  },
  tryon: {
    minConfidence: 0.55,
    minBboxWidth: 0.18,
    requiredSemanticPoints: ["eyesCenter"],
    anyOfSemanticPoints: [["noseBridge", "noseTip"]],
  },
  snapshot: {
    minConfidence: 0.6,
    minBboxWidth: 0.1,
    requiredSemanticPoints: ["eyesCenter"],
  },
};

/**
 * Decides whether a face result is good enough for analysis, try-on, or
 * snapshot, emitting structured warnings when it is not (spec §11).
 *
 * The gate is stateless and pure: given the same input it always returns the
 * same verdict, which makes it trivially testable.
 */
export class QualityGate {
  evaluate(input: QualityGateInput): QualityGateResult {
    const { face, mode } = input;
    const thresholds = THRESHOLDS[mode];
    const warnings: FaceQualityWarning[] = [];
    const sem = face.landmarks.semantic;

    // --- Confidence -------------------------------------------------------
    if (face.quality.confidence < thresholds.minConfidence) {
      warnings.push("LOW_CONFIDENCE");
    }

    // --- Frontality -------------------------------------------------------
    if (thresholds.minFrontalScore !== undefined && face.quality.frontalScore < thresholds.minFrontalScore) {
      warnings.push("NOT_FRONTAL");
    }

    // --- Stability --------------------------------------------------------
    if (thresholds.minStabilityScore !== undefined && face.quality.stabilityScore < thresholds.minStabilityScore) {
      warnings.push("UNSTABLE");
    }

    // --- Bounding box size ------------------------------------------------
    if (face.bbox.width < thresholds.minBboxWidth) {
      warnings.push("FACE_TOO_SMALL");
    }
    if (face.bbox.width > 0.7) {
      warnings.push("FACE_TOO_CLOSE");
    }

    // --- Semantic point presence -----------------------------------------
    if (thresholds.requiredSemanticPoints) {
      const missing = FaceSemanticMapper.countMissing(sem, thresholds.requiredSemanticPoints).missing;
      if (missing.length > 0) warnings.push("MISSING_KEY_POINTS");
    }
    if (thresholds.anyOfSemanticPoints) {
      for (const group of thresholds.anyOfSemanticPoints) {
        const any = group.some((k) => sem[k]);
        if (!any) {
          if (!warnings.includes("MISSING_KEY_POINTS")) warnings.push("MISSING_KEY_POINTS");
        }
      }
    }

    // --- Lighting / occlusion passthrough --------------------------------
    if (face.quality.lightingScore !== undefined && face.quality.lightingScore < 0.4) {
      warnings.push("LOW_LIGHT");
    }
    if (face.quality.occlusionScore !== undefined && face.quality.occlusionScore < 0.4) {
      warnings.push("OCCLUDED");
    }

    // --- Snapshot-specific: faceVisible ----------------------------------
    if (mode === "snapshot" && !face.quality.faceVisible) {
      warnings.push("LOW_CONFIDENCE");
    }

    const score = this.computeScore(face, mode);
    const passed = warnings.length === 0 && face.quality.faceVisible;

    return { passed, score, warnings };
  }

  /**
   * Composite quality score in [0,1] blending confidence, frontality,
   * stability, lighting and occlusion (when available).
   */
  private computeScore(face: NormalizedFaceResult, mode: QualityGateMode): number {
    const q = face.quality;
    let score = q.confidence * 0.4 + q.frontalScore * 0.3 + q.stabilityScore * 0.3;
    if (q.lightingScore !== undefined) score = score * 0.8 + q.lightingScore * 0.2;
    if (q.occlusionScore !== undefined) score = score * 0.9 + q.occlusionScore * 0.1;

    // Mode weighting: analysis is stricter.
    if (mode === "analysis") score *= 0.95;
    return clamp01(score);
  }
}
