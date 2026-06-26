/**
 * WechatFaceTracker — implements `IFaceTracker` on top of WeChat visionkit
 * (`wx.createVKSession({ track: { face: { mode: 1 } } })`).
 *
 * VK face mode exposes a 468-point landmark topology that closely mirrors
 * MediaPipe FaceMesh (same canonical mesh indices), so we reuse the core
 * `MEDIAPIPE_SEMANTIC_INDEX_MAP` via `FaceSemanticMapper` to map raw landmarks
 * onto the stable `FaceSemanticPoints` contract. See the comment on
 * `MEDIAPIPE_SEMANTIC_INDEX_MAP` in @visutry/tryon-core for the index list.
 *
 * Degradation strategy: VKSession is only available on relatively new WeChat
 * baselines and only inside a real Mini Program. When it is absent (or fails to
 * construct), the tracker records a reason and `detect()` returns `null` rather
 * than throwing — the SDK facade can then surface a "tracking unavailable" UI.
 */

import type {
  FacePose,
  FaceQuality,
  FaceQualityWarning,
  FaceResultSource,
  FrameInput,
  IFaceTracker,
  NormalizedFaceResult,
  NormalizedRect,
  Point3D,
  TrackerConfig,
} from "@visutry/tryon-core";
import {
  CoordinateSystem,
  FaceSemanticMapper,
  MEDIAPIPE_SEMANTIC_INDEX_MAP,
  decomposeMatrixToEuler,
} from "@visutry/tryon-core";
import type { WechatEnvironment, WechatVKFaceGeometry, WechatVKSessionLike } from "../environment.js";
import { createDefaultWechatEnvironment } from "../environment.js";
import { isWechatFrameInput } from "../types.js";

export interface WechatFaceTrackerOptions {
  environment?: WechatEnvironment;
}

export class WechatFaceTracker implements IFaceTracker {
  private readonly env: WechatEnvironment;
  private config: TrackerConfig = { mode: "balanced" };
  private session: WechatVKSessionLike | null = null;
  private readonly mapper: FaceSemanticMapper;
  private degraded = false;
  private degradeReason: string | null = null;

  constructor(options: WechatFaceTrackerOptions = {}) {
    this.env = options.environment ?? createDefaultWechatEnvironment();
    // WeChat VK face landmarks share the 468-point MediaPipe FaceMesh topology,
    // so the MediaPipe semantic index map is directly applicable. (If a future
    // VK revision changes the topology, pass a custom index map here.)
    this.mapper = new FaceSemanticMapper({ indexMap: MEDIAPIPE_SEMANTIC_INDEX_MAP });
  }

  async initialize(config?: TrackerConfig): Promise<void> {
    this.config = { mode: "balanced", ...config };

    if (!this.env.isAvailable() || !this.env.hasVK()) {
      this.degraded = true;
      this.degradeReason =
        "WeChat VKSession (visionkit face) is not available in this environment";
      return; // graceful: do not throw, callers can read isDegraded()
    }

    try {
      this.session = this.env.createVKSession({
        track: { face: { mode: 1 } },
      });
      this.degraded = false;
      this.degradeReason = null;
    } catch (e) {
      this.session = null;
      this.degraded = true;
      this.degradeReason = `Failed to create VKSession: ${(e as Error).message}`;
    }
  }

  async detect(frame: FrameInput): Promise<NormalizedFaceResult | null> {
    // Degraded mode (VK unavailable): never throw — return null so the renderer
    // can hide the glasses / show a placeholder.
    if (this.degraded || !this.session) {
      return null;
    }
    if (!isWechatFrameInput(frame)) {
      return null;
    }

    let result;
    try {
      result = this.session.detectFace({
        frameBuffer: frame.data,
        width: frame.width,
        height: frame.height,
      });
    } catch (err) {
      // A transient VK error degrades this frame only; do not throw.
      console.warn("[VisuTrySDK]", "WechatFaceTracker: transient detectFace error:", err);
      return null;
    }

    const face = result?.faces?.[0];
    if (!face) return null;

    return this.toNormalizedFaceResult(face, frame.width, frame.height);
  }

