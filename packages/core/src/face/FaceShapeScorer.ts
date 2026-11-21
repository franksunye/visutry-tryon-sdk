import type {
  FaceMetrics,
  FaceQualityWarning,
  FaceShape,
  FaceShapeCandidate,
  FaceShapeResult,
  NormalizedFaceResult,
} from "../types/index.js";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";
import { QualityGate } from "../quality/QualityGate.js";
import { getFaceGeometryWarnings } from "./geometryQuality.js";

/** Aspect-aware 2D geometry, main-compatible rounding/ties and explicit quality rejection. */
export const FACE_SHAPE_SCORER_VERSION = "0.3.0";

/**
 * Main-compatible canonical order, also used to resolve equal scores.
 */
const CANONICAL_SHAPES: Exclude<FaceShape, "unknown">[] = [
  "round",
  "square",
  "oval",
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
 * Build geometry signals, originally ported from VisuTry's buildGeometrySignals().
 */
export function classifyJawProfile(value: unknown): "tapered" | "strong" | "balanced" | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value <= 0.78 ? "tapered" : value >= 0.94 ? "strong" : "balanced";
}

export function classifyUpperFaceProfile(value: unknown): "narrower" | "broad" | "balanced" | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value < 0.84 ? "narrower" : value > 0.92 ? "broad" : "balanced";
}

export function buildGeometrySignals(
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
    classifyUpperFaceProfile(ratios.foreheadToCheekWidth) === "broad"
      ? "Forehead width is close to cheekbone width"
      : "Cheekbones read wider than the upper face";
  const shapeSignal = shape.charAt(0).toUpperCase() + shape.slice(1) + " shape supported by measured proportions";

  return [shapeSignal, lengthSignal, jawSignal, upperSignal];
}

/**
 * Compute raw integer scores for all 7 face shapes from visutry ratios.
 * Shared by classifyFaceGeometry and getAllScores to prevent divergence.
 */
function computeAllScores(ratios: NonNullable<FaceMetrics["visutry"]>): Record<string, number> {
  const scores: Record<string, number> = {
    round: 0, square: 0, oval: 0, heart: 0, diamond: 0, oblong: 0, triangle: 0,
  };

  const { faceAspectRatio, jawToCheekWidth, foreheadToCheekWidth } = ratios;

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

/**
 * classifyFaceGeometry, originally ported from VisuTry's classifier.
 *
 * Uses integer if/else scoring on three key ratios:
 *   - faceAspectRatio (H/W, 2D)
 *   - jawToCheekWidth
 *   - foreheadToCheekWidth
 *
 * Confidence: clamp(0.56 + best.score * 0.065 + margin * 0.035, 0.58, 0.93).
 * This low-level function requires valid ratios and throws for invalid values;
 * use FaceShapeScorer for geometry/quality rejection with an unknown result.
 */
export function classifyFaceGeometry(ratios: NonNullable<FaceMetrics["visutry"]>): {
  shape: Exclude<FaceShape, "unknown">;
  alternatives: Exclude<FaceShape, "unknown">[];
  confidence: number;
  signals: string[];
} {
  if (Object.values(ratios).some((value) => !Number.isFinite(value))
    || ratios.faceAspectRatio <= 0 || ratios.cheekToFaceWidth <= 0
    || ratios.jawToCheekWidth < 0 || ratios.foreheadToCheekWidth < 0) {
    throw new RangeError("Face geometry ratios must be finite and non-degenerate.");
  }
  const scores = computeAllScores(ratios);

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
 * The v0.2.0 baseline was ported from VisuTry's classifyFaceGeometry algorithm.
 * It uses if/else integer scoring on 2D ratios, not bell/softmax functions.
 * Historical provenance does not establish parity with the current main site;
 * compare exact source revisions and normalized fixtures before claiming it.
 *
 * Changes to scoring functions, chin interpretation, or frame aggregation
 * require explicit compatibility decisions and regression evidence.
 */
export class FaceShapeScorer {
  private readonly metricsCalculator: FaceMetricsCalculator;
  private readonly qualityGate = new QualityGate();

  constructor(metricsCalculator?: FaceMetricsCalculator) {
    this.metricsCalculator = metricsCalculator ?? new FaceMetricsCalculator();
  }

  /**
   * Score a single face result.
   */
  score(face: NormalizedFaceResult): FaceShapeResult {
    const metrics = this.metricsCalculator.compute(face);
    const gate = this.qualityGate.evaluate({ face, mode: "analysis" });
    if (!gate.passed) return this.unknownResult(metrics, gate.warnings);
    return this.scoreFromMetrics(metrics, gate.warnings);
  }

  /**
   * Score from calculated/aggregated geometry without inventing detector quality.
   * Any caller-supplied warning is blocking. Legacy metrics without explicit
   * geometry validity must be recalculated with their source image dimensions.
   */
  scoreFromMetrics(metrics: FaceMetrics, warnings: FaceQualityWarning[] = []): FaceShapeResult {
    const allWarnings = [...new Set([...warnings, ...getFaceGeometryWarnings(metrics)])];
    if (metrics.geometryValid !== true || !metrics.visutry || allWarnings.length > 0) {
      return this.unknownResult(metrics, allWarnings.length ? allWarnings : ["INVALID_LANDMARKS"]);
    }
    const v = metrics.visutry;

    // --- Classify using the SDK's versioned scoring rules ---
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

    return {
      primary: result.shape,
      candidates,
      confidence: result.confidence,
      metrics,
      warnings: allWarnings,
      signals: result.signals,
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
    const warnings = [...new Set(frames.flatMap((face) => this.qualityGate.evaluate({ face, mode: "analysis" }).warnings))];
    return this.scoreFromMetrics(metrics, warnings);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Get raw integer scores for all 7 shapes using the shared SDK scoring function.
   */
  private getAllScores(v: NonNullable<FaceMetrics["visutry"]>): Record<string, number> {
    return computeAllScores(v);
  }

  private unknownResult(
    metrics?: FaceMetrics,
    warnings: FaceQualityWarning[] = ["LOW_CONFIDENCE"],
  ): FaceShapeResult {
    return {
      primary: "unknown",
      candidates: [],
      confidence: 0,
      metrics: metrics ?? this.metricsCalculator.aggregate([]),
      warnings: [...new Set(warnings)],
      signals: [],
      version: FACE_SHAPE_SCORER_VERSION,
    };
  }
}
