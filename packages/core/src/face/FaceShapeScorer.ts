import type {
  FaceMetrics,
  FaceQualityWarning,
  FaceShape,
  FaceShapeResult,
  NormalizedFaceResult,
} from "../types/index.js";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";
import { clamp01, softmax } from "../utils/math.js";

export const FACE_SHAPE_SCORER_VERSION = "1.0.0";

/** Gaussian membership: 1 at `center`, falls off with `sigma`. */
function bell(value: number, center: number, sigma: number): number {
  if (sigma <= 0) return value === center ? 1 : 0;
  const d = (value - center) / sigma;
  return Math.exp(-0.5 * d * d);
}

/** Trapezoidal membership: full inside [lo,hi], linear ramps at edges. */
function trap(value: number, lo: number, hi: number, ramp = 0.05): number {
  if (value < lo - ramp || value > hi + ramp) return 0;
  if (value >= lo && value <= hi) return 1;
  if (value < lo) return (value - (lo - ramp)) / ramp;
  return (hi + ramp - value) / ramp;
}

interface ShapeScoreContext {
  whr: number; // widthHeightRatio
  jcr: number; // jawCheekRatio
  chinType: FaceMetrics["chinType"];
  /** jawWidth / eyeOuterDistance — low => upper face wider (heart-ish). */
  jawToEyeOuter: number;
  /** eyeOuterDistance / cheekboneWidth — <1 => cheekbone wider than eye span. */
  eyeOuterToCheek: number;
}

function buildContext(m: FaceMetrics): ShapeScoreContext {
  const eyeOuter = m.eyeOuterDistance || 1e-6;
  const cheek = m.cheekboneWidth || 1e-6;
  return {
    whr: m.widthHeightRatio,
    jcr: m.jawCheekRatio,
    chinType: m.chinType,
    jawToEyeOuter: (m.jawWidth || 0) / eyeOuter,
    eyeOuterToCheek: eyeOuter / cheek,
  };
}

/** Bonus for chin type match: full match=1, compatible=0.5, mismatch=0. */
function chinBonus(actual: FaceMetrics["chinType"], preferred: FaceMetrics["chinType"][]): number {
  if (actual === "unknown") return 0.5;
  if (preferred.includes(actual)) return 1;
  return 0.3;
}

