/**
 * Minimal type declarations for the WeChat Mini Program `wx` global.
 *
 * Covers only the APIs consumed by the @visutry/tryon-wechat adapter
 * (camera, offscreen canvas, visionkit, system info, canvas export).
 */

import type { WechatCameraFrame } from "./types.js";

/** Camera context returned by `wx.createCameraContext()`. */
interface WxCameraContext {
  onCameraFrame(cb: (frame: WechatCameraFrame) => void): void;
  start(cb: (res: { errMsg: string }) => void): void;
  stop(cb: (res: { errMsg: string }) => void): void;
}

/** Offscreen canvas returned by `wx.createOffscreenCanvas()`. */
interface WxOffscreenCanvas {
  width: number;
  height: number;
  getContext(type: "webgl" | "2d"): unknown;
  toDataURL?(type?: string, quality?: number): string;
}

/** Face detected by `wx.VKSession.detectFace()`. */
interface WxVKFace {
  points?: number[];
  transform?: number[];
  confidence?: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

/** Result of `wx.VKSession.detectFace()`. */
interface WxVKDetectResult {
  faces: WxVKFace[];
  detectTime?: number;
}

/** VKSession returned by `wx.createVKSession()`. */
interface WxVKSession {
  detectFace(input: {
    frameBuffer: ArrayBuffer;
    width: number;
    height: number;
  }): WxVKDetectResult;
  detectFaceAsync?(input: {
    frameBuffer: ArrayBuffer;
    width: number;
    height: number;
  }): Promise<WxVKDetectResult>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  off?(event: string, cb: (...args: unknown[]) => void): void;
  destroy(): void;
}

/** System info returned by `wx.getSystemInfoSync()`. */
interface WxSystemInfo {
  pixelRatio: number;
  windowWidth: number;
  windowHeight: number;
  platform: string;
  SDKVersion: string;
}

/** Options for `wx.canvasToTempFilePath()`. */
interface WxCanvasToTempFilePathOptions {
  canvas: WxOffscreenCanvas;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  destWidth?: number;
  destHeight?: number;
  fileType?: "png" | "jpg";
  quality?: number;
  success?: (res: { tempFilePath: string }) => void;
  fail?: (err: unknown) => void;
}

/** Options for `wx.createVKSession()`. */
interface WxVKSessionOptions {
  track: { face: { mode: number } };
}

/** Options for `wx.createOffscreenCanvas()`. */
interface WxOffscreenCanvasOptions {
  type: "webgl" | "2d";
  width: number;
  height: number;
}

/** The WeChat Mini Program global object. */
interface WxMiniProgram {
  createCameraContext(): WxCameraContext;
  createOffscreenCanvas(opts: WxOffscreenCanvasOptions): WxOffscreenCanvas;
  createVKSession(opts: WxVKSessionOptions): WxVKSession;
  getSystemInfoSync(): WxSystemInfo;
  canvasToTempFilePath(opts: WxCanvasToTempFilePathOptions): void;
}

export type { WxMiniProgram };
