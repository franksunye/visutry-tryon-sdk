import type {
  FaceMetrics,
  FaceQualityWarning,
  FaceShape,
  FaceShapeCandidate,
  FaceShapeResult,
  NormalizedFaceResult,
} from "../types/index.js";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";

export const FACE_SHAPE_SCORER_VERSION = "0.2.0";

/**
 * All canonical face shapes, in the same order as visutry's CANONICAL_FACE_SHAPES.
 */
const CANONICAL_SHAPES: FaceShape[] = [
  "oval",
  "round",
  "square",
  "heart",
  "diamond",
  "oblong",
  "triangle",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Build geometry signals — exact port of visutry's buildGeometrySignals().
 */
function buildGeometrySignals(
  shape: FaceShape,
  ratios: NonNullable<FaceMetrics["visutry"]>,
): string[] {
  const lengthSignal =
    ratios.faceAspectRatio >= 1.42
      ? "Longer vertical face proportion"
      : ratios.faceAspectRatio < 1.2
        ? "Compact face length relative to width"
        : "Balanced face length-to-width ratio";
  const jawSignal =
    ratios.jawToCheekWidth >= 0.94
      ? "Jaw width is close to cheekbone width"
      : ratios.jawToCheekWidth <= 0.78
        ? "Jawline tapers below the cheekbones"
        : "Jawline has moderate taper";
  const upperSignal =
    ratios.foreheadToCheekWidth >= 0.9
      ? "Forehead width is close to cheekbone width"
      : "Cheekbones read wider than the upper face";
  const shapeSignal = shape.charAt(0).toUpperCase() + shape.slice(1) + " shape supported by measured proportions";

  return [shapeSignal, lengthSignal, jawSignal, upperSignal];
}

/**
 * classifyFaceGeometry — exact port of visutry's classifyFaceGeometry().
 *
 * Uses integer if/else scoring on three key ratios:
 *   - faceAspectRatio (H/W, 2D)
 *   - jawToCheekWidth
 *   - foreheadToCheekWidth
 *
 * Confidence: clamp(0.56 + best.score * 0.065 + margin * 0.035, 0.58, 0.93)
 */
function classifyFaceGeometry(ratios: NonNullable<FaceMetrics["visutry"]>): {
  shape: FaceShape;
  alternatives: FaceShape[];
  confidence: number;
  signals: string[];
} {
  const scores: Record<string, number> = {
    round: 0,
    square: 0,
    oval: 0,
    heart: 0,
    diamond: 0,
    oblong: 0,
    triangle: 0,
  };

  const { faceAspectRatio, jawToCheekWidth, foreheadToCheekWidth } = ratios;

  // --- Exact replication of visutry's scoring rules ---
  if (faceAspectRatio >= 1.42) scores.oblong += 4;
  if (faceAspectRatio >= 1.27 && faceAspectRatio < 1.42) scores.oval += 3;
  if (faceAspectRatio < 1.2) scores.round += 2;
  if (faceAspectRatio < 1.18 && jawToCheekWidth >= 0.86) scores.square += 3;
  if (jawToCheekWidth >= 0.92 && foreheadToCheekWidth >= 0.9) scores.square += 3;
  if (jawToCheekWidth < 0.76 && foreheadToCheekWidth >= 0.84) scores.heart += 4;
  if (jawToCheekWidth < 0.78 && foreheadToCheekWidth < 0.84) scores.diamond += 4;
  if (jawToCheekWidth > 0.98 && foreheadToCheekWidth < 0.88) scores.triangle += 4;
  if (jawToCheekWidth >= 0.78 && jawToCheekWidth <= 0.9 && faceAspectRatio >= 1.2) {
    scores.oval += 2;
  }
  if (jawToCheekWidth >= 0.82 && jawToCheekWidth <= 0.94 && faceAspectRatio < 1.22) {
    scores.round += 2;
  }

  // --- Rank candidates ---
  const ranked = CANONICAL_SHAPES.map((shape) => ({ shape, score: scores[shape] })).sort(
    (a, b) => b.score - a.score,
  );
  const best = ranked[0];
  const second = ranked[1];
  const confidence = clamp(
    0.56 + best.score * 0.065 + (best.score - second.score) * 0.035,
    0.58,
    0.93,
  );

  const alternatives = ranked
    .slice(1, 3)
    .filter((candidate) => candidate.score > 0)
    .map((candidate) => candidate.shape);

  return {
    shape: best.shape,
    alternatives,
    confidence: round(confidence, 2),
    signals: buildGeometrySignals(best.shape, ratios),
  };
}

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
export class FaceShapeScorer {
  private readonly metricsCalculator: FaceMetricsCalculator;

  constructor(metricsCalculator?: FaceMetricsCalculator) {
    this.metricsCalculator = metricsCalculator ?? new FaceMetricsCalculator();
  }

  /**
   * Score a single face result.
   */
  score(face: NormalizedFaceResult): FaceShapeResult {
    const metrics = this.metricsCalculator.compute(face);
    return this.scoreFromMetrics(metrics, face.quality.warnings);
  }

  /**
   * Score from pre-aggregated metrics.
   */
  scoreFromMetrics(metrics: FaceMetrics, warnings: FaceQualityWarning[] = []): FaceShapeResult {
    // Require visutry-compatible ratios for classification.
    if (!metrics.visutry) {
      return this.unknownResult(metrics, [...warnings, "MISSING_KEY_POINTS"]);
    }

    const v = metrics.visutry;

    // --- Quality gates (exact match to visutry's analyzeFaceLandmarks) ---
    const MAX_TILT = 15;
    const MAX_SYMMETRY = 0.14;
    const MIN_SPAN = 0.16;

    const allWarnings = [...warnings];

    // Face span check
    if (metrics.faceSpan !== undefined && metrics.faceSpan < MIN_SPAN) {
      allWarnings.push("FACE_TOO_SMALL");
    }

    // Tilt check — visutry rejects > 15° as unavailable
    if (Math.abs(v.eyeLineTiltDeg) > MAX_TILT) {
      allWarnings.push("EXCESSIVE_TILT");
    }

    // Symmetry check — visutry rejects > 0.14 as unavailable
    if (v.symmetryOffset > MAX_SYMMETRY) {
      allWarnings.push("ASYMMETRIC_FACE");
    }

    // If quality gates failed, return unknown
    if (allWarnings.some((w) => w === "EXCESSIVE_TILT" || w === "ASYMMETRIC_FACE" || w === "FACE_TOO_SMALL")) {
      return this.unknownResult(metrics, allWarnings);
    }

    // --- Classify using visutry's exact algorithm ---
    const result = classifyFaceGeometry(v);

    // --- Build candidates list ---
    // visutry returns shape + alternatives; we also include all shapes with
    // their integer scores as candidates for SDK consumers.
    const scores = this.getAllScores(v);
    const ranked = CANONICAL_SHAPES.map((shape) => ({
      shape,
      score: scores[shape],
    })).sort((a, b) => b.score - a.score);

    const maxScore = Math.max(...ranked.map((r) => r.score), 1);

    const candidates: FaceShapeCandidate[] = ranked.map((r) => ({
      shape: r.shape,
      score: round(r.score / maxScore, 3),
      reasons: buildGeometrySignals(r.shape, v),
    }));

    // --- Soft warnings for borderline quality ---
    if (Math.abs(v.eyeLineTiltDeg) > 8) {
      if (!allWarnings.includes("EXCESSIVE_TILT")) {
        allWarnings.push("EXCESSIVE_TILT");
      }
    }
    if (v.symmetryOffset > 0.08) {
      if (!allWarnings.includes("ASYMMETRIC_FACE")) {
        allWarnings.push("ASYMMETRIC_FACE");
      }
    }

    return {
      primary: result.shape,
      candidates,
      confidence: result.confidence,
      metrics,
      warnings: allWarnings,
      version: FACE_SHAPE_SCORER_VERSION,
    };
  }

  /**
   * Multi-frame scoring: aggregate metrics first, then score.
   */
  scoreFrames(frames: NormalizedFaceResult[]): FaceShapeResult {
    if (frames.length === 0) {
      return this.unknownResult();
    }
    const metrics = this.metricsCalculator.aggregate(frames);
    const warnings = frames[0].quality.warnings;
    return this.scoreFromMetrics(metrics, warnings);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Get raw integer scores for all 7 shapes — same as visutry's scoring.
   */
  private getAllScores(v: NonNullable<FaceMetrics["visutry"]>): Record<string, number> {
    const scores: Record<string, number> = {
      round: 0, square: 0, oval: 0, heart: 0, diamond: 0, oblong: 0, triangle: 0,
    };

    const { faceAspectRatio, jawToCheekWidth, foreheadToCheekWidth } = v;

    if (faceAspectRatio >= 1.42) scores.oblong += 4;
    if (faceAspectRatio >= 1.27 && faceAspectRatio < 1.42) scores.oval += 3;
    if (faceAspectRatio < 1.2) scores.round += 2;
    if (faceAspectRatio < 1.18 && jawToCheekWidth >= 0.86) scores.square += 3;
    if (jawToCheekWidth >= 0.92 && foreheadToCheekWidth >= 0.9) scores.square += 3;
    if (jawToCheekWidth < 0.76 && foreheadToCheekWidth >= 0.84) scores.heart += 4;
    if (jawToCheekWidth < 0.78 && foreheadToCheekWidth < 0.84) scores.diamond += 4;
    if (jawToCheekWidth > 0.98 && foreheadToCheekWidth < 0.88) scores.triangle += 4;
    if (jawToCheekWidth >= 0.78 && jawToCheekWidth <= 0.9 && faceAspectRatio >= 1.2) {
      scores.oval += 2;
    }
    if (jawToCheekWidth >= 0.82 && jawToCheekWidth <= 0.94 && faceAspectRatio < 1.22) {
      scores.round += 2;
    }

    return scores;
  }

  private unknownResult(
    metrics?: FaceMetrics,
    warnings: FaceQualityWarning[] = ["LOW_CONFIDENCE"],
  ): FaceShapeResult {
    return {
      primary: "unknown",
      candidates: [],
      confidence: 0,
      metrics: metrics ?? {
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
      },
      warnings,
      version: FACE_SHAPE_SCORER_VERSION,
    };
  }
}
