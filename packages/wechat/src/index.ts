/**
 * @visutry/tryon-wechat
 *
 * WeChat Mini Program adapter (experimental) for the VisuTry Face Geometry &
 * AR Glasses Try-On SDK. Provides camera, visionkit face tracker and
 * offscreen-canvas renderer implementations of the core contracts, plus a
 * `createWechatSDK` facade that composes them.
 *
 * Because the Mini Program runtime has no DOM and no `wx` in Node/jsdom, every
 * adapter depends on a `WechatEnvironment` interface (default implementation
 * reads the global `wx`); tests inject a mock implementation.
 */

// Environment abstraction
export {
  DefaultWechatEnvironment,
  createDefaultWechatEnvironment,
} from "./environment.js";
export type {
  WechatEnvironment,
  WechatCameraContextLike,
  WechatVKFaceGeometry,
  WechatVKDetectResult,
  WechatVKSessionLike,
  WechatOffscreenCanvasLike,
  WechatSystemInfoLike,
} from "./environment.js";

// Frame types
export type { WechatCameraFrame, WechatFrameInput } from "./types.js";
export { isWechatFrameInput } from "./types.js";

// Adapters
export { WechatCameraProvider } from "./camera/WechatCameraProvider.js";
export type { WechatCameraProviderOptions } from "./camera/WechatCameraProvider.js";

export { WechatFaceTracker } from "./tracker/WechatFaceTracker.js";
export type { WechatFaceTrackerOptions } from "./tracker/WechatFaceTracker.js";

export { WechatRenderer } from "./renderer/WechatRenderer.js";
export type { WechatRendererOptions } from "./renderer/WechatRenderer.js";

// SDK facade
export { createWechatSDK } from "./sdk.js";
export type { WechatSDK, WechatSDKConfig } from "./sdk.js";
