/**
 * WechatRenderer — implements `IRenderer` on top of
 * `wx.createOffscreenCanvas({ type: 'webgl' | '2d' })`.
 *
 * STATUS: experimental placeholder.
 *
 * WeChat's WebGL surface has several constraints (limited extensions, no async
 * shader compilation, restricted texture formats) that make a full glTF glasses
 * pipeline non-trivial. This implementation therefore:
 *   - creates an offscreen canvas and acquires a WebGL (preferred) or 2D context,
 *   - stores the loaded glasses asset and the latest pose,
 *   - exposes `snapshot()` via `canvas.toDataURL` (2D) or `wx.canvasToTempFilePath`,
 *   - degrades gracefully (never throws from `applyPose`/`setVisible`/`resize`).
 *
 * TODO(production): replace the placeholder with a custom lightweight WebGL
 * render pipeline (glTF parse → buffers/materials → model-matrix draw call).
 * The host page may alternatively drive its own pipeline through the canvas
 * exposed here.
 */

import type {
  GlassesAssetManifest,
  GlassesPose,
  IRenderer,
  RenderOptions,
  RenderTarget,
  SnapshotOptions,
  SnapshotResult,
} from "@visutry/tryon-core";
import { createSDKError } from "@visutry/tryon-core";
import type {
  WechatEnvironment,
  WechatOffscreenCanvasLike,
} from "../environment.js";
import { createDefaultWechatEnvironment } from "../environment.js";

export interface WechatRendererOptions {
  environment?: WechatEnvironment;
  /** Preferred canvas type; defaults to `webgl` (falls back to `2d`). */
  canvasType?: "webgl" | "2d";
}

export class WechatRenderer implements IRenderer {
  private readonly env: WechatEnvironment;
  private readonly preferredType: "webgl" | "2d";
  private canvas: WechatOffscreenCanvasLike | null = null;
  private gl: WebGLRenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private activeType: "webgl" | "2d" | null = null;
  private options: RenderOptions = { width: 0, height: 0 };
  private asset: GlassesAssetManifest | null = null;
  private currentPose: GlassesPose | null = null;
  private visible = true;
  private initialized = false;

  constructor(options: WechatRendererOptions = {}) {
    this.env = options.environment ?? createDefaultWechatEnvironment();
    this.preferredType = options.canvasType ?? "webgl";
  }

  async initialize(target: RenderTarget, options?: RenderOptions): Promise<void> {
    if (!this.env.isAvailable() || !this.env.hasOffscreenCanvas()) {
      throw createSDKError(
        "RENDERER_INIT_FAILED",
        "WeChat OffscreenCanvas (wx.createOffscreenCanvas) is not available in this environment",
      );
    }

    this.options = {
      width: options?.width ?? 375,
      height: options?.height ?? 500,
      ...(options?.mirror !== undefined ? { mirror: options.mirror } : {}),
      ...(options?.background !== undefined ? { background: options.background } : {}),
      ...(options?.pixelRatio !== undefined ? { pixelRatio: options.pixelRatio } : {}),
      ...(options?.antialias !== undefined ? { antialias: options.antialias } : {}),
      ...(options?.maxTextureSize !== undefined ? { maxTextureSize: options.maxTextureSize } : {}),
    };

    // Reuse a canvas supplied via the render target when present; otherwise
    // allocate a fresh offscreen canvas.
    const existing = extractCanvasFromTarget(target);
    if (existing) {
      this.canvas = existing;
    } else {
      this.canvas = this.env.createOffscreenCanvas({
        type: this.preferredType,
        width: this.options.width,
        height: this.options.height,
      });
    }

    // Acquire a rendering context, degrading from webgl → 2d → none.
    let ctx: unknown = null;
    if (this.preferredType === "webgl") {
      ctx = this.canvas.getContext("webgl");
      if (ctx) {
        this.gl = ctx as WebGLRenderingContext;
        this.activeType = "webgl";
      } else {
        ctx = this.canvas.getContext("2d");
        if (ctx) {
          this.ctx2d = ctx as CanvasRenderingContext2D;
          this.activeType = "2d";
        }
      }
    } else {
      ctx = this.canvas.getContext("2d");
      if (ctx) {
        this.ctx2d = ctx as CanvasRenderingContext2D;
        this.activeType = "2d";
      } else {
        ctx = this.canvas.getContext("webgl");
        if (ctx) {
          this.gl = ctx as WebGLRenderingContext;
          this.activeType = "webgl";
        }
      }
    }

    // TODO(production): set up viewport, shaders, framebuffers for the custom
    // WebGL pipeline. For the experimental build we intentionally leave the
    // context in its default state so the host can drive its own rendering.

    this.initialized = true;
  }

