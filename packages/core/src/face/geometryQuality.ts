import type { FaceMetrics, FaceQualityWarning, ImageSize, Point3D } from "../types/index.js";
import { MAX_TILT_DEG, MAX_SYMMETRY_OFFSET, MIN_FACE_SPAN } from "./constants.js";

/** Image dimensions must describe a usable 2D coordinate system. */
export function isValidImageSize(size?: ImageSize): size is ImageSize {
  return size != null
    && Number.isFinite(size.width) && size.width > 0
    && Number.isFinite(size.height) && size.height > 0
    && Number.isFinite(size.height / size.width) && size.height / size.width > 0;
}

/** Depth is deliberately excluded: these are 2D photo measurements. */
export function isFinitePoint2D(point?: Point3D): point is Point3D {
  return point != null && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export type FaceGeometryAdvisory = "TILTED_FACE" | "OFF_CENTER_FACE";
type GeometryQualitySignals = Pick<NonNullable<FaceMetrics["visutry"]>, "eyeLineTiltDeg" | "symmetryOffset">;

/** Non-blocking photo advice, separate from rejection warnings. */
export function getFaceGeometryAdvisories(ratios: GeometryQualitySignals): FaceGeometryAdvisory[] {
  const advisories: FaceGeometryAdvisory[] = [];
  if (!Number.isFinite(ratios.eyeLineTiltDeg) || !Number.isFinite(ratios.symmetryOffset)) return advisories;
  if (Math.abs(ratios.eyeLineTiltDeg) > 8) advisories.push("TILTED_FACE");
  if (ratios.symmetryOffset > 0.08) advisories.push("OFF_CENTER_FACE");
  return advisories;
}

/** Main-site heuristic quality display (45..96), not a calibrated probability. */
export function computeGeometryQualityScore(ratios: GeometryQualitySignals): number {
  if (!Number.isFinite(ratios.eyeLineTiltDeg) || !Number.isFinite(ratios.symmetryOffset)) return 0;
  return Math.round(Math.min(96, Math.max(45, 96 - Math.abs(ratios.eyeLineTiltDeg) * 2.2 - ratios.symmetryOffset * 180)));
}

/**
 * One geometric acceptance rule for metrics, the analysis gate and the scorer.
 * Image-space spans remain fractions of their respective image axes; distances
 * and tilt have already been converted to a common 2D scale by the calculator.
 */
export function getFaceGeometryWarnings(metrics: FaceMetrics): FaceQualityWarning[] {
  const warnings = new Set<FaceQualityWarning>(metrics.geometryWarnings ?? []);
  const ratios = metrics.visutry;
  const spanX = metrics.faceSpanX;
  const spanY = metrics.faceSpanY;

  if (Object.values(metrics).some((value) => typeof value === "number" && !Number.isFinite(value))) {
    warnings.add("INVALID_LANDMARKS");
  }

  if (!ratios || spanX === undefined || spanY === undefined) {
    warnings.add("MISSING_KEY_POINTS");
  }

  if (ratios) {
    if (Object.values(ratios).some((value) => !Number.isFinite(value))
      || ratios.faceAspectRatio <= 0
      || ratios.cheekToFaceWidth <= 0
      || ratios.jawToCheekWidth < 0
      || ratios.foreheadToCheekWidth < 0
      || ratios.symmetryOffset < 0
      || ratios.noseBridgeToFaceWidth < 0
      || metrics.faceWidth <= 0 || metrics.faceHeight <= 0 || metrics.cheekboneWidth <= 0) {
      warnings.add("INVALID_LANDMARKS");
    }
    if (Math.abs(ratios.eyeLineTiltDeg) > MAX_TILT_DEG) warnings.add("EXCESSIVE_TILT");
    if (ratios.symmetryOffset > MAX_SYMMETRY_OFFSET) warnings.add("ASYMMETRIC_FACE");
  }

  if (spanX !== undefined && spanY !== undefined) {
    if (!Number.isFinite(spanX) || !Number.isFinite(spanY) || spanX <= 0 || spanY <= 0) {
      warnings.add("INVALID_LANDMARKS");
    } else if (spanX < MIN_FACE_SPAN || spanY < MIN_FACE_SPAN) {
      warnings.add("FACE_TOO_SMALL");
    }
  }

  return [...warnings];
}
