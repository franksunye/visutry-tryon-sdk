import type {
  FaceMetrics,
  FaceQualityWarning,
  FaceSemanticPoints,
  ImageSize,
  NormalizedFaceResult,
  Point3D,
} from "../types/index.js";
import { distance2D, median, trimmedMean, clamp01 } from "../utils/math.js";
import { getFaceGeometryWarnings, isFinitePoint2D, isValidImageSize } from "./geometryQuality.js";

/** The 15 semantic landmarks consumed by the canonical photo geometry model. */
const REQUIRED_POINTS: (keyof FaceSemanticPoints)[] = [
  "foreheadCenter", "chin", "leftFace", "rightFace", "leftCheek", "rightCheek",
  "leftJaw", "rightJaw", "leftForehead", "rightForehead", "leftEyeOuter",
  "rightEyeOuter", "noseLeft", "noseRight", "noseBridge",
];

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Pure 2D photo geometry, independent of detector depth conventions.
 *
 * x/W and y/H are converted to a common image-width scale before any length,
 * angle or ratio is computed. Spans alone retain their respective image-axis
 * units. Missing dimensions or invalid points never imply a square image.
 */
export class FaceMetricsCalculator {
  compute(face: NormalizedFaceResult): FaceMetrics {
    return this.computeFromSemantic(face.landmarks.semantic, face.imageSize);
  }

  /**
   * Accept normalized semantic points and the dimensions of their source image.
   * Missing points produce partial finite metrics and explicit invalid geometry.
   * Ratios use the main application's canonical rounding (3 decimals; tilt 1).
   */
  computeFromSemantic(semantic: FaceSemanticPoints, imageSize?: ImageSize): FaceMetrics {
    if (!isValidImageSize(imageSize)) return this.emptyMetrics(["INVALID_IMAGE_SIZE"]);
    if (Object.values(semantic).some((point) => point !== undefined && !isFinitePoint2D(point))) {
      return this.emptyMetrics(["INVALID_LANDMARKS"]);
    }

    const aspect = imageSize.height / imageSize.width;
    const points: FaceSemanticPoints = {};
    for (const key of Object.keys(semantic) as (keyof FaceSemanticPoints)[]) {
      const point = semantic[key];
      if (point) points[key] = { x: point.x, y: point.y * aspect };
    }
    if (Object.values(points).some((point) => !isFinitePoint2D(point))) {
      return this.emptyMetrics(["INVALID_LANDMARKS"]);
    }

    const cheekboneWidth = this.safeDistance(points.leftCheek, points.rightCheek);
    const jawWidth = this.safeDistance(points.leftJaw, points.rightJaw);
    const eyeOuterDistance = this.safeDistance(points.leftEyeOuter, points.rightEyeOuter);
    const eyeInnerDistance = this.safeDistance(points.leftEyeInner, points.rightEyeInner);
    const eyeCenterDistance = this.safeDistance(points.leftEyeCenter, points.rightEyeCenter);
    const faceOutlineWidth = this.safeDistance(points.leftFace, points.rightFace);
    const foreheadWidth = this.safeDistance(points.leftForehead, points.rightForehead);
    const noseBridgeWidth = this.safeDistance(points.noseLeft, points.noseRight);
    const faceWidth = faceOutlineWidth ?? cheekboneWidth ?? eyeOuterDistance ?? 0;
    const faceHeight = this.safeDistance(points.foreheadCenter, points.chin)
      ?? (this.safeDistance(points.eyesCenter, points.chin) ?? 0) / 0.55;
    const noseBridgeToEyeLine = points.noseBridge && points.eyesCenter
      ? Math.abs(points.noseBridge.y - points.eyesCenter.y) : 0;

    const widthHeightRatio = faceHeight > 0 ? faceWidth / faceHeight : 0;
    const jawCheekRatio = cheekboneWidth && jawWidth !== undefined ? jawWidth / cheekboneWidth : 0;
    const foreheadCheekRatio = cheekboneWidth && foreheadWidth !== undefined
      ? foreheadWidth / cheekboneWidth : undefined;
    const eyeLineTiltDeg = points.leftEyeOuter && points.rightEyeOuter
      ? Math.atan2(
          points.rightEyeOuter.y - points.leftEyeOuter.y,
          points.rightEyeOuter.x - points.leftEyeOuter.x,
        ) * (180 / Math.PI)
      : undefined;
    const symmetryOffset = points.noseBridge && points.leftFace && points.rightFace && faceWidth > 0
      ? Math.abs(points.noseBridge.x - (points.leftFace.x + points.rightFace.x) / 2) / faceWidth
      : undefined;
    const faceSpanX = semantic.leftFace && semantic.rightFace
      ? Math.abs(semantic.rightFace.x - semantic.leftFace.x) : undefined;
    const faceSpanY = semantic.foreheadCenter && semantic.chin
      ? Math.abs(semantic.chin.y - semantic.foreheadCenter.y) : undefined;

    const geometryWarnings: FaceQualityWarning[] = [];
    const hasRequiredPoints = REQUIRED_POINTS.every((key) => isFinitePoint2D(semantic[key]));
    if (!hasRequiredPoints) geometryWarnings.push("MISSING_KEY_POINTS");
    if (hasRequiredPoints && (faceWidth <= 0 || faceHeight <= 0 || (cheekboneWidth ?? 0) <= 0
      || (eyeOuterDistance ?? 0) <= 0)) {
      geometryWarnings.push("INVALID_LANDMARKS");
    }

    const metrics: FaceMetrics = {
      faceWidth,
      faceHeight,
      cheekboneWidth: cheekboneWidth ?? 0,
      jawWidth: jawWidth ?? 0,
      foreheadWidth,
      faceOutlineWidth,
      eyeOuterDistance: eyeOuterDistance ?? 0,
      eyeInnerDistance: eyeInnerDistance ?? 0,
      eyeCenterDistance: eyeCenterDistance ?? 0,
      noseBridgeToEyeLine,
      noseBridgeWidth,
      widthHeightRatio,
      jawCheekRatio,
      foreheadCheekRatio,
      eyeLineTiltDeg,
      symmetryOffset,
      faceSpanX,
      faceSpanY,
      faceSpan: faceSpanX !== undefined && faceSpanY !== undefined ? Math.max(faceSpanX, faceSpanY) : undefined,
      chinType: this.classifyChin(jawCheekRatio, widthHeightRatio, points),
      measurementQuality: this.computeQuality(semantic),
      geometryWarnings,
    };

    if (hasRequiredPoints && faceWidth > 0 && faceHeight > 0 && (cheekboneWidth ?? 0) > 0) {
      metrics.visutry = this.ratiosFromMetrics(metrics);
    }
    if (Object.values(metrics).some((value) => typeof value === "number" && !Number.isFinite(value))) {
      return this.emptyMetrics(["INVALID_LANDMARKS"]);
    }
    return this.withGeometryValidity(metrics);
  }

