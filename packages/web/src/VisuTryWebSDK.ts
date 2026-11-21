/**
 * VisuTryWebSDK — the H5 facade that orchestrates camera, MediaPipe tracker,
 * Three.js renderer, glasses pose solver, pose smoother, quality gate, face
 * shape scorer and privacy guard into a single `VisuTrySDK` implementation.
 *
 * The facade runs a tracking/render loop via `requestAnimationFrame`. Each
 * frame: detect → solve pose → smooth → quality-gate (tryon) → render. Events
 * are emitted for face detection, loss, pose updates, glasses loading,
 * face-shape analysis results, performance stats and errors.
 */

import type {
  FaceAnalysisInput,
  FaceShapeResult,
  GlassesAssetManifest,
  GlassesPose,
  NormalizedFaceResult,
  PerformanceStats,
  PrivacyConfig,
  RenderOptions,
  RenderTarget,
  SDKError,
  SnapshotOptions,
  SnapshotResult,
  TrackerConfig,
  VisuTrySDK,
  VisuTrySDKConfig,
  VisuTrySDKEvents,
} from "@visutry/tryon-core";
import {
  DEFAULT_POSE_SMOOTHING_CONFIG,
  DEFAULT_PRIVACY_CONFIG,
  FaceShapeScorer,
  GlassesPoseSolver,
  PoseSmoother,
  PrivacyGuard,
  QualityGate,
  createSDKError,
  t,
} from "@visutry/tryon-core";
import type { MediaPipeTrackerOptions } from "./tracker/MediaPipeFaceTracker.js";
import { MediaPipeFaceTracker } from "./tracker/MediaPipeFaceTracker.js";
import { WebCameraProvider } from "./camera/WebCameraProvider.js";
import { ThreeJsRenderer } from "./renderer/ThreeJsRenderer.js";

// Re-export the ImageAnalyzer (extracted to its own module so that
// `@visutry/tryon-web/analyzer` subpath export does not pull in Three.js).
export {
  createVisuTryImageAnalyzer,
  type ImageAnalyzer,
  type ImageAnalysisResult,
} from "./ImageAnalyzer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventName = keyof VisuTrySDKEvents;
type EventHandler<E extends EventName> = VisuTrySDKEvents[E];

