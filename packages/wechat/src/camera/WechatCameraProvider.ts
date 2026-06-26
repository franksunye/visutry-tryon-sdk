/**
 * WechatCameraProvider — implements `ICameraProvider` on top of
 * `wx.createCameraContext()`.
 *
 * The WeChat camera is driven by a `<camera>` component in the host page; the
 * adapter only consumes the frame stream exposed by `CameraContext`. Each frame
 * arrives via `onCameraFrame` as `{ data: ArrayBuffer, width, height }` and is
 * cached so `getCurrentFrame()` can return the latest one synchronously.
 */

import type { CameraConfig, FrameInput, ICameraProvider } from "@visutry/tryon-core";
import { createSDKError } from "@visutry/tryon-core";
import type { WechatCameraContextLike, WechatEnvironment } from "../environment.js";
import { createDefaultWechatEnvironment } from "../environment.js";
import type { WechatCameraFrame, WechatFrameInput } from "../types.js";

export interface WechatCameraProviderOptions {
  environment?: WechatEnvironment;
}

export class WechatCameraProvider implements ICameraProvider {
  private readonly env: WechatEnvironment;
  private config: CameraConfig = {};
  private ctx: WechatCameraContextLike | null = null;
  private currentFrame: WechatFrameInput | null = null;
  private listening = false;
  private frameHandler: ((frame: WechatCameraFrame) => void) | null = null;

  constructor(options: WechatCameraProviderOptions = {}) {
    this.env = options.environment ?? createDefaultWechatEnvironment();
  }

  async initialize(config?: CameraConfig): Promise<void> {
    this.config = { mirror: true, ...config };
    if (!this.env.isAvailable() || !this.env.hasCamera()) {
      throw createSDKError(
        "CAMERA_NOT_AVAILABLE",
        "WeChat camera API (wx.createCameraContext) is not available in this environment",
      );
    }
    this.ctx = this.env.createCameraContext();
    this.currentFrame = null;
    this.listening = false;
  }

  async start(): Promise<void> {
    if (!this.ctx) {
      throw createSDKError(
        "CAMERA_NOT_AVAILABLE",
        "Camera context is not initialized; call initialize() first",
      );
    }
    // Register the frame listener before starting so the first frame is captured.
    this.frameHandler = (frame: WechatCameraFrame) => {
      this.currentFrame = {
        data: frame.data,
        width: frame.width,
        height: frame.height,
        mirror: this.config.mirror,
      };
    };
    this.ctx.onCameraFrame(this.frameHandler);
    await new Promise<void>((resolve, reject) => {
      this.ctx!.start((res) => {
        if (res && /ok/i.test(res.errMsg ?? "")) {
          this.listening = true;
          resolve();
        } else {
          reject(
            createSDKError(
              "CAMERA_NOT_AVAILABLE",
              `WeChat camera start failed: ${res?.errMsg ?? "unknown error"}`,
            ),
          );
        }
      });
    });
  }

  stop(): void {
    if (this.ctx && this.listening) {
      try {
        this.ctx.stop(() => {
          /* noop */
        });
      } catch (err) {
        console.warn("[VisuTrySDK]", "WechatCameraProvider: error stopping camera:", err);
      }
      this.listening = false;
    }
    this.currentFrame = null;
  }

  getCurrentFrame(): FrameInput | null {
    return this.currentFrame;
  }

  async switchCamera(): Promise<void> {
    // The WeChat camera device is selected via the `<camera device-position>`
    // component property, not via the CameraContext API. The adapter toggles
    // the configured facing mode and relies on the host page to bind it to
    // `device-position`. We re-create the context so a fresh stream is opened.
    this.config.facingMode = this.config.facingMode === "environment" ? "user" : "environment";
    const wasListening = this.listening;
    this.stop();
    if (!this.env.hasCamera()) return;
    this.ctx = this.env.createCameraContext();
    if (wasListening) {
      await this.start();
    }
  }

  destroy(): void {
    this.stop();
    this.ctx = null;
    this.frameHandler = null;
  }

  /** Current camera configuration (exposed for the SDK facade / debugging). */
  getConfig(): CameraConfig {
    return this.config;
  }
}
