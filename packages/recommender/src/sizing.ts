import type { FaceMetrics } from "@visutry/tryon-core";
import {
  AVERAGE_EYE_CENTER_DISTANCE_MM,
  AVERAGE_FACE_WIDTH_MM,
  FACE_WIDTH_TIER_THRESHOLDS,
  LENS_WIDTH_RANGES,
  MM_PER_NORM,
  type FaceSizeTier,
} from "./constants.js";

/**
 * Convert the core's normalized `faceWidth` to an approximate millimeter value.
 *
 * The core reports `faceWidth` (cheekbone width, with an eye-outer fallback) in
 * normalized image coordinates. We convert it using the calibration constant
 * `MM_PER_NORM = 140 / 0.3` (see `constants.ts`). When the metric is missing or
 * invalid we fall back to the population average (140mm) so downstream sizing
 * never breaks.
 */
export function estimateFaceWidthMm(metrics: FaceMetrics): number {
  const norm = metrics?.faceWidth;
  if (typeof norm !== "number" || !Number.isFinite(norm) || norm <= 0) {
    return AVERAGE_FACE_WIDTH_MM;
  }
  return norm * MM_PER_NORM;
}

/**
 * Convert the core's normalized `eyeCenterDistance` to millimeters using the
 * same calibration factor as {@link estimateFaceWidthMm}. Falls back to ~63mm.
 *
 * Used as a supplementary signal (e.g. flagging lenses wider than the inter-eye
 * distance) — it does not drive the size tier on its own.
 */
export function estimateEyeCenterDistanceMm(metrics: FaceMetrics): number {
  const norm = metrics?.eyeCenterDistance;
  if (typeof norm !== "number" || !Number.isFinite(norm) || norm <= 0) {
    return AVERAGE_EYE_CENTER_DISTANCE_MM;
  }
  return norm * MM_PER_NORM;
}

export interface SizeRecommendation {
  tier: FaceSizeTier;
  /** Estimated face width in mm. */
  faceWidthMm: number;
  /** Estimated inter-eye distance in mm (supplementary signal). */
  eyeCenterDistanceMm: number;
  /** Recommended lens-width range [min, max] in mm for this tier. */
  lensWidthRange: readonly [number, number];
  /** Ideal total frame width in mm (~ face width; ±10mm tolerance in scorer). */
  idealFrameWidthMm: number;
}

/**
 * Derive a size recommendation from face metrics (spec §16.4).
 *
 * Tiers are driven by `faceWidth` (mm):
 *  - small:  < 130mm  -> lens width 38-46mm
 *  - medium: 130-145mm -> lens width 46-52mm
 *  - large:  > 145mm  -> lens width 52-58mm
 *
 * The ideal frame width tracks the face width (a ±10mm tolerance is enforced in
 * the scorer). `eyeCenterDistance` is exposed as a supplementary signal used to
 * flag lens-width cautions.
 */
export function recommendSize(metrics: FaceMetrics): SizeRecommendation {
  const faceWidthMm = estimateFaceWidthMm(metrics);
  const eyeCenterDistanceMm = estimateEyeCenterDistanceMm(metrics);

  let tier: FaceSizeTier;
  if (faceWidthMm < FACE_WIDTH_TIER_THRESHOLDS.small) {
    tier = "small";
  } else if (faceWidthMm <= FACE_WIDTH_TIER_THRESHOLDS.medium) {
    tier = "medium";
  } else {
    tier = "large";
  }

  return {
    tier,
    faceWidthMm,
    eyeCenterDistanceMm,
    lensWidthRange: LENS_WIDTH_RANGES[tier],
    idealFrameWidthMm: faceWidthMm,
  };
}