  destroy(): void {
    if (this.session) {
      try {
        this.session.destroy();
      } catch (err) {
        console.warn("[VisuTrySDK]", "WechatFaceTracker: error destroying session:", err);
      }
      this.session = null;
    }
    this.degraded = false;
    this.degradeReason = null;
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  /** Whether the tracker is operating in a degraded (no-op) mode. */
  isDegraded(): boolean {
    return this.degraded;
  }

  /** Human-readable reason when `isDegraded()` is true. */
  getDegradeReason(): string | null {
    return this.degradeReason;
  }

  /** The tracker configuration applied via `initialize()`. */
  getConfig(): TrackerConfig {
    return this.config;
  }

  // -----------------------------------------------------------------------
  // Mapping
  // -----------------------------------------------------------------------

  private toNormalizedFaceResult(
    face: WechatVKFaceGeometry,
    width: number,
    height: number,
  ): NormalizedFaceResult {
    const raw = this.extractLandmarks(face);
    const normalized = this.normalizeLandmarks(raw, width, height);
    const semantic = this.mapper.map(normalized);
    const pose = this.extractPose(face);
    const bbox = this.extractBBox(face, normalized);
    const quality = this.extractQuality(face, normalized);

    const source: FaceResultSource = "wechat-vk";

    return {
      source,
      timestamp: Date.now(),
      landmarks: {
        raw,
        normalized,
        semantic,
      },
      pose,
      bbox,
      quality,
    };
  }

  /** Build a `Point3D[]` from the flat VK `points` (or `vertices`) array. */
  private extractLandmarks(face: WechatVKFaceGeometry): Point3D[] {
    const flat = face.points ?? face.vertices ?? [];
    const pts: Point3D[] = [];
    for (let i = 0; i + 2 < flat.length; i += 3) {
      pts.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2] ?? 0 });
    }
    return pts;
  }

  /**
   * VK landmarks are normally already in normalized image space `[0,1]`. As a
   * defensive heuristic, if any coordinate exceeds the normalized range we
   * treat the batch as pixel space and convert. This keeps the tracker robust
   * to SDK-version differences.
   */
  private normalizeLandmarks(raw: Point3D[], width: number, height: number): Point3D[] {
    if (raw.length === 0) return raw;
    let maxVal = 0;
    for (const p of raw) {
      const m = Math.max(Math.abs(p.x), Math.abs(p.y));
      if (m > maxVal) maxVal = m;
    }
    if (maxVal > 1.5) {
      return CoordinateSystem.pixelToNormalizedBatch(raw, width, height);
    }
    return raw.slice();
  }

  /**
   * Derive `yaw`/`pitch`/`roll` from the VK `transform` matrix using the core
   * `decomposeMatrixToEuler` helper (YXZ order). When no matrix is available,
   * fall back to zeros with the reported confidence.
   */
  private extractPose(face: WechatVKFaceGeometry): FacePose {
    const confidence = typeof face.confidence === "number" ? face.confidence : 0.8;
    if (face.transform && face.transform.length >= 11) {
      const euler = decomposeMatrixToEuler(face.transform);
      return {
        yaw: euler.y,
        pitch: euler.x,
        roll: euler.z,
        matrix: face.transform,
        confidence,
      };
    }
    return { yaw: 0, pitch: 0, roll: 0, confidence };
  }

  private extractBBox(face: WechatVKFaceGeometry, normalized: Point3D[]): NormalizedRect {
    if (face.bbox) {
      return {
        x: face.bbox.x,
        y: face.bbox.y,
        width: face.bbox.width,
        height: face.bbox.height,
      };
    }
    if (normalized.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of normalized) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private extractQuality(face: WechatVKFaceGeometry, normalized: Point3D[]): FaceQuality {
    const confidence = typeof face.confidence === "number" ? face.confidence : 0.8;
    const warnings: FaceQualityWarning[] = [];
    if (normalized.length === 0) warnings.push("MISSING_KEY_POINTS");
    if (confidence < 0.55) warnings.push("LOW_CONFIDENCE");
    // VK does not expose frontal / lighting / occlusion scores directly; the
    // core `QualityGate` refines these from the semantic geometry downstream.
    return {
      confidence,
      faceVisible: confidence >= 0.5 && normalized.length > 0,
      frontalScore: 1,
      stabilityScore: 1,
      warnings,
    };
  }
}
