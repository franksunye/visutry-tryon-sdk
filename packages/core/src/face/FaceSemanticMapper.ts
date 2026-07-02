import type { FaceResultSource, FaceSemanticPoints, Point3D } from "../types/index.js";
import { midpoint } from "../utils/math.js";

/**
 * Mapping from a semantic point name to the index in the raw landmark array.
 * Adapters supply the index map appropriate for their tracker; the core ships a
 * default MediaPipe Face Landmarker map.
 */
export type SemanticIndexMap = Partial<Record<keyof FaceSemanticPoints, number>>;

/**
 * Default MediaPipe Face Landmarker (468/478 point topology) index map, as
 * specified in the SDK spec §10.1.
 */
export const MEDIAPIPE_SEMANTIC_INDEX_MAP: SemanticIndexMap = {
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  noseBridge: 168,
  noseTip: 1,
  leftBrowCenter: 105,
  rightBrowCenter: 334,
  foreheadCenter: 10,
  chin: 152,
  leftCheek: 123,
  rightCheek: 352,
  leftJaw: 172,
  rightJaw: 397,
  // visutry additions — used for richer face shape classification
  leftFace: 234,
  rightFace: 454,
  leftForehead: 103,
  rightForehead: 332,
  noseLeft: 98,
  noseRight: 327,
};

export interface FaceSemanticMapperOptions {
  indexMap?: SemanticIndexMap;
  /** When true, derive eye centers / eyes center from outer+inner corners. Default true. */
  deriveCenters?: boolean;
}

/**
 * Maps raw tracker landmarks onto the stable `FaceSemanticPoints` contract.
 *
 * This class is intentionally side-effect free and tracker-agnostic: it only
 * needs an index map describing where each semantic point lives in the raw
 * array. The web adapter passes the MediaPipe map; the WeChat adapter passes a
 * custom map or relies on direct construction.
 */
export class FaceSemanticMapper {
  private readonly indexMap: SemanticIndexMap;
  private readonly deriveCenters: boolean;

  constructor(options: FaceSemanticMapperOptions = {}) {
    this.indexMap = options.indexMap ?? MEDIAPIPE_SEMANTIC_INDEX_MAP;
    this.deriveCenters = options.deriveCenters ?? true;
  }

  /**
   * Build a `FaceSemanticPoints` from a raw normalized landmark array.
   * Missing indices or undefined landmarks are silently skipped — downstream
   * consumers must tolerate optional points.
   */
  map(landmarks: Point3D[]): FaceSemanticPoints {
    const semantic: FaceSemanticPoints = {};

    for (const key of Object.keys(this.indexMap) as (keyof FaceSemanticPoints)[]) {
      const idx = this.indexMap[key];
      if (idx === undefined) continue;
      const pt = landmarks[idx];
      if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
        (semantic[key] as Point3D) = {
          x: pt.x,
          y: pt.y,
          z: pt.z ?? 0,
        };
      }
    }

    if (this.deriveCenters) {
      this.deriveEyeCenters(semantic);
    }

    return semantic;
  }

  /**
   * Derive leftEyeCenter, rightEyeCenter and eyesCenter from the outer/inner
   * eye corners when they are available. These derived points are the backbone
   * of the glasses pose solver and face metrics.
   */
  private deriveEyeCenters(semantic: FaceSemanticPoints): void {
    if (!semantic.leftEyeCenter && semantic.leftEyeOuter && semantic.leftEyeInner) {
      semantic.leftEyeCenter = midpoint(semantic.leftEyeOuter, semantic.leftEyeInner);
    }
    if (!semantic.rightEyeCenter && semantic.rightEyeInner && semantic.rightEyeOuter) {
      semantic.rightEyeCenter = midpoint(semantic.rightEyeInner, semantic.rightEyeOuter);
    }
    if (!semantic.eyesCenter && semantic.leftEyeCenter && semantic.rightEyeCenter) {
      semantic.eyesCenter = midpoint(semantic.leftEyeCenter, semantic.rightEyeCenter);
    }
  }

  /**
   * Count how many of the *required* semantic points (for analysis) are present.
   * Used by the quality gate to emit `MISSING_KEY_POINTS`.
   */
  static countMissing(
    semantic: FaceSemanticPoints,
    required: (keyof FaceSemanticPoints)[] = [
      "leftEyeCenter",
      "rightEyeCenter",
      "noseBridge",
      "chin",
      "leftCheek",
      "rightCheek",
      "leftJaw",
      "rightJaw",
    ],
  ): { missing: string[]; present: number; total: number } {
    const missing: string[] = [];
    for (const key of required) {
      if (!semantic[key]) missing.push(key);
    }
    return {
      missing,
      present: required.length - missing.length,
      total: required.length,
    };
  }

  /** Convenience factory bound to a specific source's default map. */
  static forSource(source: FaceResultSource): FaceSemanticMapper {
    if (source === "mediapipe") {
      return new FaceSemanticMapper({ indexMap: MEDIAPIPE_SEMANTIC_INDEX_MAP });
    }
    // wechat-vk and custom callers must supply their own map at construction.
    return new FaceSemanticMapper({ indexMap: {} });
  }
}
