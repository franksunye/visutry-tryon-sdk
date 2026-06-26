import type {
  FaceMetrics,
  FaceShape,
  GlassesItem,
  GlassesShape,
  RecommendationInput,
  RecommendedGlasses,
  UserPreferences,
} from "@visutry/tryon-core";
import {
  FACE_SHAPE_FRAME_MATCH,
  MAX_RAW_SCORE,
  SCORE_WEIGHTS,
} from "./constants.js";
import { recommendSize } from "./sizing.js";
import type { SizeRecommendation } from "./sizing.js";

/**
 * Shape-match contribution (spec §16.5):
 *  - face shape known + frame in the match table -> 40
 *  - face shape `unknown`                         -> 20 (neutral medium)
 *  - face shape known + frame not in the table    -> 0
 */
function faceShapeMatchScore(primary: FaceShape, shape: GlassesShape): number {
  if (primary === "unknown") return 20;
  const recommended = FACE_SHAPE_FRAME_MATCH[primary] ?? [];
  return recommended.includes(shape) ? SCORE_WEIGHTS.shape : 0;
}

interface ComponentResult {
  score: number;
  reasons: string[];
  cautions: string[];
}

/**
 * Size-fit contribution (max 30), split into frame-width fit (15) and
 * lens-width fit (15). Each sub-check is graded perfect / close / poor:
 *  - Frame width: perfect <=10mm off, close <=20mm off, poor otherwise.
 *  - Lens width:  perfect within the tier range, close within +/-3mm, poor otherwise.
 *
 * Items without any dimensions get a neutral middle score (15) plus a caution,
 * so missing metadata never over-penalises a frame we cannot measure.
 * `eyeCenterDistance` is used as a supplementary (non-scored) caution signal.
 */
function scoreSize(item: GlassesItem, size: SizeRecommendation): ComponentResult {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const dims = item.dimensions;

  if (!dims || (dims.frameWidthMm == null && dims.lensWidthMm == null)) {
    return {
      score: 15,
      reasons,
      cautions: ["Glasses dimensions not available; size fit cannot be verified."],
    };
  }

  let score = 0;
  const faceWidthRounded = Math.round(size.faceWidthMm);

  // --- Frame width fit (max 15) ---
  if (dims.frameWidthMm != null) {
    const diff = Math.abs(dims.frameWidthMm - size.idealFrameWidthMm);
    if (diff <= 10) {
      score += 15;
      reasons.push(
        `Frame width ${dims.frameWidthMm}mm matches face width ~${faceWidthRounded}mm.`,
      );
    } else if (diff <= 20) {
      score += 8;
      cautions.push(
        `Frame width ${dims.frameWidthMm}mm is ~${Math.round(diff)}mm off your face width (~${faceWidthRounded}mm).`,
      );
    } else {
      cautions.push(
        `Frame width ${dims.frameWidthMm}mm is a poor match for face width ~${faceWidthRounded}mm (off by ~${Math.round(diff)}mm).`,
      );
    }
  }

  // --- Lens width fit (max 15) ---
  if (dims.lensWidthMm != null) {
    const [lo, hi] = size.lensWidthRange;
    if (dims.lensWidthMm >= lo && dims.lensWidthMm <= hi) {
      score += 15;
      reasons.push(
        `Lens width ${dims.lensWidthMm}mm is within the recommended ${lo}-${hi}mm range for a ${size.tier} face.`,
      );
    } else {
      const dist =
        dims.lensWidthMm < lo ? lo - dims.lensWidthMm : dims.lensWidthMm - hi;
      if (dist <= 3) {
        score += 8;
        cautions.push(
          `Lens width ${dims.lensWidthMm}mm is slightly outside the recommended ${lo}-${hi}mm range.`,
        );
      } else if (dims.lensWidthMm < lo) {
        cautions.push(
          `Lens width ${dims.lensWidthMm}mm is smaller than the recommended ${lo}-${hi}mm range for a ${size.tier} face.`,
        );
      } else {
        cautions.push(
          `Lens width ${dims.lensWidthMm}mm is larger than the recommended ${lo}-${hi}mm range for a ${size.tier} face.`,
        );
      }
    }
  }

  // --- Supplementary caution from eye-center distance (not scored) ---
  if (
    dims.lensWidthMm != null &&
    size.eyeCenterDistanceMm > 0 &&
    dims.lensWidthMm > size.eyeCenterDistanceMm
  ) {
    cautions.push(
      `Lens width ${dims.lensWidthMm}mm exceeds the estimated inter-eye distance (~${Math.round(size.eyeCenterDistanceMm)}mm).`,
    );
  }

  return { score, reasons, cautions };
}