/**
 * Scores face shapes from geometric metrics using independent membership
 * functions per shape, then normalises via softmax to produce top-k candidates.
 *
 * The scorer never issues a single hard if/else verdict (spec §13.3). Every
 * shape receives an independent score; the highest becomes `primary` only when
 * the margin of confidence is sufficient.
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
   * Score from pre-aggregated metrics (multi-frame path).
   */
  scoreFromMetrics(metrics: FaceMetrics, warnings: FaceQualityWarning[] = []): FaceShapeResult {
    const ctx = buildContext(metrics);
    const raw = this.scoreAllShapes(ctx, metrics);
    const probs = softmax(raw.map((s) => s.score), 0.6);

    const ranked = raw
      .map((s, i) => ({ ...s, score: probs[i] }))
      .sort((a, b) => b.score - a.score);

    const primary = ranked[0];
    const second = ranked[1];
    const margin = primary.score - (second?.score ?? 0);

    // Confidence blends the score margin with measurement quality (spec §13.5).
    const confidence = clamp01(margin + metrics.measurementQuality * 0.25 - 0.05);

    const allWarnings = [...warnings];
    let primaryShape: FaceShape = primary.shape;
    if (confidence < 0.45) {
      primaryShape = "unknown";
      if (!allWarnings.includes("LOW_CONFIDENCE")) allWarnings.push("LOW_CONFIDENCE");
    }

    return {
      primary: primaryShape,
      candidates: ranked.map((c) => ({
        shape: c.shape,
        score: Math.round(c.score * 1000) / 1000,
        reasons: c.reasons,
      })),
      confidence: Math.round(confidence * 1000) / 1000,
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
  // Per-shape scoring
  // -----------------------------------------------------------------------

  private scoreAllShapes(ctx: ShapeScoreContext, _m: FaceMetrics): Array<{
    shape: FaceShape;
    score: number;
    reasons: string[];
  }> {
    return [
      this.scoreOval(ctx),
      this.scoreRound(ctx),
      this.scoreSquare(ctx),
      this.scoreHeart(ctx),
      this.scoreDiamond(ctx),
      this.scoreOblong(ctx),
    ];
  }

  /** oval: face length slightly > width, jaw slightly < cheek, rounded chin. */
  private scoreOval(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const whrScore = bell(ctx.whr, 0.8, 0.08);
    const jcrScore = bell(ctx.jcr, 0.8, 0.08);
    const chinScore = chinBonus(ctx.chinType, ["rounded"]);
    const score = whrScore * 0.4 + jcrScore * 0.35 + chinScore * 0.25;
    return {
      shape: "oval",
      score,
      reasons: [
        `width/height ${ctx.whr.toFixed(2)} (ideal ~0.80)`,
        `jaw/cheek ${ctx.jcr.toFixed(2)} (slightly tapered)`,
        `chin ${ctx.chinType}`,
      ],
    };
  }

  /** round: width ≈ height, broad jaw, rounded chin. */
  private scoreRound(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const whrScore = bell(ctx.whr, 0.96, 0.06);
    const jcrScore = bell(ctx.jcr, 0.91, 0.07);
    const chinScore = chinBonus(ctx.chinType, ["rounded"]);
    const score = whrScore * 0.4 + jcrScore * 0.3 + chinScore * 0.3;
    return {
      shape: "round",
      score,
      reasons: [
        `width/height ${ctx.whr.toFixed(2)} (near 1.0)`,
        `jaw/cheek ${ctx.jcr.toFixed(2)} (broad)`,
        `chin ${ctx.chinType}`,
      ],
    };
  }

  /** square: jaw ≈ cheek, square chin, medium proportions. */
  private scoreSquare(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const jcrScore = trap(ctx.jcr, 0.86, 1.0, 0.04);
    const whrScore = bell(ctx.whr, 0.85, 0.07);
    const chinScore = chinBonus(ctx.chinType, ["square"]);
    const score = jcrScore * 0.45 + whrScore * 0.25 + chinScore * 0.3;
    return {
      shape: "square",
      score,
      reasons: [
        `jaw/cheek ${ctx.jcr.toFixed(2)} (strong jaw)`,
        `width/height ${ctx.whr.toFixed(2)} (medium)`,
        `chin ${ctx.chinType}`,
      ],
    };
  }

  /** heart: upper face wider, jaw narrows, pointed chin. */
  private scoreHeart(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const taperScore = bell(ctx.jawToEyeOuter, 0.58, 0.08); // jaw much narrower than eye span
    const jcrScore = bell(ctx.jcr, 0.58, 0.08);
    const chinScore = chinBonus(ctx.chinType, ["pointed"]);
    const score = taperScore * 0.4 + jcrScore * 0.3 + chinScore * 0.3;
    return {
      shape: "heart",
      score,
      reasons: [
        `jaw/eyeOuter ${ctx.jawToEyeOuter.toFixed(2)} (upper wider)`,
        `jaw/cheek ${ctx.jcr.toFixed(2)} (narrowing)`,
        `chin ${ctx.chinType}`,
      ],
    };
  }

  /** diamond: cheekbone widest, forehead & jaw narrower, pointed chin. */
  private scoreDiamond(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const cheekDominant = bell(ctx.eyeOuterToCheek, 0.7, 0.08); // eye span < cheek
    const jcrScore = bell(ctx.jcr, 0.64, 0.08); // jaw narrower than cheek
    const chinScore = chinBonus(ctx.chinType, ["pointed"]);
    const score = cheekDominant * 0.4 + jcrScore * 0.3 + chinScore * 0.3;
    return {
      shape: "diamond",
      score,
      reasons: [
        `eyeOuter/cheek ${ctx.eyeOuterToCheek.toFixed(2)} (cheekbone widest)`,
        `jaw/cheek ${ctx.jcr.toFixed(2)} (narrow)`,
        `chin ${ctx.chinType}`,
      ],
    };
  }

  /** oblong: height >> width, similar widths, low WHR. */
  private scoreOblong(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const whrScore = bell(ctx.whr, 0.66, 0.05);
    const uniformScore = bell(ctx.jcr, 0.82, 0.08); // jaw not too different from cheek
    const score = whrScore * 0.6 + uniformScore * 0.4;
    return {
      shape: "oblong",
      score,
      reasons: [
        `width/height ${ctx.whr.toFixed(2)} (elongated)`,
        `jaw/cheek ${ctx.jcr.toFixed(2)} (uniform widths)`,
      ],
    };
  }

  private unknownResult(): FaceShapeResult {
    return {
      primary: "unknown",
      candidates: [],
      confidence: 0,
      metrics: {
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
      warnings: ["LOW_CONFIDENCE", "MISSING_KEY_POINTS"],
      version: FACE_SHAPE_SCORER_VERSION,
    };
  }
}