  async loadGlasses(asset: GlassesAssetManifest): Promise<void> {
    if (!this.initialized || !this.canvas) {
      throw createSDKError(
        "GLASSES_LOAD_FAILED",
        "Renderer is not initialized; call initialize() first",
      );
    }
    this.asset = asset;
    // TODO(production): fetch & parse the glTF/glb at `asset.modelUrl`, build
    // GPU vertex/index buffers and materials, upload textures. WeChat WebGL
    // constraints (limited extensions, synchronous compile) mean a bespoke
    // renderer is required for production-quality try-on.
  }

  applyPose(pose: GlassesPose): void {
    this.currentPose = pose;
    // TODO(production): update the model matrix from `pose` and issue a draw
    // call. The placeholder intentionally performs no rendering; the host page
    // may render its own glasses geometry onto the exposed canvas.
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  async snapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    if (!this.canvas) {
      throw createSDKError("SNAPSHOT_FAILED", "Renderer is not initialized");
    }
    const width = options?.width ?? this.options.width;
    const height = options?.height ?? this.options.height;
    const format = options?.format ?? "image/png";

    // 2D canvases expose `toDataURL` directly.
    if (typeof this.canvas.toDataURL === "function") {
      const mime = format === "image/jpeg" ? "image/jpeg" : "image/png";
      const dataUrl = this.canvas.toDataURL(mime, options?.quality);
      return { dataUrl, width, height, timestamp: Date.now() };
    }

    // WebGL canvases must go through `wx.canvasToTempFilePath`. The returned
    // `tempFilePath` is stored in `dataUrl` for the experimental build; a
    // production build should read the temp file and base64-encode it (or
    // upload it directly) to satisfy the `SnapshotResult.dataUrl` contract.
    try {
      const res = await this.env.canvasToTempFilePath({
        canvas: this.canvas,
        width,
        height,
        destWidth: width,
        destHeight: height,
        fileType: format === "image/jpeg" ? "jpg" : "png",
        quality: options?.quality,
      });
      return { dataUrl: res.tempFilePath, width, height, timestamp: Date.now() };
    } catch (e) {
      throw createSDKError(
        "SNAPSHOT_FAILED",
        `WeChat snapshot failed: ${(e as Error).message}`,
        e,
      );
    }
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.options = { ...this.options, width, height };
    // TODO(production): re-create framebuffers / glViewport for the new size.
  }

  dispose(): void {
    this.canvas = null;
    this.gl = null;
    this.ctx2d = null;
    this.activeType = null;
    this.asset = null;
    this.currentPose = null;
    this.initialized = false;
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  /** The active canvas context type, or `null` before `initialize()`. */
  getActiveType(): "webgl" | "2d" | null {
    return this.activeType;
  }

  /**
   * The active rendering context (WebGL or 2D), or `null` when none was
   * acquired. Exposed so a host page can drive its own custom pipeline on top
   * of the offscreen canvas created by this adapter.
   */
  getActiveContext(): WebGLRenderingContext | CanvasRenderingContext2D | null {
    return this.gl ?? this.ctx2d ?? null;
  }

  /** Whether a glasses asset is currently loaded. */
  hasAsset(): boolean {
    return this.asset !== null;
  }

  /** The most recently applied glasses pose, or `null` if none applied yet. */
  getPose(): GlassesPose | null {
    return this.currentPose;
  }

  /** Whether the glasses layer is currently visible. */
  isVisible(): boolean {
    return this.visible;
  }
}

/**
 * Extract a pre-existing offscreen canvas from a `RenderTarget`. WeChat callers
 * may pass `{ canvas }` to reuse a canvas created elsewhere; a string target
 * (canvas id) is ignored in offscreen mode.
 */
function extractCanvasFromTarget(target: RenderTarget): WechatOffscreenCanvasLike | null {
  if (typeof target === "string") return null;
  if (target && typeof target === "object") {
    const t = target as Record<string, unknown>;
    const c = t.canvas;
    if (c && typeof c === "object" && typeof (c as { getContext?: unknown }).getContext === "function") {
      return c as WechatOffscreenCanvasLike;
    }
  }
  return null;
}
