/**
 * WeChat environment abstraction.
 *
 * The WeChat Mini Program exposes its capabilities through the global `wx`
 * object (camera context, visionkit VKSession, offscreen canvas, system info,
 * etc.). None of these APIs exist in a Node/jsdom test environment, so the
 * adapter talks to a narrow `WechatEnvironment` interface instead. The default
 * implementation reads from the global `wx`; tests inject a mock implementation.
 */

import type { WechatCameraFrame } from "./types.js";
import type { WxMiniProgram } from "./wx-types.js";

// ---------------------------------------------------------------------------
// Camera context
// ---------------------------------------------------------------------------

/** Subset of `wx.CameraContext` used by the adapter. */
export interface WechatCameraContextLike {
  /** Register a listener that fires for every captured camera frame. */
  onCameraFrame(cb: (frame: WechatCameraFrame) => void): void;
  /** Start the camera frame stream. */
  start(cb: (res: { errMsg: string }) => void): void;
  /** Stop the camera frame stream. */
  stop(cb: (res: { errMsg: string }) => void): void;
}

// ---------------------------------------------------------------------------
// VisionKit (VK) face session
// ---------------------------------------------------------------------------

/**
 * Geometry returned by a VKSession `detectFace` call for a single face.
 *
 * WeChat's VK face mode exposes a 468-point topology that closely mirrors
 * MediaPipe FaceMesh, plus an optional rigid `transform` matrix and a
 * normalized bounding box. Fields are all optional because different SDK
 * versions expose different subsets.
 */
export interface WechatVKFaceGeometry {
  /** Flat landmark array `[x0,y0,z0, x1,y1,z1, ...]`, typically normalized. */
  points?: number[];
  /** 4x4 column-major rigid transformation matrix of the face. */
  transform?: number[];
  /** Detection confidence in `[0,1]`. */
  confidence?: number;
  /** Bounding box in normalized image coordinates (origin top-left, y down). */
  bbox?: { x: number; y: number; width: number; height: number };
  /** Canonical mesh vertices (face-local space), when provided. */
  vertices?: number[];
}

/** Result of a single VKSession `detectFace` invocation. */
export interface WechatVKDetectResult {
  faces: WechatVKFaceGeometry[];
  detectTime?: number;
}

/** Subset of `wx.VKSession` (face mode) used by the adapter. */
export interface WechatVKSessionLike {
  detectFace(input: {
    frameBuffer: ArrayBuffer;
    width: number;
    height: number;
  }): WechatVKDetectResult;
  detectFaceAsync?(input: {
    frameBuffer: ArrayBuffer;
    width: number;
    height: number;
  }): Promise<WechatVKDetectResult>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  off?(event: string, cb: (...args: unknown[]) => void): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Offscreen canvas
// ---------------------------------------------------------------------------

/** Subset of `wx.OffscreenCanvas` used by the adapter. */
export interface WechatOffscreenCanvasLike {
  width: number;
  height: number;
  /** Returns a WebGL or 2D rendering context, or `null` when unavailable. */
  getContext(type: "webgl" | "2d"): unknown;
  /** 2D-only convenience API; available on `type: '2d'` canvases. */
  toDataURL?(type?: string, quality?: number): string;
}

// ---------------------------------------------------------------------------
// System info
// ---------------------------------------------------------------------------

/** Subset of `wx.getSystemInfoSync()` used by the adapter. */
export interface WechatSystemInfoLike {
  pixelRatio: number;
  windowWidth: number;
  windowHeight: number;
  platform: string;
  SDKVersion: string;
}

// ---------------------------------------------------------------------------
// Environment contract
// ---------------------------------------------------------------------------

/**
 * Abstraction over the WeChat `wx.*` capabilities required by this adapter.
 *
 * Every adapter class (`WechatCameraProvider`, `WechatFaceTracker`,
 * `WechatRenderer`) accepts an optional `WechatEnvironment` so that tests can
 * inject deterministic mocks without touching the global `wx`.
 */
export interface WechatEnvironment {
  /** Whether the global `wx` is present at all (i.e. we are in a Mini Program). */
  isAvailable(): boolean;
  /** Whether `wx.createCameraContext` exists. */
  hasCamera(): boolean;
  /** Whether `wx.createVKSession` exists (visionkit face tracking). */
  hasVK(): boolean;
  /** Whether `wx.createOffscreenCanvas` exists. */
  hasOffscreenCanvas(): boolean;
  createCameraContext(): WechatCameraContextLike;
  createOffscreenCanvas(opts: {
    type: "webgl" | "2d";
    width: number;
    height: number;
  }): WechatOffscreenCanvasLike;
  createVKSession(opts: { track: { face: { mode: number } } }): WechatVKSessionLike;
  getSystemInfoSync(): WechatSystemInfoLike;
  /** Promisified `wx.canvasToTempFilePath`. */
  canvasToTempFilePath(opts: {
    canvas: WechatOffscreenCanvasLike;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    destWidth?: number;
    destHeight?: number;
    fileType?: "png" | "jpg";
    quality?: number;
  }): Promise<{ tempFilePath: string }>;
}

// ---------------------------------------------------------------------------
// Default implementation (reads the global `wx`)
// ---------------------------------------------------------------------------

// The WeChat runtime injects a global `wx`. We declare it loosely and guard
// every access with an existence check so the module is safe to import (and
// type-check) outside of a Mini Program.
declare const wx: WxMiniProgram | undefined;

/**
 * Default `WechatEnvironment` backed by the global `wx` object. When `wx` is
 * absent (Node, browser, test runner), every `has*` probe returns `false` and
 * the factories throw — callers are expected to check availability first.
 */
export class DefaultWechatEnvironment implements WechatEnvironment {
  private getWx(): WxMiniProgram | undefined {
    // `typeof wx` is safe even when the global is undefined (yields "undefined").
    if (typeof wx !== "undefined" && wx) return wx;
    // Fall back to `globalThis.wx` for environments that expose it there.
    try {
      const g = globalThis as Record<string, unknown>;
      const gw = g.wx as WxMiniProgram | undefined;
      if (gw && typeof gw === "object") return gw;
    } catch {
      /* ignore — no globalThis access */
    }
    return undefined;
  }