export interface VisuTryWebSDKFactoryOptions extends VisuTrySDKConfig {
  /** The canvas (or selector) the Three.js renderer will draw on. */
  canvas: RenderTarget;
  /**
   * Optional live camera preview. The tracker reads this same video element.
   * With a target supplied, the SDK mirrors video and canvas together according
   * to camera.mirror (default true). Display both in the same aspect-ratio box;
   * do not separately mirror or crop either layer in CSS.
   */
  video?: HTMLVideoElement | string;
  /**
   * "camera" exports video + 3D overlay; "overlay" exports only the 3D layer.
   * Defaults to "camera" with a video target, otherwise the legacy "overlay".
   * Camera snapshots require a running stream and honor SnapshotOptions.mirror.
   */
  snapshotMode?: "camera" | "overlay";
  /** MediaPipe-specific options (wasm path, model path, custom index map). */
  mediaPipeOptions?: MediaPipeTrackerOptions;
  /** Render options passed through to the renderer. */
  rendererOptions?: RenderOptions;
  /** Tracker config override. */
  trackerConfig?: TrackerConfig;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ready-to-use `VisuTrySDK` instance for the web.
 *
 * The returned SDK is *constructed* but not *initialised* — call
 * `initialize()` to load MediaPipe and set up the renderer, then
 * `startCamera()` / `startTryOn()` to begin tracking.
 */
export function createVisuTryWebSDK(options: VisuTryWebSDKFactoryOptions): VisuTrySDK<Blob> {
  return new VisuTryWebSDKImpl(options);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class VisuTryWebSDKImpl implements VisuTrySDK<Blob> {
  // --- Composition --------------------------------------------------------
  private readonly camera: WebCameraProvider;
  private readonly tracker: MediaPipeFaceTracker;
  private readonly renderer: ThreeJsRenderer;
  private readonly poseSolver: GlassesPoseSolver;
  private readonly smoother: PoseSmoother;
  private readonly qualityGate: QualityGate;
  private readonly scorer: FaceShapeScorer;
  private readonly privacy: PrivacyGuard;

  // --- Config -------------------------------------------------------------
  private readonly factoryOptions: VisuTryWebSDKFactoryOptions;
  private readonly canvasTarget: RenderTarget;
  private readonly renderOptions: RenderOptions;
  private readonly trackerConfig: TrackerConfig;

  // --- State --------------------------------------------------------------
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private cameraStarted = false;
  private cameraStartPromise: Promise<void> | null = null;
  private cameraGeneration = 0;
  private tryOnRunning = false;
  private destroyed = false;
  private currentAsset: GlassesAssetManifest | null = null;
  private rafId: number | null = null;
  private loopGeneration = 0;
  private loadGlassesPromise: Promise<void> | null = null;
  private analysisInProgress = false;
  private cancelFrameCollection: ((error: SDKError) => void) | null = null;

  // --- Events -------------------------------------------------------------
  private readonly listeners: Map<EventName, Set<(...args: unknown[]) => void>> = new Map();

  // --- Performance --------------------------------------------------------
  private readonly frameTimes: number[] = [];
  private readonly detectLatencies: number[] = [];
  private readonly renderLatencies: number[] = [];
  private trackingLostCount = 0;
  private lastFaceDetected = false;
  private lastPerformanceEmit = 0;
  private consecutiveErrors = 0;
  private static readonly MAX_CONSECUTIVE_ERRORS = 10;
  private visibilityHandler: (() => void) | null = null;
  private readonly presentationStyles = new Map<HTMLElement, { original: string; applied: string }>();
  private presentationVideo: HTMLVideoElement | null = null;
  private readonly onCameraResize = (): void => {
    if (this.cameraStarted && !this.destroyed) this.syncCameraPresentation();
  };

  // --- Analysis -----------------------------------------------------------
  private analysisTargetFrames = 5;
  private analysisIntervalMs = 250;

  private static readonly MAX_PERF_SAMPLES = 60;
  private static readonly PERF_EMIT_INTERVAL_MS = 1000;

  constructor(options: VisuTryWebSDKFactoryOptions) {
    this.factoryOptions = options;
    this.canvasTarget = options.canvas;
    this.renderOptions = options.renderer ?? options.rendererOptions ?? {
      width: options.camera?.width ?? 640,
      height: options.camera?.height ?? 480,
      mirror: options.camera?.mirror ?? true,
      background: "transparent",
    };
    this.trackerConfig = options.tracker ?? options.trackerConfig ?? { mode: "balanced" };

    this.camera = new WebCameraProvider(options.video);
    this.tracker = new MediaPipeFaceTracker(
      options.mediaPipeOptions ?? {},
      this.trackerConfig,
    );
    this.renderer = new ThreeJsRenderer();
    this.poseSolver = new GlassesPoseSolver();
    this.smoother = new PoseSmoother(options.smoothing ?? DEFAULT_POSE_SMOOTHING_CONFIG);
    this.qualityGate = new QualityGate();
    this.scorer = new FaceShapeScorer();
    this.privacy = new PrivacyGuard(options.privacy ?? DEFAULT_PRIVACY_CONFIG);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.assertNotDestroyed();
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    const pending = this.initializeInternal();
    this.initializePromise = pending;
    try {
      await pending;
    } finally {
      if (this.initializePromise === pending) this.initializePromise = null;
    }
  }

  private async initializeInternal(): Promise<void> {
    try {
      // Initialize tracker (loads MediaPipe wasm + model).
      await this.tracker.initialize(this.trackerConfig);
      if (this.destroyed) {
        // A landmarker may have finished creating after destroy() ran.
        this.tracker.destroy();
        this.assertNotDestroyed();
      }
      // Initialize renderer (creates WebGL context + camera + lights).
      await this.renderer.initialize(this.canvasTarget, this.renderOptions);
      this.assertNotDestroyed();
      this.initialized = true;
      this.emit("ready");
    } catch (err) {
      this.emitError(err);
      // A partially initialized SDK cannot be reused safely. Callers retry
      // with a fresh instance; release any tracker/GPU resources already made.
      this.destroy();
      throw err;
    }
  }

  async startCamera(): Promise<void> {
    this.assertNotDestroyed();
    if (this.cameraStarted) return;
    if (this.cameraStartPromise) return this.cameraStartPromise;
    const pending = this.startCameraInternal(this.cameraGeneration);
    this.cameraStartPromise = pending;
    try {
      await pending;
    } finally {
      if (this.cameraStartPromise === pending) this.cameraStartPromise = null;
    }
  }

  private async startCameraInternal(generation: number): Promise<void> {
    try {
      if (!this.initialized) await this.initialize();
      this.assertCameraStartCurrent(generation);
      await this.camera.initialize({
        ...this.factoryOptions.camera,
        mirror: this.factoryOptions.camera?.mirror ?? this.renderOptions.mirror ?? true,
      });
      this.assertCameraStartCurrent(generation);
      await this.camera.start();
      this.assertCameraStartCurrent(generation);
      this.cameraStarted = true;
      this.syncCameraPresentation();
    } catch (err) {
      // A cancelled old request must not stop a newer camera start.
      if (generation === this.cameraGeneration) {
        this.camera.stop();
        this.cameraStarted = false;
      }
      this.emitError(err);
      throw err;
    }
  }

  stopCamera(): void {
    this.cameraGeneration++;
    this.cameraStartPromise = null;
    this.cancelFrameCollection?.(createSDKError("UNKNOWN", "Camera analysis was cancelled"));
    this.stopTryOn();
    this.camera.stop();
    this.cameraStarted = false;
  }

  async startTryOn(): Promise<void> {
    this.assertNotDestroyed();
    const generation = this.loopGeneration;
    if (!this.cameraStarted) {
      await this.startCamera();
    }
    this.assertNotDestroyed();
    if (generation !== this.loopGeneration) {
      throw createSDKError("UNKNOWN", "Try-on start was cancelled");
    }
    if (this.tryOnRunning) return;
    this.tryOnRunning = true;
    this.smoother.reset();
    this.lastFaceDetected = false;
    this.consecutiveErrors = 0;
    this.setupVisibilityHandler();
    this.loop();
  }

  stopTryOn(): void {
    this.tryOnRunning = false;
    this.loopGeneration++;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.teardownVisibilityHandler();
    this.renderer.setVisible(false);
  }

  // -----------------------------------------------------------------------
  // Glasses
  // -----------------------------------------------------------------------

  async loadGlasses(asset: GlassesAssetManifest): Promise<void> {
    this.assertNotDestroyed();
    // Link each request to the previous request immediately. Multiple callers
    // must not all wait for the same first load and then start concurrently.
    const promise = (this.loadGlassesPromise ?? Promise.resolve())
      .catch(() => { /* A failed replacement does not block the next one. */ })
      .then(() => {
        this.assertNotDestroyed();
        return this.loadGlassesInternal(asset);
      });
    this.loadGlassesPromise = promise;
    try {
      await promise;
    } finally {
      if (this.loadGlassesPromise === promise) this.loadGlassesPromise = null;
    }
  }

  private async loadGlassesInternal(asset: GlassesAssetManifest): Promise<void> {
    try {
      await this.renderer.loadGlasses(asset);
      this.assertNotDestroyed();
      this.currentAsset = asset;
      this.emit("glassesLoaded", asset);
    } catch (err) {
      const sdkErr = this.toSDKError(err);
      if (!this.currentAsset) this.stopCamera();
      this.emit("glassesLoadFailed", sdkErr);
      throw sdkErr;
    }
  }

  async switchGlasses(asset: GlassesAssetManifest): Promise<void> {
    // The previous model remains visible until the replacement loads; failures
    // leave both the previous model and its identity unchanged.
    await this.loadGlasses(asset);
  }

  // -----------------------------------------------------------------------
  // Face shape analysis
  // -----------------------------------------------------------------------

  async analyzeFaceShape(input?: FaceAnalysisInput): Promise<FaceShapeResult> {
    this.assertNotDestroyed();
    if (this.analysisInProgress) {
      throw createSDKError("ANALYSIS_IN_PROGRESS", t("error.analysis_in_progress"));
    }
    this.analysisInProgress = true;
    try {
      // If the caller provides pre-collected frames, score them directly.
      if (input?.frames && input.frames.length > 0) {
        const result = this.scorer.scoreFrames(input.frames);
        this.emit("faceShapeAnalyzed", result);
        return result;
      }

      // Collect frames from the live camera.
      const sampleFrames = input?.config?.sampleFrames ?? this.analysisTargetFrames;
      const intervalMs = input?.config?.sampleIntervalMs ?? this.analysisIntervalMs;
      const requireFrontal = input?.config?.requireFrontal ?? true;
      const cameraGeneration = this.cameraGeneration;

      if (!this.cameraStarted) {
        await this.startCamera();
      }
      this.assertNotDestroyed();
      if (cameraGeneration !== this.cameraGeneration) {
        throw createSDKError("UNKNOWN", "Camera analysis was cancelled");
      }

      // Pause the try-on loop to avoid RAF conflicts during analysis.
      const wasTryOnRunning = this.tryOnRunning;
      if (wasTryOnRunning) this.stopTryOn();
      const pausedLoopGeneration = this.loopGeneration;

      try {
        const frames = await this.collectAnalysisFrames(sampleFrames, intervalMs, requireFrontal);
        this.assertNotDestroyed();
        if (cameraGeneration !== this.cameraGeneration) {
          throw createSDKError("UNKNOWN", "Camera analysis was cancelled");
        }
        const result = this.scorer.scoreFrames(frames);
        this.emit("faceShapeAnalyzed", result);
        return result;
      } finally {
        if (wasTryOnRunning && !this.destroyed && this.cameraStarted
          && cameraGeneration === this.cameraGeneration && pausedLoopGeneration === this.loopGeneration) {
          await this.startTryOn();
        }
      }
    } finally {
      this.analysisInProgress = false;
    }
  }

  /**
   * Analyze face shape from a single still image (photo upload).
   * Does NOT require camera or try-on loop — only needs the tracker's
   * IMAGE-mode detection.
   *
   * Accepts: HTMLImageElement, HTMLCanvasElement, ImageBitmap, or HTMLVideoElement.
   * For File/Blob inputs, callers should first load them into an Image.
   */
  async analyzeFaceShapeFromImage(image: unknown): Promise<FaceShapeResult> {
    this.assertNotDestroyed();
    if (this.analysisInProgress) {
      throw createSDKError("ANALYSIS_IN_PROGRESS", t("error.analysis_in_progress"));
    }
    this.analysisInProgress = true;
    try {
      const face = await this.tracker.detectImage(image);
      this.assertNotDestroyed();
      if (!face) {
        throw createSDKError("FACE_NOT_DETECTED", "No face detected in the provided image");
      }
      const result = this.scorer.score(face);
      this.emit("faceShapeAnalyzed", result);
      return result;
    } finally {
      this.analysisInProgress = false;
    }
  }

  /**
   * Collect `targetCount` quality-gated face frames from the camera, spaced at
   * least `intervalMs` apart. Rejects if no quality frames arrive within a
   * reasonable timeout.
   */
  private collectAnalysisFrames(
    targetCount: number,
    intervalMs: number,
    requireFrontal: boolean,
  ): Promise<NormalizedFaceResult[]> {
    return new Promise((resolve, reject) => {
      const frames: NormalizedFaceResult[] = [];
      const cameraGeneration = this.cameraGeneration;
      const startTime = performance.now();
      const maxWaitMs = Math.max(targetCount * intervalMs + 2000, 5000);
      let lastCollected = 0;
      let localRafId: number | null = null;
      let settled = false;

      const cleanup = (): void => {
        if (localRafId !== null) cancelAnimationFrame(localRafId);
        localRafId = null;
        if (this.cancelFrameCollection === cancel) this.cancelFrameCollection = null;
      };
      const cancel = (error: SDKError): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const isCurrent = (): boolean => {
        if (settled) return false;
        if (this.destroyed) {
          cancel(createSDKError("UNKNOWN", t("error.sdk_destroyed")));
          return false;
        }
        if (cameraGeneration !== this.cameraGeneration) {
          cancel(createSDKError("UNKNOWN", "Camera analysis was cancelled"));
          return false;
        }
        return true;
      };
      this.cancelFrameCollection = cancel;

      const collect = (): void => {
        localRafId = null;
        if (!isCurrent()) return;
        const now = performance.now();
        if (now - startTime > maxWaitMs) {
          cancel(createSDKError("UNKNOWN", t("error.analysis_timeout")));
          return;
        }

        const frame = this.camera.getCurrentFrame();
        if (!frame) {
          localRafId = requestAnimationFrame(collect);
          return;
        }

        this.tracker.detect(frame).then((face) => {
          if (!isCurrent()) return;
          if (!face) {
            localRafId = requestAnimationFrame(collect);
            return;
          }

          const gate = this.qualityGate.evaluate({ face, mode: "analysis" });
          if (!gate.passed) {
            localRafId = requestAnimationFrame(collect);
            return;
          }

          if (requireFrontal && face.quality.frontalScore < 0.75) {
            localRafId = requestAnimationFrame(collect);
            return;
          }

          // Throttle by interval.
          if (now - lastCollected < intervalMs && frames.length > 0) {
            localRafId = requestAnimationFrame(collect);
            return;
          }
          lastCollected = now;

          frames.push(face);
          if (frames.length >= targetCount) {
            settled = true;
            cleanup();
            resolve(frames);
          } else {
            localRafId = requestAnimationFrame(collect);
          }
        }).catch((err) => {
          cancel(this.toSDKError(err));
        });
      };

      collect();
    });
  }

  // -----------------------------------------------------------------------
  // Snapshot
  // -----------------------------------------------------------------------

  async snapshot(options?: SnapshotOptions): Promise<SnapshotResult<Blob>> {
    this.assertNotDestroyed();

    // Privacy guard: snapshot export must be explicitly allowed.
    if (!this.privacy.canExportSnapshot()) {
      throw createSDKError("UNKNOWN", t("error.snapshot_disabled"));
    }

    try {
      const mode = this.factoryOptions.snapshotMode ?? (this.factoryOptions.video ? "camera" : "overlay");
      if (mode === "camera") return this.captureCameraSnapshot(options);
      return await this.renderer.snapshot(options);
    } catch (err) {
      throw this.toSDKError(err);
    }
  }

  private captureCameraSnapshot(options?: SnapshotOptions): SnapshotResult<Blob> {
    const video = this.camera.videoElement;
    if (!this.cameraStarted || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      throw createSDKError("SNAPSHOT_FAILED", "A running camera frame is required for a camera snapshot");
    }
    const width = options?.width ?? video.videoWidth;
    const height = options?.height ?? video.videoHeight;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw createSDKError("SNAPSHOT_FAILED", "Snapshot dimensions must be positive integers");
    }
    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) throw createSDKError("SNAPSHOT_FAILED", "Cannot create snapshot canvas");

    // Video pixels and WebGL pixels are both unmirrored. Apply the requested
    // output transform once to their shared composition, independently of CSS.
    if (options?.mirror ?? this.camera.mirror) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    this.renderer.drawToCanvas(context, width, height);
    return {
      dataUrl: output.toDataURL(options?.format ?? "image/png", options?.quality ?? 0.92),
      width,
      height,
      timestamp: Date.now(),
    };
  }

