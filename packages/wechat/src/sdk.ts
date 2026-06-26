/**
 * createWechatSDK — convenience facade that wires together the WeChat camera
 * provider, face tracker and renderer into a single try-on entry point.
 *
 * The facade is intentionally small (start / stop / loadGlasses / snapshot /
 * destroy). Advanced callers can use the individual adapter classes directly.
 */

import type {
  CameraConfig,
  GlassesAssetManifest,
  RenderOptions,
  RenderTarget,
  SnapshotOptions,
  SnapshotResult,
  TrackerConfig,
} from "@visutry/tryon-core";
import type { WechatEnvironment } from "./environment.js";
import { createDefaultWechatEnvironment } from "./environment.js";
import { WechatCameraProvider } from "./camera/WechatCameraProvider.js";
import { WechatFaceTracker } from "./tracker/WechatFaceTracker.js";
import { WechatRenderer } from "./renderer/WechatRenderer.js";

export interface WechatSDKConfig {
  /** Inject a custom (mock) environment; defaults to the global `wx`. */
  environment?: WechatEnvironment;
  camera?: CameraConfig;
  tracker?: TrackerConfig;
  renderer?: RenderOptions;
  /** Render target passed to the renderer; defaults to a fresh offscreen canvas. */
  canvasTarget?: RenderTarget;
  /** Preferred canvas type for the renderer; defaults to `webgl`. */
  canvasType?: "webgl" | "2d";
}

export interface WechatSDK {
  /** The composed camera provider. */
  camera: WechatCameraProvider;
  /** The composed face tracker. */
  tracker: WechatFaceTracker;
  /** The composed renderer. */
  renderer: WechatRenderer;

  /** Initialize + start the camera, tracker and renderer. */
  start(): Promise<void>;
  /** Stop the camera frame stream (tracker/renderer stay initialized). */
  stop(): void;
  /** Whether `start()` has been called and not yet stopped/destroyed. */
  isStarted(): boolean;
  /** Load a glasses manifest into the renderer. */
  loadGlasses(asset: GlassesAssetManifest): Promise<void>;
  /** Capture a snapshot from the renderer. */
  snapshot(options?: SnapshotOptions): Promise<SnapshotResult>;
  /** Tear everything down. */
  destroy(): void;
}

/**
 * Build a WeChat try-on SDK facade. All three adapters share the same
 * `WechatEnvironment` so a single injected mock controls the whole stack in
 * tests.
 */
export function createWechatSDK(config: WechatSDKConfig = {}): WechatSDK {
  const env: WechatEnvironment = config.environment ?? createDefaultWechatEnvironment();

  const camera = new WechatCameraProvider({ environment: env });
  const tracker = new WechatFaceTracker({ environment: env });
  const renderer = new WechatRenderer({
    environment: env,
    ...(config.canvasType ? { canvasType: config.canvasType } : {}),
  });

  let started = false;

  return {
    camera,
    tracker,
    renderer,

    async start(): Promise<void> {
      // Initialize camera first so the tracker/renderer know the frame size.
      await camera.initialize(config.camera);
      await camera.start();
      await tracker.initialize(config.tracker);
      await renderer.initialize(config.canvasTarget ?? { type: "wechat" }, config.renderer);
      started = true;
    },

    stop(): void {
      camera.stop();
      started = false;
    },

    isStarted(): boolean {
      return started;
    },

    async loadGlasses(asset: GlassesAssetManifest): Promise<void> {
      await renderer.loadGlasses(asset);
    },

    async snapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
      return renderer.snapshot(options);
    },

    destroy(): void {
      camera.destroy();
      tracker.destroy();
      renderer.dispose();
      started = false;
    },
  };
}
