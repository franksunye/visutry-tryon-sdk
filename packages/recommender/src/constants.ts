import type { FaceShape, GlassesShape } from "@visutry/tryon-core";

// ---------------------------------------------------------------------------
// Face-shape x frame-shape recommendation table (spec §16.3)
// ---------------------------------------------------------------------------

/**
 * Face-shape x frame-shape recommendation table (spec §16.3).
 *
 * Heuristic styling rules for each usable face-shape classification. These
 * associations are not a validated model of attractiveness or physical fit:
 *  - oval    -> rectangle, round, aviator, browline
 *  - round   -> rectangle, square, browline       (angular frames elongate)
 *  - square  -> round, oval, cat-eye              (soften the angles)
 *  - heart   -> rectangle, aviator, browline      (balance the lower face)
 *  - diamond -> oval, cat-eye, browline           (soften the cheekbones)
 *  - oblong  -> round, oval                        (add width)
 *  - triangle -> aviator, cat-eye, round           (balance wide jaw)
 *  - unknown -> (none) — the scorer awards every frame a neutral medium weight
 *
 * The table is exposed so callers can render a "why this frame?" explanation or
 * build alternative UIs on top of the same rule set.
 */
export const FACE_SHAPE_FRAME_MATCH: Readonly<Record<FaceShape, readonly GlassesShape[]>> = {
  oval: ["rectangle", "round", "aviator", "browline"],
  round: ["rectangle", "square", "browline"],
  square: ["round", "oval", "cat-eye"],
  heart: ["rectangle", "aviator", "browline"],
  diamond: ["oval", "cat-eye", "browline"],
  oblong: ["round", "oval"],
  triangle: ["aviator", "cat-eye", "round"],
  unknown: [],
};

// ---------------------------------------------------------------------------
// Scoring weights (spec §16.5)
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = {
  /** Shape compatibility (face shape x frame shape). Max 40. */
  shape: 40,
  /** Size fit (frame width + lens width). Max 30. */
  size: 30,
  /** Brand preference. Max 10. */
  brand: 10,
  /** Color / material preference. Max 10. */
  colorMaterial: 10,
  /** Price within budget. Max 10. */
  price: 10,
} as const;

/** Sum of all scoring components; raw scores are normalized by this value. */
export const MAX_RAW_SCORE =
  SCORE_WEIGHTS.shape +
  SCORE_WEIGHTS.size +
  SCORE_WEIGHTS.brand +
  SCORE_WEIGHTS.colorMaterial +
  SCORE_WEIGHTS.price; // 100

// ---------------------------------------------------------------------------
// Size tiers (spec §16.4)
// ---------------------------------------------------------------------------

export type FaceSizeTier = "small" | "medium" | "large";

/** Heuristic lens-width ranges for host-supplied physical face-width tiers. */
export const LENS_WIDTH_RANGES: Readonly<Record<FaceSizeTier, readonly [number, number]>> = {
  small: [38, 46],
  medium: [46, 52],
  large: [52, 58],
};

/** Face-width thresholds (mm) delimiting the size tiers. */
export const FACE_WIDTH_TIER_THRESHOLDS = {
  /** Faces narrower than this (mm) are "small". */
  small: 130,
  /** Faces wider than this (mm) are "large"; up to and including this are "medium". */
  medium: 145,
} as const;