  private syncCameraPresentation(): void {
    const video = this.camera.videoElement;
    if (!video) return;
    if (this.presentationVideo !== video) {
      this.presentationVideo?.removeEventListener("resize", this.onCameraResize);
      this.presentationVideo = video;
      video.addEventListener("resize", this.onCameraResize);
    }
    // Match the actual camera stream rather than its requested ideal size.
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      this.renderer.resize(video.videoWidth, video.videoHeight);
    }
    if (!this.factoryOptions.video) return;

    const target = this.canvasTarget;
    const canvas = typeof target === "string"
      ? document.querySelector(target)
      : target instanceof HTMLCanvasElement
        ? target
        : (target as { el?: unknown }).el;
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw createSDKError("RENDERER_INIT_FAILED", "Camera preview requires a canvas element");
    }
    const transform = this.camera.mirror ? "scaleX(-1)" : "none";
    for (const element of [video, canvas]) {
      if (!this.presentationStyles.has(element)) {
        this.presentationStyles.set(element, { original: element.style.transform, applied: transform });
      }
      element.style.transform = transform;
    }
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  on<E extends EventName>(eventName: E, handler: EventHandler<E>): void {
    let set = this.listeners.get(eventName);
    if (!set) {
      set = new Set();
      this.listeners.set(eventName, set);
    }
    set.add(handler as (...args: unknown[]) => void);
  }

  off<E extends EventName>(eventName: E, handler: EventHandler<E>): void {
    const set = this.listeners.get(eventName);
    if (set) set.delete(handler as (...args: unknown[]) => void);
  }

  // -----------------------------------------------------------------------
  // Performance
  // -----------------------------------------------------------------------

  getPerformanceStats(): PerformanceStats {
    const fps = this.computeFps();
    const detectLatencyMs = this.average(this.detectLatencies);
    const renderLatencyMs = this.average(this.renderLatencies);
    return {
      fps,
      detectLatencyMs,
      renderLatencyMs,
      trackingLostCount: this.trackingLostCount,
      mode: this.trackerConfig.mode,
    };
  }

  // -----------------------------------------------------------------------
  // Destroy
  // -----------------------------------------------------------------------

  destroy(): void {
    if (this.destroyed) return;
    // Mark first, so pending async work cannot commit successful state/events.
    this.destroyed = true;
    this.cancelFrameCollection?.(createSDKError("UNKNOWN", t("error.sdk_destroyed")));
    this.cameraGeneration++;
    this.cameraStartPromise = null;
    this.stopTryOn();
    this.presentationVideo?.removeEventListener("resize", this.onCameraResize);
    this.presentationVideo = null;
    this.camera.destroy();
    this.tracker.destroy();
    this.renderer.dispose();
    this.listeners.clear();
    this.frameTimes.length = 0;
    this.detectLatencies.length = 0;
    this.renderLatencies.length = 0;
    this.currentAsset = null;
    this.cameraStarted = false;
    this.initialized = false;
    for (const [element, style] of this.presentationStyles) {
      if (element.style.transform === style.applied) element.style.transform = style.original;
    }
    this.presentationStyles.clear();
  }

  // -----------------------------------------------------------------------
  // Visibility management
  // -----------------------------------------------------------------------

  /**
   * When the user switches tabs, RAF stops but the camera stream continues.
   * This handler pauses the try-on loop and stops the camera to save battery
   * and bandwidth. On return, it resumes both.
   */
  private setupVisibilityHandler(): void {
    if (this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.loopGeneration++;
        this.cameraGeneration++;
        this.cameraStartPromise = null;
        // Tab hidden: cancel RAF and stop camera stream.
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
        this.camera.stop();
        this.cameraStarted = false;
      } else {
        // Tab visible again: restart camera and resume loop.
        if (this.tryOnRunning && !this.destroyed) {
          this.startCamera().then(() => {
            if (this.destroyed || !this.tryOnRunning || document.hidden) {
              return;
            }
            this.smoother.reset();
            this.consecutiveErrors = 0;
            this.loop();
          }).catch(() => { /* startCamera already releases and reports failures. */ });
        }
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private teardownVisibilityHandler(): void {
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  // -----------------------------------------------------------------------
  // Tracking / render loop
  // -----------------------------------------------------------------------

  private loop = (): void => {
    if (!this.tryOnRunning || this.destroyed) return;
    const generation = this.loopGeneration;

    const frameStart = performance.now();
    this.frameTimes.push(frameStart);
    if (this.frameTimes.length > VisuTryWebSDKImpl.MAX_PERF_SAMPLES) {
      this.frameTimes.shift();
    }

    const frameInput = this.camera.getCurrentFrame();

    if (!frameInput) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    const detectStart = performance.now();
    this.tracker.detect(frameInput).then((face) => {
      if (this.destroyed || !this.tryOnRunning || generation !== this.loopGeneration) return;
      const detectEnd = performance.now();
      this.recordLatency(this.detectLatencies, detectEnd - detectStart);

      if (face) {
        this.handleFaceDetected(face);
      } else {
        this.handleFaceLost();
      }

      // Render.
      const renderStart = performance.now();
      this.renderer.renderFrame();
      const renderEnd = performance.now();
      this.recordLatency(this.renderLatencies, renderEnd - renderStart);

      // Emit performance stats periodically.
      this.maybeEmitPerformance(frameStart);

      if (this.tryOnRunning && !this.destroyed && generation === this.loopGeneration) {
        this.rafId = requestAnimationFrame(this.loop);
      }
    }).catch((err) => {
      if (this.destroyed || !this.tryOnRunning || generation !== this.loopGeneration) return;
      this.emitError(err);
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= VisuTryWebSDKImpl.MAX_CONSECUTIVE_ERRORS) {
        // Circuit breaker: stop the loop after too many persistent failures.
        console.error("[VisuTrySDK]", `Tracking loop stopped after ${this.consecutiveErrors} consecutive errors.`);
        this.emit("error", createSDKError("UNKNOWN", "Tracking loop stopped due to persistent failures."));
        this.stopCamera();
        return;
      }
      if (this.tryOnRunning && !this.destroyed) {
        // Backoff: wait longer as errors accumulate before retrying.
        const backoffMs = Math.min(1000 * this.consecutiveErrors, 5000);
        setTimeout(() => {
          if (this.tryOnRunning && !this.destroyed && generation === this.loopGeneration) {
            this.rafId = requestAnimationFrame(this.loop);
          }
        }, backoffMs);
      }
    });
  };

  private handleFaceDetected(face: NormalizedFaceResult): void {
    this.emit("faceDetected", face);
    this.consecutiveErrors = 0;

    if (!this.lastFaceDetected) {
      this.lastFaceDetected = true;
    }

    if (this.currentAsset) {
      const video = this.camera.videoElement;
      const rawPose = this.poseSolver.solve({
        face,
        asset: this.currentAsset,
        config: this.factoryOptions.fitting,
        frameSize: video && video.videoWidth > 0 && video.videoHeight > 0
          ? { width: video.videoWidth, height: video.videoHeight }
          : undefined,
      });
      const smoothedPose = this.smoother.smooth(rawPose, performance.now());
      this.renderer.applyPose(smoothedPose);
      this.emit("poseUpdated", smoothedPose);
    }
  }

  private handleFaceLost(): void {
    if (this.lastFaceDetected) {
      this.trackingLostCount++;
      this.lastFaceDetected = false;
      this.emit("faceLost");
    }

    // Let the smoother handle the fade-out.
    if (this.currentAsset) {
      const lostPose: GlassesPose = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visible: false,
        confidence: 0,
      };
      const smoothed = this.smoother.smooth(lostPose, performance.now());
      this.renderer.applyPose(smoothed);
    }
  }

  // -----------------------------------------------------------------------
  // Performance helpers
  // -----------------------------------------------------------------------

  private computeFps(): number {
    if (this.frameTimes.length < 2) return 0;
    const span = this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0];
    if (span <= 0) return 0;
    return Math.round((this.frameTimes.length - 1) * 1000 / span);
  }

  private recordLatency(buffer: number[], value: number): void {
    buffer.push(value);
    if (buffer.length > VisuTryWebSDKImpl.MAX_PERF_SAMPLES) buffer.shift();
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;
  }

  private maybeEmitPerformance(now: number): void {
    if (now - this.lastPerformanceEmit < VisuTryWebSDKImpl.PERF_EMIT_INTERVAL_MS) return;
    this.lastPerformanceEmit = now;
    this.emit("performanceUpdated", this.getPerformanceStats());
  }

  // -----------------------------------------------------------------------
  // Event emission
  // -----------------------------------------------------------------------

  private emit<E extends EventName>(eventName: E, ...args: Parameters<EventHandler<E>>): void {
    const set = this.listeners.get(eventName);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as (...a: unknown[]) => void)(...args);
      } catch (err) {
        console.warn("[VisuTrySDK]", `Event handler error for "${eventName}":`, err);
      }
    }
  }

  private emitError(err: unknown): void {
    const sdkErr = this.toSDKError(err);
    this.emit("error", sdkErr);
  }

  // -----------------------------------------------------------------------
  // Utils
  // -----------------------------------------------------------------------

  private toSDKError(err: unknown): SDKError {
    if (err && typeof err === "object" && "code" in err && "message" in err) {
      return err as SDKError;
    }
    return createSDKError("UNKNOWN", (err as Error)?.message ?? "Unknown error", err);
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) {
      throw createSDKError("UNKNOWN", t("error.sdk_destroyed"));
    }
  }

  private assertCameraStartCurrent(generation: number): void {
    this.assertNotDestroyed();
    if (generation !== this.cameraGeneration) {
      throw createSDKError("CAMERA_NOT_AVAILABLE", "Camera start was cancelled");
    }
  }

  // -----------------------------------------------------------------------
  // Accessors (for testing)
  // -----------------------------------------------------------------------

  get isInitialized(): boolean { return this.initialized; }
  get isCameraStarted(): boolean { return this.cameraStarted; }
  get isTryOnRunning(): boolean { return this.tryOnRunning; }
  get isDestroyed(): boolean { return this.destroyed; }
  get currentGlasses(): GlassesAssetManifest | null { return this.currentAsset; }
  get privacyConfig(): PrivacyConfig { return this.privacy.config_; }
}