/** Color / material preference contribution (max 10): 5 material + 5 color. */
function scoreColorMaterial(
  item: GlassesItem,
  prefs?: UserPreferences,
): ComponentResult {
  const reasons: string[] = [];
  let score = 0;

  if (prefs?.preferredMaterials?.length && item.material) {
    const mat = item.material;
    if (
      prefs.preferredMaterials.some((m) => m.toLowerCase() === mat.toLowerCase())
    ) {
      score += 5;
      reasons.push(`Made of preferred material "${mat}".`);
    }
  }

  if (prefs?.preferredColors?.length && item.colors?.length) {
    const matched = item.colors.filter((c) =>
      prefs.preferredColors!.some((pc) => pc.toLowerCase() === c.toLowerCase()),
    );
    if (matched.length) {
      score += 5;
      reasons.push(
        `Available in preferred color${matched.length > 1 ? "s" : ""} ${matched
          .map((c) => `"${c}"`)
          .join(", ")}.`,
      );
    }
  }

  return { score, reasons, cautions: [] };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function roundScore(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Glasses recommendation engine (spec §16).
 *
 * Scores every inventory item against the detected face shape, the estimated
 * face size and the user preferences, then returns the items sorted by score
 * (descending). Each result carries human-readable `reasons` (why it fits) and
 * optional `cautions` (e.g. size mismatch, shape not recommended).
 *
 * Scoring (raw, 0..100, then normalised to [0,1]):
 *  - shape match         : 40 (match) / 20 (unknown face) / 0 (no match)
 *  - size fit            : 30 (frame width 15 + lens width 15)
 *  - brand preference    : 10
 *  - color/material pref.: 10 (5 material + 5 color)
 *  - price within budget : 10  (items over `maxPrice` are filtered out)
 *
 * User `preferredShapes` add up to +20 to the shape component (capped at 40),
 * so a frame the user explicitly likes is lifted to at least a medium weight
 * even when it does not match the face-shape table.
 */
export class Recommender {
  recommend(input: RecommendationInput): RecommendedGlasses[] {
    const { faceShape, faceMetrics, preferences, inventory } = input;
    if (!inventory || inventory.length === 0) return [];

    const primary: FaceShape = faceShape?.primary ?? "unknown";
    const metrics: FaceMetrics | undefined = faceMetrics ?? faceShape?.metrics;
    const size: SizeRecommendation | null = metrics ? recommendSize(metrics) : null;
    const maxPrice = preferences?.maxPrice;

    const results: RecommendedGlasses[] = [];

    for (const item of inventory) {
      // Hard price filter — `maxPrice` is a budget constraint (spec §16.5).
      if (maxPrice != null && item.price != null && item.price > maxPrice) {
        continue;
      }

      const reasons: string[] = [];
      const cautions: string[] = [];
      let raw = 0;

      // --- Shape (max 40) ---
      const baseShape = faceShapeMatchScore(primary, item.shapeCategory);
      let shapeScore = baseShape;
      if (
        preferences?.preferredShapes?.length &&
        preferences.preferredShapes.includes(item.shapeCategory)
      ) {
        shapeScore = Math.min(SCORE_WEIGHTS.shape, shapeScore + 20);
        reasons.push(`Matches your preferred frame shape "${item.shapeCategory}".`);
      }
      raw += shapeScore;

      if (primary === "unknown") {
        reasons.push("Face shape is unknown; frame scored with a neutral medium weight.");
      } else if (baseShape === SCORE_WEIGHTS.shape) {
        reasons.push(`Frame shape "${item.shapeCategory}" complements a ${primary} face.`);
      } else if (baseShape === 0) {
        cautions.push(
          `Frame shape "${item.shapeCategory}" is not typically recommended for a ${primary} face.`,
        );
      }

      // --- Size (max 30) ---
      if (size) {
        const sizeRes = scoreSize(item, size);
        raw += sizeRes.score;
        reasons.push(...sizeRes.reasons);
        cautions.push(...sizeRes.cautions);
      } else {
        // No face metrics at all: award a neutral middle score and warn.
        raw += 15;
        cautions.push("Face metrics unavailable; size fit cannot be verified.");
      }

      // --- Brand (max 10) ---
      if (preferences?.brands?.length && item.brand) {
        const brand = item.brand;
        if (preferences.brands.some((b) => b.toLowerCase() === brand.toLowerCase())) {
          raw += SCORE_WEIGHTS.brand;
          reasons.push(`From preferred brand "${brand}".`);
        }
      }

      // --- Color / material (max 10) ---
      const cm = scoreColorMaterial(item, preferences);
      raw += cm.score;
      reasons.push(...cm.reasons);

      // --- Price (max 10) — survivors are within budget (or unconstrained) ---
      raw += SCORE_WEIGHTS.price;
      if (maxPrice != null) {
        reasons.push(`Priced within your budget (<= ${maxPrice}).`);
      }

      const score = clamp01(raw / MAX_RAW_SCORE);
      results.push({
        item,
        score: roundScore(score),
        reasons,
        cautions: cautions.length > 0 ? cautions : undefined,
      });
    }

    // Sort by score descending; stable for ties (preserves inventory order).
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
