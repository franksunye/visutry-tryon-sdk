import type { FaceMetrics, FaceSemanticPoints, NormalizedFaceResult } from "../types/index.js";
import { distance3D, median, trimmedMean, clamp01 } from "../utils/math.js";

/**
 * Computes geometric `FaceMetrics` from `FaceSemanticPoints`.
 *
 * Design rules (spec §12.2):
 *  - All distances use normalized coordinates.
 *  - Missing points are tolerated — a metric is simply left undefined / the
 *    measurement quality degrades. The calculator never throws on missing data.
 *  - Every result carries a `measurementQuality` in [0,1].
 *  - Multi-frame analysis aggregates via median (distances) / trimmed mean (ratios).
 */
export class FaceMetricsCalculator {
  /**
   * Compute metrics for a single normalized face result.
   */
  compute(face: NormalizedFaceResult): FaceMetrics {
    return this.computeFromSemantic(face.landmarks.semantic);
  }

  /**
   * Compute metrics directly from semantic points. This is the core entry
   * point — `NormalizedFaceResult` is only a thin wrapper around it.
   */
  computeFromSemantic(s: FaceSemanticPoints): FaceMetrics {
    const present = this.countKeyPoints(s);

    // --- Horizontal widths -------------------------------------------------
    const cheekboneWidth = this.safeDistance(s.leftCheek, s.rightCheek);
    const jawWidth = this.safeDistance(s.leftJaw, s.rightJaw);
    const eyeOuterDistance = this.safeDistance(s.leftEyeOuter, s.rightEyeOuter);
    const eyeInnerDistance = this.safeDistance(s.leftEyeInner, s.rightEyeInner);
    const eyeCenterDistance = this.safeDistance(s.leftEyeCenter, s.rightEyeCenter);

    // faceWidth: prefer cheekbone width; fall back to eye outer distance so the
    // metric is still usable when cheek points are missing.
    const faceWidth = cheekboneWidth ?? eyeOuterDistance ?? 0;

    // --- Vertical height ---------------------------------------------------
    // Prefer forehead→chin; fall back to eyesCenter→chin (a stable proxy).
    let faceHeight: number | undefined;
    if (s.foreheadCenter && s.chin) {
      faceHeight = distance3D(s.foreheadCenter, s.chin);
    } else if (s.eyesCenter && s.chin) {
      // Eyes sit roughly at ~55% of face height measured from the chin, so the
      // eyes→chin span is scaled up. This is an explicit, documented heuristic.
      faceHeight = distance3D(s.eyesCenter, s.chin) / 0.55;
    }

    // --- Nose bridge to eye line ------------------------------------------
    let noseBridgeToEyeLine = 0;
    if (s.noseBridge && s.eyesCenter) {
      noseBridgeToEyeLine = Math.abs(s.noseBridge.y - s.eyesCenter.y);
    }

    // --- Ratios ------------------------------------------------------------
    const widthHeightRatio =
      faceHeight && faceHeight > 1e-6 ? faceWidth / faceHeight : 0;
    const jawCheekRatio =
      jawWidth !== undefined && cheekboneWidth && cheekboneWidth > 1e-6
        ? jawWidth / cheekboneWidth
        : 0;

    // --- Chin type classification (geometric heuristic, width/height aware) -
    const chinType = this.classifyChin(
      jawCheekRatio,
      widthHeightRatio,
      jawWidth,
      cheekboneWidth,
      s.chin,
      s.leftJaw,
      s.rightJaw,
    );

    // --- Measurement quality ----------------------------------------------
    const measurementQuality = this.computeQuality(present, s);

    return {
      faceWidth,
      faceHeight: faceHeight ?? 0,
      cheekboneWidth: cheekboneWidth ?? 0,
      jawWidth: jawWidth ?? 0,
      foreheadWidth: undefined,
      eyeOuterDistance: eyeOuterDistance ?? 0,
      eyeInnerDistance: eyeInnerDistance ?? 0,
      eyeCenterDistance: eyeCenterDistance ?? 0,
      noseBridgeToEyeLine,
      widthHeightRatio,
      jawCheekRatio,
      chinType,
      measurementQuality,
    };
  }

