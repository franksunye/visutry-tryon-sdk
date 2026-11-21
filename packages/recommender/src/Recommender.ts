import type {
  FaceShape,
  FaceShapeResult,
  GlassesItem,
  GlassesShape,
  RecommendationInput,
  RecommendedGlasses,
  UserPreferences,
} from "@visutry/tryon-core";
import { FACE_SHAPE_FRAME_MATCH, MAX_RAW_SCORE, SCORE_WEIGHTS } from "./constants.js";
import { isPositiveFinite, recommendSize } from "./sizing.js";
import type { SizeRecommendation } from "./sizing.js";

/** Use the core's validity contract; confidence is not an accuracy threshold. */
function usableFaceShape(result?: FaceShapeResult): FaceShape {
  if (
    !result ||
    result.metrics?.geometryValid !== true ||
    !Array.isArray(result.warnings) ||
    result.warnings.length > 0 ||
    (result.metrics.geometryWarnings?.length ?? 0) > 0 ||
    !Number.isFinite(result.confidence) ||
    result.confidence <= 0 ||
    result.confidence > 1 ||
    !Object.prototype.hasOwnProperty.call(FACE_SHAPE_FRAME_MATCH, result.primary)
  ) {
    return "unknown";
  }
  return result.primary;
}

/**
 * Shape-match contribution (spec §16.5):
 *  - face shape known + frame in the match table -> 40
 *  - face shape `unknown`                         -> 20 (neutral medium)
 *  - face shape known + frame not in the table    -> 0
 */
