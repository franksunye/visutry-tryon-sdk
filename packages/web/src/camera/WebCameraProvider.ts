import type { CameraConfig, FrameInput, ICameraProvider, SDKError } from "@visutry/tryon-core";
import { createSDKError, t } from "@visutry/tryon-core";

/**
 * Web camera provider backed by `navigator.mediaDevices.getUserMedia`.
 *
 * The provider uses the supplied video element, or owns a hidden one, as the
 * live frame source. The same stream drives the preview and face tracker.
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
  private startPromise: Promise<void> | null = null;
  private streamGeneration = 0;

  constructor(private readonly videoTarget?: HTMLVideoElement | string) {}

  async initialize(config?: CameraConfig): Promise<void> {
    this.assertNotDisposed();
    if (config) this.config = { ...this.config, ...config };
    if (!this.video) {
      const target = typeof this.videoTarget === "string"
        ? document.querySelector(this.videoTarget)
        : this.videoTarget;
      if (this.videoTarget !== undefined && !(target instanceof HTMLVideoElement)) {
        throw createSDKError("CAMERA_NOT_AVAILABLE", "Camera preview target must be a video element");
      }
      this.video = (target as HTMLVideoElement | undefined) ?? document.createElement("video");
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;
    }
  }

  async start(): Promise<void> {
    this.assertNotDisposed();
    if (!this.video) {
      throw createSDKError("CAMERA_NOT_AVAILABLE", t("error.camera_not_initialized"));
    }
    if (this.running) return;
    if (this.startPromise) return this.startPromise;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw createSDKError("UNSUPPORTED_PLATFORM", t("error.camera_unsupported"));
    }

    const pending = this.acquireStream(this.video, this.streamGeneration);
    this.startPromise = pending;
    try {
      await pending;
    } finally {
      if (this.startPromise === pending) this.startPromise = null;
    }
  }

  private async acquireStream(video: HTMLVideoElement, generation: number): Promise<void> {
    let acquired: MediaStream | null = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.config.facingMode,
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          frameRate: { ideal: this.config.frameRate },
        },
        audio: false,
      });
      this.assertCurrentStart(generation);
      this.stream = acquired;
      video.srcObject = acquired;
      await video.play();
      this.assertCurrentStart(generation);
      this.running = true;
      this.attachTrackListeners();
    } catch (err) {
      // getUserMedia and play() are asynchronous. A stop/destroy can occur
      // while either is pending; never let a late stream revive the camera.
      if (acquired) {
        for (const track of acquired.getTracks()) track.stop();
        if (video.srcObject === acquired) video.srcObject = null;
      }
      if (this.stream === acquired) {
        this.detachTrackListeners();
        this.stream = null;
        this.running = false;
      }
      throw this.toSDKError(err);
    }
  }

  stop(): void {
    this.streamGeneration++;
    this.startPromise = null;
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

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw createSDKError("CAMERA_NOT_AVAILABLE", "Camera provider has been destroyed");
    }
  }

  private assertCurrentStart(generation: number): void {
    if (this.disposed || generation !== this.streamGeneration) {
      throw createSDKError("CAMERA_NOT_AVAILABLE", "Camera start was cancelled");
    }
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
    if (err && typeof err === "object" && "code" in err && "recoverable" in err) {
      return err as SDKError;
    }
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
