import type { CameraConfig, FrameInput, ICameraProvider, SDKError } from "@visutry/tryon-core";
import { createSDKError, t } from "@visutry/tryon-core";

/**
 * Web camera provider backed by `navigator.mediaDevices.getUserMedia`.
 *
 * The provider owns a hidden `<video>` element used as the live frame source.
 * `getCurrentFrame()` returns that video element (wrapped as a `FrameInput`)
 * which the tracker samples with `detectForVideo`.
 */
export class WebCameraProvider implements ICameraProvider {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private streamLost = false;
  private disposed = false;
  private activeTrack: MediaStreamTrack | null = null;
  private config: Required<CameraConfig> = {
    facingMode: "user",
    width: 1280,
    height: 720,
    frameRate: 30,
    mirror: true,
  };
  private running = false;

  async initialize(config?: CameraConfig): Promise<void> {
    if (config) this.config = { ...this.config, ...config };
    if (!this.video) {
      this.video = document.createElement("video");
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;
    }
  }

  async start(): Promise<void> {
    if (!this.video) {
      throw createSDKError("CAMERA_NOT_AVAILABLE", t("error.camera_not_initialized"));
    }
    if (this.running) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw createSDKError("UNSUPPORTED_PLATFORM", t("error.camera_unsupported"));
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.config.facingMode,
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          frameRate: { ideal: this.config.frameRate },
        },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.running = true;
      this.attachTrackListeners();
    } catch (err) {
      throw this.toSDKError(err);
    }
  }

  stop(): void {
    this.running = false;
    this.detachTrackListeners();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  getCurrentFrame(): FrameInput | null {
    if (this.disposed) return null;
    if (!this.video || !this.running || this.video.readyState < 2) return null;
    if (this.streamLost) return null;
    return { __brand: "HTMLVideoElement", el: this.video } as unknown as FrameInput;
  }

  isStreamLost(): boolean {
    return this.streamLost;
  }

  async switchCamera(): Promise<void> {
    const previousFacingMode = this.config.facingMode;
    this.config.facingMode = previousFacingMode === "user" ? "environment" : "user";
    this.stop();
    try {
      await this.start();
    } catch (err) {
      // Rollback facingMode on failure so config stays consistent.
      this.config.facingMode = previousFacingMode;
      throw err;
    }
  }

  destroy(): void {
    this.disposed = true;
    this.stop();
    this.video = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get videoElement(): HTMLVideoElement | null {
    return this.video;
  }

  get mirror(): boolean {
    return this.config.mirror;
  }

  // -----------------------------------------------------------------------

  private attachTrackListeners(): void {
    this.streamLost = false;
    const tracks = this.stream?.getTracks() ?? [];
    this.activeTrack = tracks.find((track) => track.kind === "video") ?? tracks[0] ?? null;
    if (this.activeTrack) {
      this.activeTrack.onended = () => {
        this.streamLost = true;
        console.warn("[VisuTrySDK]", "WebCameraProvider: camera stream ended.");
      };
      this.activeTrack.onmute = () => {
        this.streamLost = true;
        console.warn("[VisuTrySDK]", "WebCameraProvider: camera stream muted.");
      };
      this.activeTrack.onunmute = () => {
        this.streamLost = false;
        console.info("[VisuTrySDK]", "WebCameraProvider: camera stream unmuted.");
      };
    }
  }

  private detachTrackListeners(): void {
    if (this.activeTrack) {
      this.activeTrack.onended = null;
      this.activeTrack.onmute = null;
      this.activeTrack.onunmute = null;
      this.activeTrack = null;
    }
    this.streamLost = false;
  }

  private toSDKError(err: unknown): SDKError {
    const e = err as DOMException;
    if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
      return createSDKError("CAMERA_PERMISSION_DENIED", t("error.camera_permission_denied"), err);
    }
    if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError") {
      return createSDKError("CAMERA_NOT_AVAILABLE", t("error.camera_not_available"), err);
    }
    return createSDKError("CAMERA_NOT_AVAILABLE", e?.message ?? t("error.camera_not_available"), err);
  }
}
