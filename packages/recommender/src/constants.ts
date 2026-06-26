import type { FaceShape, GlassesShape } from "@visutry/tryon-core";

// ---------------------------------------------------------------------------
// Face-shape x frame-shape recommendation table (spec §16.3)
// ---------------------------------------------------------------------------

/**
 * Face-shape x frame-shape recommendation table (spec §16.3).
 *
 * For each detected face shape this lists the frame shapes that geometrically
 * complement it:
 *  - oval    -> rectangle, round, aviator, browline
 *  - round   -> rectangle, square, browline       (angular frames elongate)
 *  - square  -> round, oval, cat-eye              (soften the angles)
 *  - heart   -> rectangle, aviator, browline      (balance the lower face)
 *  - diamond -> oval, cat-eye, browline           (soften the cheekbones)
 *  - oblong  -> round, oval                        (add width)
 *  - unknown -> (none) — the scorer awards every frame a neutral medium weight
 *
 * The table is exposed so callers can render a "why this frame?" explanation or
 * build alternative UIs on top of the same rule set.
 */
export const FACE_SHAPE_FRAME_MATCH: Readonly<
  Record<FaceShape, readonly GlassesShape[]>
> = {
  oval: ["rectangle", "round", "aviator", "browline"],
  round: ["rectangle", "square", "browline"],
  square: ["round", "oval", "cat-eye"],
  heart: ["rectangle", "aviator", "browline"],
  diamond: ["oval", "cat-eye", "browline"],
  oblong: ["round", "oval"],
  unknown: [],
};

// ---------------------------------------------------------------------------
// Calibration: normalized face metrics -> millimeters (spec §16.4)
// ---------------------------------------------------------------------------

/**
 * Average adult face width in mm, used as the calibration anchor.
 */
export const AVERAGE_FACE_WIDTH_MM = 140;

/**
 * Normalized `faceWidth` emitted by `@visutry/tryon-core` for an average face.
 *
 * The core's `FaceMetricsCalculator` works in normalized image coordinates
 * (0..1). In the MediaPipe fixture an average face has a cheekbone half-span of
 * 0.15, i.e. `faceWidth = cheekboneWidth = 0.30`. We anchor 0.30 <-> 140mm so
 * every other normalized distance scales by the same factor.
 */
export const AVERAGE_FACE_WIDTH_NORM = 0.3;

/**
 * Millimeters per unit of normalized face width.
 *
 * `mmPerNorm = AVERAGE_FACE_WIDTH_MM / AVERAGE_FACE_WIDTH_NORM = 140 / 0.3
 *             ~= 466.67`.
 *
 * This single factor converts any normalized distance reported by the core
 * (faceWidth, eyeCenterDistance, ...) into an approximate millimeter value.
 */
export const MM_PER_NORM = AVERAGE_FACE_WIDTH_MM / AVERAGE_FACE_WIDTH_NORM;

/**
 * Average adult interpupillary (eye-center) distance in mm, used as a fallback
 * when the core reports no usable `eyeCenterDistance`.
 */
export const AVERAGE_EYE_CENTER_DISTANCE_MM = 63;

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

/** Recommended lens-width range (mm) per face size tier. */
export const LENS_WIDTH_RANGES: Readonly<
  Record<FaceSizeTier, readonly [number, number]>
> = {
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
