import type {
  FaceMetrics,
  PhysicalFaceMeasurements,
  RecommendedGlasses,
} from "@visutry/tryon-core";
import { FACE_WIDTH_TIER_THRESHOLDS, LENS_WIDTH_RANGES, type FaceSizeTier } from "./constants.js";

/**
 * @deprecated Normalized image geometry cannot determine physical face width.
 * Always returns undefined. Pass host-validated physical measurements to
 * `recommendSize` instead; there is no population-average fallback.
 */
export function estimateFaceWidthMm(_metrics: FaceMetrics): undefined {
  return undefined;
}

/**
 * @deprecated Normalized image geometry cannot determine inter-eye distance.
 * Always returns undefined. An optional eye-center distance must be supplied
 * explicitly through `PhysicalFaceMeasurements`; it is never inferred.
 */
export function estimateEyeCenterDistanceMm(_metrics: FaceMetrics): undefined {
  return undefined;
}

/** Physical-input availability and heuristic sizing; not a fit verification. */
export type SizeRecommendation = RecommendedGlasses["size"];

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Apply sizing rules only to explicit physical measurements from the host.
 *
 * `source` records the host's assertion, not SDK-verified provenance. Missing
 * input, invalid source, or any supplied non-positive/non-finite distance makes
 * size unavailable. A missing optional eye-center distance stays missing.
 *
 * The small/medium/large tiers and lens-width ranges are ranking heuristics,
 * not calibrated fit guarantees. Image-space FaceMetrics are never converted.
 */
export function recommendSize(measurements?: PhysicalFaceMeasurements): SizeRecommendation {
  if (measurements == null) {
    return { status: "unavailable", reason: "measurements-required" };
  }

  if (
    (measurements.source !== "measured" && measurements.source !== "calibrated") ||
    !isPositiveFinite(measurements.faceWidthMm) ||
    (measurements.eyeCenterDistanceMm !== undefined &&
      !isPositiveFinite(measurements.eyeCenterDistanceMm))
  ) {
    return { status: "unavailable", reason: "invalid-measurements" };
  }

  const { faceWidthMm, eyeCenterDistanceMm, source } = measurements;

  let tier: FaceSizeTier;
  if (faceWidthMm < FACE_WIDTH_TIER_THRESHOLDS.small) {
    tier = "small";
  } else if (faceWidthMm <= FACE_WIDTH_TIER_THRESHOLDS.medium) {
    tier = "medium";
  } else {
    tier = "large";
  }

  return {
    status: "available",
    source,
    faceWidthMm,
    ...(eyeCenterDistanceMm === undefined ? {} : { eyeCenterDistanceMm }),
    tier,
    lensWidthRange: LENS_WIDTH_RANGES[tier],
    idealFrameWidthMm: faceWidthMm,
  };
}
