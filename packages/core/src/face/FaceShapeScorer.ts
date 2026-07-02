import type {
  FaceMetrics,
  FaceQualityWarning,
  FaceShape,
  FaceShapeResult,
  NormalizedFaceResult,
} from "../types/index.js";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";
import { clamp01, softmax } from "../utils/math.js";

export const FACE_SHAPE_SCORER_VERSION = "1.2.0";

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
  /** foreheadWidth / cheekboneWidth — low => forehead narrower (diamond/triangle). */
  fcr: number | undefined;
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
    fcr: m.foreheadCheekRatio,
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
    // Lower temperature = sharper distribution = top candidate gets more mass.
    const probs = softmax(raw.map((s) => s.score), 0.4);

    const ranked = raw
      .map((s, i) => ({ ...s, score: probs[i] }))
      .sort((a, b) => b.score - a.score);

    const primary = ranked[0];
    const second = ranked[1];
    const margin = primary.score - (second?.score ?? 0);

    // Confidence blends the score margin with measurement quality.
    // With 7 candidates, softmax margins are inherently smaller, so we
    // weight measurementQuality more heavily and use a gentler base.
    const confidence = clamp01(margin * 1.5 + metrics.measurementQuality * 0.35);

    const allWarnings = [...warnings];
    let primaryShape: FaceShape = primary.shape;
    if (confidence < 0.35) {
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
      this.scoreTriangle(ctx),
    ];
  }

  /** oval: face length slightly > width, jaw slightly < cheek, rounded chin. */
  private scoreOval(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const whrScore = bell(ctx.whr, 0.78, 0.10);
    const jcrScore = bell(ctx.jcr, 0.80, 0.10);
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
    // Center at 1.0 (width = height), wide sigma to cover 0.85-1.15 range.
    const whrScore = bell(ctx.whr, 1.0, 0.10);
    const jcrScore = bell(ctx.jcr, 0.91, 0.10);
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
    const jcrScore = trap(ctx.jcr, 0.86, 1.05, 0.06);
    const whrScore = bell(ctx.whr, 0.88, 0.10);
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
    // Use foreheadCheekRatio when available for more precise classification.
    // Heart: forehead ≥ cheek (fcr high) + jaw narrows (jcr low).
    const fcrScore = ctx.fcr !== undefined ? bell(ctx.fcr, 0.92, 0.10) : 0.5;
    const taperScore = bell(ctx.jawToEyeOuter, 0.58, 0.10); // jaw much narrower than eye span
    const jcrScore = bell(ctx.jcr, 0.58, 0.10);
    const chinScore = chinBonus(ctx.chinType, ["pointed"]);
    const score = (ctx.fcr !== undefined ? fcrScore * 0.2 + taperScore * 0.2 : taperScore * 0.4)
      + jcrScore * 0.3 + chinScore * 0.3;
    return {
      shape: "heart",
      score,
      reasons: [
        `jaw/eyeOuter ${ctx.jawToEyeOuter.toFixed(2)} (upper wider)`,
        `jaw/cheek ${ctx.jcr.toFixed(2)} (narrowing)`,
        ctx.fcr !== undefined ? `forehead/cheek ${ctx.fcr.toFixed(2)} (broad forehead)` : `chin ${ctx.chinType}`,
        `chin ${ctx.chinType}`,
      ],
    };
  }

  /** diamond: cheekbone widest, forehead & jaw narrower, pointed chin. */
  private scoreDiamond(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    // Use foreheadCheekRatio when available: diamond has narrow forehead (fcr low).
    const fcrScore = ctx.fcr !== undefined ? bell(ctx.fcr, 0.78, 0.08) : 0.5;
    const cheekDominant = bell(ctx.eyeOuterToCheek, 0.7, 0.10); // eye span < cheek
    const jcrScore = bell(ctx.jcr, 0.64, 0.10); // jaw narrower than cheek
    const chinScore = chinBonus(ctx.chinType, ["pointed"]);
    const score = (ctx.fcr !== undefined ? fcrScore * 0.2 + cheekDominant * 0.2 : cheekDominant * 0.4)
      + jcrScore * 0.3 + chinScore * 0.3;
    return {
      shape: "diamond",
      score,
      reasons: [
        `eyeOuter/cheek ${ctx.eyeOuterToCheek.toFixed(2)} (cheekbone widest)`,
        `jaw/cheek ${ctx.jcr.toFixed(2)} (narrow)`,
        ctx.fcr !== undefined ? `forehead/cheek ${ctx.fcr.toFixed(2)} (narrow forehead)` : `chin ${ctx.chinType}`,
        `chin ${ctx.chinType}`,
      ],
    };
  }

  /** oblong: height >> width, similar widths, low WHR. */
  private scoreOblong(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    const whrScore = bell(ctx.whr, 0.66, 0.07);
    const uniformScore = bell(ctx.jcr, 0.82, 0.10); // jaw not too different from cheek
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

  /** triangle: jaw wider than cheek, forehead narrower, broad chin. */
  private scoreTriangle(ctx: ShapeScoreContext): { shape: FaceShape; score: number; reasons: string[] } {
    // Triangle: jaw ≥ cheek (jcr high) + forehead < cheek (fcr low).
    const jcrScore = trap(ctx.jcr, 0.92, 1.15, 0.06);
    const fcrScore = ctx.fcr !== undefined ? bell(ctx.fcr, 0.82, 0.08) : 0.5;
    const chinScore = chinBonus(ctx.chinType, ["square", "rounded"]);
    const score = (ctx.fcr !== undefined ? jcrScore * 0.35 + fcrScore * 0.35 : jcrScore * 0.6)
      + chinScore * (ctx.fcr !== undefined ? 0.3 : 0.4);
    return {
      shape: "triangle",
      score,
      reasons: [
        `jaw/cheek ${ctx.jcr.toFixed(2)} (jaw dominant)`,
        ctx.fcr !== undefined ? `forehead/cheek ${ctx.fcr.toFixed(2)} (narrow forehead)` : `chin ${ctx.chinType}`,
        `chin ${ctx.chinType}`,
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