  isAvailable(): boolean {
    return !!this.getWx();
  }

  hasCamera(): boolean {
    const w = this.getWx();
    return !!w && typeof w.createCameraContext === "function";
  }

  hasVK(): boolean {
    const w = this.getWx();
    return !!w && typeof w.createVKSession === "function";
  }

  hasOffscreenCanvas(): boolean {
    const w = this.getWx();
    return !!w && typeof w.createOffscreenCanvas === "function";
  }

  createCameraContext(): WechatCameraContextLike {
    const w = this.getWx();
    if (!w || typeof w.createCameraContext !== "function") {
      throw new Error("wx.createCameraContext is not available in this environment");
    }
    return w.createCameraContext();
  }

  createOffscreenCanvas(opts: {
    type: "webgl" | "2d";
    width: number;
    height: number;
  }): WechatOffscreenCanvasLike {
    const w = this.getWx();
    if (!w || typeof w.createOffscreenCanvas !== "function") {
      throw new Error("wx.createOffscreenCanvas is not available in this environment");
    }
    return w.createOffscreenCanvas(opts);
  }

  createVKSession(opts: { track: { face: { mode: number } } }): WechatVKSessionLike {
    const w = this.getWx();
    if (!w || typeof w.createVKSession !== "function") {
      throw new Error("wx.createVKSession is not available in this environment");
    }
    return w.createVKSession(opts);
  }

  getSystemInfoSync(): WechatSystemInfoLike {
    const w = this.getWx();
    if (!w || typeof w.getSystemInfoSync !== "function") {
      // Safe fallback so callers never crash outside of a Mini Program.
      return {
        pixelRatio: 1,
        windowWidth: 375,
        windowHeight: 667,
        platform: "unknown",
        SDKVersion: "0.0.0",
      };
    }
    return w.getSystemInfoSync();
  }

  canvasToTempFilePath(opts: {
    canvas: WechatOffscreenCanvasLike;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    destWidth?: number;
    destHeight?: number;
    fileType?: "png" | "jpg";
    quality?: number;
  }): Promise<{ tempFilePath: string }> {
    const w = this.getWx();
    if (!w || typeof w.canvasToTempFilePath !== "function") {
      return Promise.reject(new Error("wx.canvasToTempFilePath is not available in this environment"));
    }
    return new Promise((resolve, reject) => {
      try {
        w.canvasToTempFilePath({
          ...opts,
          success: (res: { tempFilePath: string }) => resolve(res),
          fail: (err: unknown) => reject(err),
        });
      } catch (e) {
        reject(e);
      }
    });
  }
}

/** Construct a `WechatEnvironment` backed by the global `wx`. */
export function createDefaultWechatEnvironment(): WechatEnvironment {
  return new DefaultWechatEnvironment();
}