  /**
   * Aggregate only complete, geometrically acceptable samples. A bad sample
   * invalidates the batch instead of disappearing into a median or an average.
   */
  aggregate(frames: NormalizedFaceResult[]): FaceMetrics {
    if (frames.length === 0) return this.emptyMetrics(["MISSING_KEY_POINTS"]);
    const perFrame = frames.map((face) => this.compute(face));
    if (perFrame.length === 1) return perFrame[0];
    if (perFrame.some((metrics) => !metrics.geometryValid)) {
      return this.emptyMetrics([...new Set(perFrame.flatMap((metrics) => metrics.geometryWarnings ?? []))]);
    }

    const pick = (key: keyof FaceMetrics): number[] => perFrame
      .map((metrics) => metrics[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const requiredMedian = (key: keyof FaceMetrics): number => median(pick(key));
    const optionalMedian = (key: keyof FaceMetrics): number | undefined => {
      const values = pick(key);
      return values.length ? median(values) : undefined;
    };
    const faceWidth = requiredMedian("faceWidth");
    const faceHeight = requiredMedian("faceHeight");
    const cheekboneWidth = requiredMedian("cheekboneWidth");
    const jawWidth = requiredMedian("jawWidth");
    const foreheadWidth = optionalMedian("foreheadWidth");
    const faceSpanX = optionalMedian("faceSpanX");
    const faceSpanY = optionalMedian("faceSpanY");
    const metrics: FaceMetrics = {
      faceWidth,
      faceHeight,
      cheekboneWidth,
      jawWidth,
      foreheadWidth,
      faceOutlineWidth: optionalMedian("faceOutlineWidth"),
      eyeOuterDistance: requiredMedian("eyeOuterDistance"),
      eyeInnerDistance: requiredMedian("eyeInnerDistance"),
      eyeCenterDistance: requiredMedian("eyeCenterDistance"),
      noseBridgeToEyeLine: requiredMedian("noseBridgeToEyeLine"),
      noseBridgeWidth: optionalMedian("noseBridgeWidth"),
      widthHeightRatio: faceWidth / faceHeight,
      jawCheekRatio: jawWidth / cheekboneWidth,
      foreheadCheekRatio: foreheadWidth === undefined ? undefined : foreheadWidth / cheekboneWidth,
      eyeLineTiltDeg: optionalMedian("eyeLineTiltDeg"),
      symmetryOffset: optionalMedian("symmetryOffset"),
      faceSpanX,
      faceSpanY,
      faceSpan: faceSpanX !== undefined && faceSpanY !== undefined ? Math.max(faceSpanX, faceSpanY) : undefined,
      chinType: this.majorityVote(perFrame.map((item) => item.chinType)),
      measurementQuality: clamp01(
        trimmedMean(pick("measurementQuality"), 0.2) * 0.6 + this.stabilityFactor(pick("faceWidth")) * 0.4,
      ),
      geometryWarnings: [],
    };
    metrics.visutry = this.ratiosFromMetrics(metrics);
    return this.withGeometryValidity(metrics);
  }

  private ratiosFromMetrics(metrics: FaceMetrics): NonNullable<FaceMetrics["visutry"]> {
    return {
      faceAspectRatio: round(metrics.faceHeight / metrics.faceWidth),
      cheekToFaceWidth: round(metrics.cheekboneWidth / metrics.faceWidth),
      jawToCheekWidth: round(metrics.jawWidth / metrics.cheekboneWidth),
      foreheadToCheekWidth: round((metrics.foreheadWidth ?? 0) / metrics.cheekboneWidth),
      eyeLineTiltDeg: round(metrics.eyeLineTiltDeg ?? 0, 1),
      symmetryOffset: round(metrics.symmetryOffset ?? 0),
      noseBridgeToFaceWidth: round((metrics.noseBridgeWidth ?? 0) / metrics.faceWidth),
    };
  }

  private withGeometryValidity(metrics: FaceMetrics): FaceMetrics {
    const geometryWarnings = getFaceGeometryWarnings(metrics);
    return { ...metrics, geometryValid: geometryWarnings.length === 0, geometryWarnings };
  }

  private safeDistance(a?: Point3D, b?: Point3D): number | undefined {
    return isFinitePoint2D(a) && isFinitePoint2D(b) ? distance2D(a, b) : undefined;
  }

  private computeQuality(points: FaceSemanticPoints): number {
    const coverage = clamp01(Object.values(points).filter(isFinitePoint2D).length / 23);
    const critical: (keyof FaceSemanticPoints)[] = [
      "leftEyeCenter", "rightEyeCenter", "eyesCenter", "noseBridge", "chin",
      "leftCheek", "rightCheek", "leftJaw", "rightJaw",
    ];
    const criticalRatio = critical.filter((key) => isFinitePoint2D(points[key])).length / critical.length;
    return clamp01(coverage * 0.35 + criticalRatio * 0.65);
  }

  private classifyChin(jawCheekRatio: number, widthHeightRatio: number, points: FaceSemanticPoints): FaceMetrics["chinType"] {
    if (!points.chin || !points.leftJaw || !points.rightJaw || !points.leftCheek || !points.rightCheek) return "unknown";
    if (jawCheekRatio < 0.72) return "pointed";
    if (jawCheekRatio >= 0.86) return widthHeightRatio >= 0.9 ? "rounded" : "square";
    return "rounded";
  }

  private stabilityFactor(values: number[]): number {
    if (values.length < 2) return 1;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean < 1e-6) return 0.5;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return clamp01(1 - Math.sqrt(variance) / mean / 0.15);
  }

  private majorityVote(values: FaceMetrics["chinType"][]): FaceMetrics["chinType"] {
    const counts = new Map<FaceMetrics["chinType"], number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  }

  private emptyMetrics(warnings: FaceQualityWarning[]): FaceMetrics {
    return {
      geometryValid: false,
      geometryWarnings: warnings,
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
    };
  }
}
