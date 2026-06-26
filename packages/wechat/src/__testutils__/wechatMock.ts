/**
 * Test-only mocks for the WeChat environment.
 *
 * These let unit tests drive the camera frame stream, the VK face detector and
 * the offscreen canvas without a real `wx` global. The mock classes implement
 * the same `Wechat*Like` interfaces the production code consumes, so they are
 * fully type-checked by `tsc --noEmit` but excluded from the build output.
 */

import type {
  WechatCameraContextLike,
  WechatEnvironment,
  WechatOffscreenCanvasLike,
  WechatSystemInfoLike,
  WechatVKDetectResult,
  WechatVKSessionLike,
} from "../environment.js";
import type { WechatCameraFrame } from "../types.js";

// ---------------------------------------------------------------------------
// Camera context
// ---------------------------------------------------------------------------

export class MockCameraContext implements WechatCameraContextLike {
  frameListeners: Array<(frame: WechatCameraFrame) => void> = [];
  startCalls = 0;
  stopCalls = 0;
  startResult: { errMsg: string } = { errMsg: "startRecord:ok" };

  onCameraFrame(cb: (frame: WechatCameraFrame) => void): void {
    this.frameListeners.push(cb);
  }

  start(cb: (res: { errMsg: string }) => void): void {
    this.startCalls++;
    cb(this.startResult);
  }

  stop(cb: (res: { errMsg: string }) => void): void {
    this.stopCalls++;
    cb({ errMsg: "stopRecord:ok" });
  }

  /** Test helper: push a synthetic frame to all registered listeners. */
  emitFrame(frame: WechatCameraFrame): void {
    for (const listener of this.frameListeners) listener(frame);
  }
}

// ---------------------------------------------------------------------------
// VK session
// ---------------------------------------------------------------------------

export class MockVKSession implements WechatVKSessionLike {
  detectCalls = 0;
  nextResult: WechatVKDetectResult;
  lastInput: { frameBuffer: ArrayBuffer; width: number; height: number } | null = null;
  destroyed = false;

  constructor(opts: { nextResult?: WechatVKDetectResult } = {}) {
    this.nextResult = opts.nextResult ?? { faces: [] };
  }

  detectFace(input: {
    frameBuffer: ArrayBuffer;
    width: number;
    height: number;
  }): WechatVKDetectResult {
    this.detectCalls++;
    this.lastInput = input;
    return this.nextResult;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

// ---------------------------------------------------------------------------
// Offscreen canvas
// ---------------------------------------------------------------------------

export interface MockCanvasOptions {
  width?: number;
  height?: number;
  /** Stub returned by `getContext('webgl')`; `null` disables WebGL. */
  webgl?: unknown | null;
  /** Stub returned by `getContext('2d')`; `null` disables 2D. */
  context2d?: unknown | null;
  /** When set, the canvas exposes `toDataURL` returning this string. */
  toDataURL?: string | null;
}

export class MockCanvas implements WechatOffscreenCanvasLike {
  width: number;
  height: number;
  webglContext: unknown | null;
  context2d: unknown | null;
  toDataURL?: (type?: string, quality?: number) => string;

  constructor(opts: MockCanvasOptions = {}) {
    this.width = opts.width ?? 300;
    this.height = opts.height ?? 400;
    this.webglContext = opts.webgl === undefined ? {} : opts.webgl;
    this.context2d = opts.context2d ?? null;
    if (opts.toDataURL != null) {
      const dataUrl = opts.toDataURL;
      this.toDataURL = () => dataUrl;
    }
  }

  getContext(type: "webgl" | "2d"): unknown {
    if (type === "webgl") return this.webglContext;
    return this.context2d;
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export interface MockWechatEnvironmentOptions {
  cameraContext?: MockCameraContext;
  vkSession?: MockVKSession;
  canvas?: MockCanvas;
  caps?: Partial<{ available: boolean; camera: boolean; vk: boolean; offscreen: boolean }>;
  systemInfo?: Partial<WechatSystemInfoLike>;
  tempFilePath?: string;
}

export class MockWechatEnvironment implements WechatEnvironment {
  cameraContext: MockCameraContext;
  vkSession: MockVKSession;
  canvas: MockCanvas;
  caps: { available: boolean; camera: boolean; vk: boolean; offscreen: boolean } = {
    available: true,
    camera: true,
    vk: true,
    offscreen: true,
  };
  systemInfo: WechatSystemInfoLike;
  tempFilePath: string;
  canvasToTempFilePathCalls = 0;

  constructor(opts: MockWechatEnvironmentOptions = {}) {
    this.cameraContext = opts.cameraContext ?? new MockCameraContext();
    this.vkSession = opts.vkSession ?? new MockVKSession();
    this.canvas = opts.canvas ?? new MockCanvas();
    if (opts.caps) Object.assign(this.caps, opts.caps);
    this.systemInfo = {
      pixelRatio: 2,
      windowWidth: 375,
      windowHeight: 667,
      platform: "devtools",
      SDKVersion: "3.0.0",
      ...opts.systemInfo,
    };
    this.tempFilePath = opts.tempFilePath ?? "wxfile://tmp/snapshot.png";
  }

  isAvailable(): boolean {
    return this.caps.available;
  }
  hasCamera(): boolean {
    return this.caps.camera;
  }
  hasVK(): boolean {
    return this.caps.vk;
  }
  hasOffscreenCanvas(): boolean {
    return this.caps.offscreen;
  }
  createCameraContext(): WechatCameraContextLike {
    return this.cameraContext;
  }
  createOffscreenCanvas(opts: {
    type: "webgl" | "2d";
    width: number;
    height: number;
  }): WechatOffscreenCanvasLike {
    this.canvas.width = opts.width;
    this.canvas.height = opts.height;
    return this.canvas;
  }
  createVKSession(_opts: { track: { face: { mode: number } } }): WechatVKSessionLike {
    return this.vkSession;
  }
  getSystemInfoSync(): WechatSystemInfoLike {
    return this.systemInfo;
  }
  canvasToTempFilePath(_opts: {
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
    this.canvasToTempFilePathCalls++;
    return Promise.resolve({ tempFilePath: this.tempFilePath });
  }
}