function faceShapeMatchScore(primary: FaceShape, shape: GlassesShape): number {
  if (primary === "unknown") return SCORE_WEIGHTS.shape / 2;
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
 * A missing or invalid catalog dimension receives a neutral half of its
 * component weight. The input measurements were validated by recommendSize;
 * they are host assertions, not SDK-verified physical fit.
 */
function scoreSize(
  item: GlassesItem,
  size: Extract<SizeRecommendation, { status: "available" }>,
): ComponentResult {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const dims = item.dimensions;
  const frameWidthMm = dims?.frameWidthMm;
  const lensWidthMm = dims?.lensWidthMm;
  const hasFrameWidth = isPositiveFinite(frameWidthMm);
  const hasLensWidth = isPositiveFinite(lensWidthMm);

  if (!hasFrameWidth && !hasLensWidth) {
    return {
      score: SCORE_WEIGHTS.size / 2,
      reasons,
      cautions: ["Valid glasses dimensions unavailable; size rules use a neutral weight."],
    };
  }

  let score = 0;
  const faceWidthRounded = Math.round(size.faceWidthMm);

  // --- Frame width fit (max 15) ---
  if (hasFrameWidth) {
    const diff = Math.abs(frameWidthMm - size.idealFrameWidthMm);
    if (diff <= 10) {
      score += 15;
      reasons.push(
        `Frame width ${frameWidthMm}mm is within the 10mm rule tolerance of the supplied face width (${faceWidthRounded}mm).`,
      );
    } else if (diff <= 20) {
      score += 8;
      cautions.push(
        `Frame width ${frameWidthMm}mm is ~${Math.round(diff)}mm away from the supplied face width (${faceWidthRounded}mm).`,
      );
    } else {
      cautions.push(
        `Frame width ${frameWidthMm}mm is outside the 20mm rule tolerance for the supplied face width (${faceWidthRounded}mm).`,
      );
    }
  } else {
    score += SCORE_WEIGHTS.size / 4;
    cautions.push("Valid frame width unavailable; frame-width rules use a neutral weight.");
  }

  // --- Lens width fit (max 15) ---
  if (hasLensWidth) {
    const [lo, hi] = size.lensWidthRange;
    if (lensWidthMm >= lo && lensWidthMm <= hi) {
      score += 15;
      reasons.push(
        `Lens width ${lensWidthMm}mm is within the rule's ${lo}-${hi}mm range for the ${size.tier} face-width tier.`,
      );
    } else {
      const dist = lensWidthMm < lo ? lo - lensWidthMm : lensWidthMm - hi;
      if (dist <= 3) {
        score += 8;
        cautions.push(
          `Lens width ${lensWidthMm}mm is slightly outside the rule's ${lo}-${hi}mm range.`,
        );
      } else if (lensWidthMm < lo) {
        cautions.push(
          `Lens width ${lensWidthMm}mm is below the rule's ${lo}-${hi}mm range for the ${size.tier} face-width tier.`,
        );
      } else {
        cautions.push(
          `Lens width ${lensWidthMm}mm is above the rule's ${lo}-${hi}mm range for the ${size.tier} face-width tier.`,
        );
      }
    }
  } else {
    score += SCORE_WEIGHTS.size / 4;
    cautions.push("Valid lens width unavailable; lens-width rules use a neutral weight.");
  }

  // --- Supplementary caution from eye-center distance (not scored) ---
  if (
    hasLensWidth &&
    size.eyeCenterDistanceMm !== undefined &&
    lensWidthMm > size.eyeCenterDistanceMm
  ) {
    cautions.push(
      `Lens width ${lensWidthMm}mm exceeds the supplied eye-center distance (${Math.round(size.eyeCenterDistanceMm)}mm).`,
    );
  }

  return { score, reasons, cautions };
}

/** Color / material preference contribution (max 10): 5 material + 5 color. */
function scoreColorMaterial(item: GlassesItem, prefs?: UserPreferences): ComponentResult {
  const reasons: string[] = [];
  let score = 0;

  if (prefs?.preferredMaterials?.length && item.material) {
    const mat = item.material;
    if (prefs.preferredMaterials.some((m) => m.toLowerCase() === mat.toLowerCase())) {
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
 * Ranks inventory using an optional valid face-shape result, explicit physical
 * measurements and user preferences. Missing/rejected face analysis and absent
 * physical measurements contribute neutral weights, with an explanation.
 * Scores are rule rankings, not probabilities or verified physical fit.
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
    const { faceShape, measurements, preferences, inventory } = input;
    if (!inventory || inventory.length === 0) return [];

    const primary = usableFaceShape(faceShape);
    const size = recommendSize(measurements);
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
        reasons.push("Ranked without face-shape personalization; a neutral shape weight is used.");
        cautions.push(
          "Face analysis is missing, unknown, or rejected; face-shape rules were not applied.",
        );
      } else if (baseShape === SCORE_WEIGHTS.shape) {
        reasons.push(
          `Frame shape "${item.shapeCategory}" matches the heuristic rule table for a ${primary} face.`,
        );
      } else if (baseShape === 0) {
        cautions.push(
          `Frame shape "${item.shapeCategory}" is not selected by the heuristic rule table for a ${primary} face.`,
        );
      }

      // --- Size (max 30) ---
      if (size.status === "available") {
        const sizeRes = scoreSize(item, size);
        raw += sizeRes.score;
        reasons.push(...sizeRes.reasons);
        cautions.push(...sizeRes.cautions);
      } else {
        raw += SCORE_WEIGHTS.size / 2;
        cautions.push(
          size.reason === "invalid-measurements"
            ? "Physical measurements are invalid; size is unavailable and a neutral size weight is used."
            : "Physical measurements not supplied; size is unavailable and a neutral size weight is used.",
        );
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
      // Items with a price get full points (they passed the budget filter).
      // Items without price metadata get partial credit — they're accessible
      // but can't be verified against a budget.
      if (item.price != null) {
        raw += SCORE_WEIGHTS.price;
        if (maxPrice != null) {
          reasons.push(`Priced within your budget (<= ${maxPrice}).`);
        } else {
          reasons.push("Price metadata is available; no budget limit was supplied.");
        }
      } else {
        raw += SCORE_WEIGHTS.price * 0.5;
        reasons.push("Price metadata is unavailable; the price component uses a neutral weight.");
        if (maxPrice != null) {
          cautions.push("The item's price is unknown; it cannot be verified against your budget.");
        }
      }

      const score = clamp01(raw / MAX_RAW_SCORE);
      results.push({
        item,
        score: roundScore(score),
        faceShapeApplied: primary !== "unknown",
        size: { ...size },
        reasons,
        cautions: cautions.length > 0 ? cautions : undefined,
      });
    }

    // Sort by score descending; stable for ties (preserves inventory order).
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