  /**
   * Aggregate metrics across multiple frames (spec §12.3). Distances use the
   * median; ratios are recomputed from medians to stay internally consistent;
   * `measurementQuality` blends per-frame quality with cross-frame stability.
   */
  aggregate(frames: NormalizedFaceResult[]): FaceMetrics {
    if (frames.length === 0) {
      return this.emptyMetrics();
    }
    if (frames.length === 1) {
      return this.compute(frames[0]);
    }

    const perFrame = frames.map((f) => this.compute(f));

    const pick = (key: keyof FaceMetrics) =>
      perFrame.map((m) => m[key] as number).filter((v) => typeof v === "number" && !Number.isNaN(v));

    const faceWidth = median(pick("faceWidth"));
    const faceHeight = median(pick("faceHeight"));
    const cheekboneWidth = median(pick("cheekboneWidth"));
    const jawWidth = median(pick("jawWidth"));
    const eyeOuterDistance = median(pick("eyeOuterDistance"));
    const eyeInnerDistance = median(pick("eyeInnerDistance"));
    const eyeCenterDistance = median(pick("eyeCenterDistance"));
    const noseBridgeToEyeLine = median(pick("noseBridgeToEyeLine"));

    const widthHeightRatio = faceHeight > 1e-6 ? faceWidth / faceHeight : 0;
    const jawCheekRatio = cheekboneWidth > 1e-6 ? jawWidth / cheekboneWidth : 0;

    const qualities = pick("measurementQuality");
    const avgQuality = trimmedMean(qualities, 0.2);

    // Stability bonus: low variance across frames increases confidence.
    const wds = pick("faceWidth");
    const stability = this.stabilityFactor(wds);
    const measurementQuality = clamp01(avgQuality * 0.6 + stability * 0.4);

    // Chin type: majority vote across frames.
    const chinVotes = perFrame.map((m) => m.chinType);
    const chinType = this.majorityVote(chinVotes);

    return {
      faceWidth,
      faceHeight,
      cheekboneWidth,
      jawWidth,
      foreheadWidth: undefined,
      eyeOuterDistance,
      eyeInnerDistance,
      eyeCenterDistance,
      noseBridgeToEyeLine,
      widthHeightRatio,
      jawCheekRatio,
      chinType,
      measurementQuality,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private safeDistance(a?: { x: number; y: number; z?: number }, b?: { x: number; y: number; z?: number }): number | undefined {
    if (!a || !b) return undefined;
    return distance3D(
      { x: a.x, y: a.y, z: a.z ?? 0 },
      { x: b.x, y: b.y, z: b.z ?? 0 },
    );
  }

  private countKeyPoints(s: FaceSemanticPoints): number {
    const keys: (keyof FaceSemanticPoints)[] = [
      "leftEyeOuter",
      "leftEyeInner",
      "rightEyeInner",
      "rightEyeOuter",
      "leftEyeCenter",
      "rightEyeCenter",
      "eyesCenter",
      "noseBridge",
      "noseTip",
      "chin",
      "leftCheek",
      "rightCheek",
      "leftJaw",
      "rightJaw",
      "leftBrowCenter",
      "rightBrowCenter",
      "foreheadCenter",
    ];
    let count = 0;
    for (const k of keys) if (s[k]) count++;
    return count;
  }

  private computeQuality(present: number, s: FaceSemanticPoints): number {
    // Base quality from coverage of 17 key points.
    const coverage = clamp01(present / 17);

    // Critical points weight: eyes, noseBridge, chin, cheeks, jaw are essential.
    const critical: (keyof FaceSemanticPoints)[] = [
      "leftEyeCenter",
      "rightEyeCenter",
      "eyesCenter",
      "noseBridge",
      "chin",
      "leftCheek",
      "rightCheek",
      "leftJaw",
      "rightJaw",
    ];
    const criticalPresent = critical.filter((k) => s[k]).length;
    const criticalRatio = criticalPresent / critical.length;

    // Blend: critical points matter more than peripheral coverage.
    return clamp01(coverage * 0.35 + criticalRatio * 0.65);
  }

  private classifyChin(
    jawCheekRatio: number,
    widthHeightRatio: number,
    jawWidth?: number,
    cheekboneWidth?: number,
    chin?: { x: number; y: number; z?: number },
    leftJaw?: { x: number; y: number; z?: number },
    rightJaw?: { x: number; y: number; z?: number },
  ): FaceMetrics["chinType"] {
    if (jawWidth === undefined || cheekboneWidth === undefined || !chin || !leftJaw || !rightJaw) {
      return "unknown";
    }
    // A pointed chin tapers strongly: jaw much narrower than cheekbone.
    if (jawCheekRatio < 0.72) {
      return "pointed";
    }
    // A broad jaw (jaw ≈ cheekbone) is square when proportions are medium and
    // rounded when the face is nearly as wide as it is tall (a round face).
    if (jawCheekRatio >= 0.86) {
      return widthHeightRatio >= 0.9 ? "rounded" : "square";
    }
    // Intermediate taper => rounded.
    return "rounded";
  }

  private stabilityFactor(values: number[]): number {
    if (values.length < 2) return 1;
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    if (m < 1e-6) return 0.5;
    const variance = values.reduce((a, b) => a + (b - m) * (b - m), 0) / values.length;
    const cv = Math.sqrt(variance) / m; // coefficient of variation
    // cv near 0 => stable (1); cv >= 0.15 => unstable (0).
    return clamp01(1 - cv / 0.15);
  }

  private majorityVote(values: FaceMetrics["chinType"][]): FaceMetrics["chinType"] {
    const counts = new Map<FaceMetrics["chinType"], number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: FaceMetrics["chinType"] = "unknown";
    let bestCount = 0;
    for (const [k, c] of counts) {
      if (c > bestCount) {
        best = k;
        bestCount = c;
      }
    }
    return best;
  }

  private emptyMetrics(): FaceMetrics {
    return {
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
