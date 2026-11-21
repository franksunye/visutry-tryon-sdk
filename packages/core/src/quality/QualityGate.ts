import type {
  FaceQualityWarning,
  FaceSemanticPoints,
  NormalizedFaceResult,
  QualityGateInput,
  QualityGateMode,
  QualityGateResult,
} from "../types/index.js";
import { FaceMetricsCalculator } from "../face/FaceMetricsCalculator.js";
import { isFinitePoint2D } from "../face/geometryQuality.js";
import { clamp01 } from "../utils/math.js";

interface ModeThresholds {
  minConfidence: number;
  minFrontalScore?: number;
  minStabilityScore?: number;
  minBboxWidth?: number;
  requiredSemanticPoints?: (keyof FaceSemanticPoints)[];
  anyOfSemanticPoints?: (keyof FaceSemanticPoints)[][];
}

const THRESHOLDS: Record<QualityGateMode, ModeThresholds> = {
  analysis: {
    minConfidence: 0.75,
    minFrontalScore: 0.75,
    minStabilityScore: 0.7,
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

function isUnitScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Full detector-quality gate. Photo adapters without tracking confidence or
 * stability may use the calculator and scoreFromMetrics geometric contract.
 * Analysis geometry is shared with the scorer rather than recomputed here.
 */
export class QualityGate {
  private readonly metricsCalculator = new FaceMetricsCalculator();

  evaluate(input: QualityGateInput): QualityGateResult {
    const { face, mode } = input;
    const thresholds = THRESHOLDS[mode];
    const warnings = new Set<FaceQualityWarning>(face.quality.warnings);
    const semantic = face.landmarks.semantic;
    const quality = face.quality;

    if (!isUnitScore(quality.confidence) || quality.confidence < thresholds.minConfidence || !quality.faceVisible) {
      warnings.add("LOW_CONFIDENCE");
    }
    if (thresholds.minFrontalScore !== undefined
      && (!isUnitScore(quality.frontalScore) || quality.frontalScore < thresholds.minFrontalScore)) {
      warnings.add("NOT_FRONTAL");
    }
    if (thresholds.minStabilityScore !== undefined
      && (!isUnitScore(quality.stabilityScore) || quality.stabilityScore < thresholds.minStabilityScore)) {
      warnings.add("UNSTABLE");
    }
    if (face.faceCount !== undefined) {
      if (!Number.isInteger(face.faceCount) || face.faceCount < 1) warnings.add("LOW_CONFIDENCE");
      else if (face.faceCount > 1) warnings.add("MULTIPLE_FACES");
    }

    // Analysis uses semantic extents on both image axes. Legacy tracker bbox
    // limits remain specific to try-on/snapshot and do not override that rule.
    if (thresholds.minBboxWidth !== undefined) {
      if (!Number.isFinite(face.bbox.width) || !Number.isFinite(face.bbox.height)
        || face.bbox.width <= 0 || face.bbox.height <= 0) warnings.add("INVALID_LANDMARKS");
      if (face.bbox.width < thresholds.minBboxWidth) warnings.add("FACE_TOO_SMALL");
      if (face.bbox.width > 0.7) warnings.add("FACE_TOO_CLOSE");
    }
    if (thresholds.requiredSemanticPoints?.some((key) => !isFinitePoint2D(semantic[key]))) {
      warnings.add("MISSING_KEY_POINTS");
    }
    for (const group of thresholds.anyOfSemanticPoints ?? []) {
      if (!group.some((key) => isFinitePoint2D(semantic[key]))) warnings.add("MISSING_KEY_POINTS");
    }

    if (quality.lightingScore !== undefined && (!isUnitScore(quality.lightingScore) || quality.lightingScore < 0.4)) {
      warnings.add("LOW_LIGHT");
    }
    if (quality.occlusionScore !== undefined && (!isUnitScore(quality.occlusionScore) || quality.occlusionScore < 0.4)) {
      warnings.add("OCCLUDED");
    }
    if (mode === "analysis") {
      const metrics = this.metricsCalculator.compute(face);
      for (const warning of metrics.geometryWarnings ?? []) warnings.add(warning);
    }

    return {
      passed: warnings.size === 0,
      score: this.computeScore(face, mode),
      warnings: [...warnings],
    };
  }

  private computeScore(face: NormalizedFaceResult, mode: QualityGateMode): number {
    const quality = face.quality;
    const finiteScore = (value: number): number => isUnitScore(value) ? value : 0;
    let score = finiteScore(quality.confidence) * 0.4
      + finiteScore(quality.frontalScore) * 0.3 + finiteScore(quality.stabilityScore) * 0.3;
    if (quality.lightingScore !== undefined) score = score * 0.8 + finiteScore(quality.lightingScore) * 0.2;
    if (quality.occlusionScore !== undefined) score = score * 0.9 + finiteScore(quality.occlusionScore) * 0.1;
    if (mode === "analysis") score *= 0.95;
    return clamp01(score);
  }
}
