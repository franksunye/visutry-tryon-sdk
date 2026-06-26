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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventName = keyof VisuTrySDKEvents;
type EventHandler<E extends EventName> = VisuTrySDKEvents[E];

export interface VisuTryWebSDKFactoryOptions extends VisuTrySDKConfig {
  /** The canvas (or selector) the Three.js renderer will draw on. */
  canvas: RenderTarget;
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
export function createVisuTryWebSDK(options: VisuTryWebSDKFactoryOptions): VisuTrySDK {
  return new VisuTryWebSDKImpl(options);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class VisuTryWebSDKImpl implements VisuTrySDK {
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
  private cameraStarted = false;
  private tryOnRunning = false;
  private destroyed = false;
  private currentAsset: GlassesAssetManifest | null = null;
  private rafId: number | null = null;
  private loadGlassesPromise: Promise<void> | null = null;
  private analysisInProgress = false;

  // --- Events -------------------------------------------------------------
  private readonly listeners: Map<EventName, Set<Function>> = new Map();

  // --- Performance --------------------------------------------------------
  private readonly frameTimes: number[] = [];
  private readonly detectLatencies: number[] = [];
  private readonly renderLatencies: number[] = [];
  private trackingLostCount = 0;
  private lastFaceDetected = false;
  private lastPerformanceEmit = 0;

  // --- Analysis -----------------------------------------------------------
  private analysisTargetFrames = 8;
  private analysisIntervalMs = 120;

  private static readonly MAX_PERF_SAMPLES = 60;
  private static readonly PERF_EMIT_INTERVAL_MS = 1000;

  constructor(options: VisuTryWebSDKFactoryOptions) {
    this.factoryOptions = options;
    this.canvasTarget = options.canvas;
    this.renderOptions = options.renderer ?? {
      width: options.camera?.width ?? 640,
      height: options.camera?.height ?? 480,
      mirror: options.camera?.mirror ?? true,
      background: "transparent",
    };
    this.trackerConfig = options.tracker ?? options.trackerConfig ?? { mode: "balanced" };

    this.camera = new WebCameraProvider();
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

    try {
      // Initialize tracker (loads MediaPipe wasm + model).
      await this.tracker.initialize(this.trackerConfig);
      // Initialize renderer (creates WebGL context + camera + lights).
      await this.renderer.initialize(this.canvasTarget, this.renderOptions);
      this.initialized = true;
      this.emit("ready");
    } catch (err) {
      this.emitError(err);
      throw err;
    }
  }

  async startCamera(): Promise<void> {
    this.assertNotDestroyed();
    if (!this.initialized) {
      await this.initialize();
    }
    if (this.cameraStarted) return;
    try {
      await this.camera.initialize(this.factoryOptions.camera);
      await this.camera.start();
      this.cameraStarted = true;
    } catch (err) {
      this.emitError(err);
      throw err;
    }
  }

  stopCamera(): void {
    this.camera.stop();
    this.cameraStarted = false;
  }

  async startTryOn(): Promise<void> {
    this.assertNotDestroyed();
    if (!this.cameraStarted) {
      await this.startCamera();
    }
    if (this.tryOnRunning) return;
    this.tryOnRunning = true;
    this.smoother.reset();
    this.lastFaceDetected = false;
    this.loop();
  }

  stopTryOn(): void {
    this.tryOnRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.renderer.setVisible(false);
  }

  // -----------------------------------------------------------------------
  // Glasses
  // -----------------------------------------------------------------------

  async loadGlasses(asset: GlassesAssetManifest): Promise<void> {
    this.assertNotDestroyed();
    // Chain off any in-flight load to prevent race conditions.
    if (this.loadGlassesPromise) {
      await this.loadGlassesPromise.catch(() => { /* swallow prior failure */ });
    }
    const promise = this.loadGlassesInternal(asset);
    this.loadGlassesPromise = promise;
    try {
      await promise;
    } finally {
      this.loadGlassesPromise = null;
    }
  }

  private async loadGlassesInternal(asset: GlassesAssetManifest): Promise<void> {
    try {
      await this.renderer.loadGlasses(asset);
      this.currentAsset = asset;
      this.emit("glassesLoaded", asset);
    } catch (err) {
      const sdkErr = this.toSDKError(err);
      this.emit("glassesLoadFailed", sdkErr);
      throw sdkErr;
    }
  }

  async switchGlasses(asset: GlassesAssetManifest): Promise<void> {
    // switchGlasses is semantically the same as loadGlasses (the renderer
    // disposes the previous model before loading the new one).
    await this.loadGlasses(asset);
  }

  // -----------------------------------------------------------------------
  // Face shape analysis
  // -----------------------------------------------------------------------

  async analyzeFaceShape(input?: FaceAnalysisInput): Promise<FaceShapeResult> {
    this.assertNotDestroyed();
    if (this.analysisInProgress) {
      throw createSDKError("UNKNOWN", t("error.analysis_in_progress"));
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

      if (!this.cameraStarted) {
        await this.startCamera();
      }

      // Pause the try-on loop to avoid RAF conflicts during analysis.
      const wasTryOnRunning = this.tryOnRunning;
      if (wasTryOnRunning) this.stopTryOn();

      try {
        const frames = await this.collectAnalysisFrames(sampleFrames, intervalMs, requireFrontal);
        const result = this.scorer.scoreFrames(frames);
        this.emit("faceShapeAnalyzed", result);
        return result;
      } finally {
        if (wasTryOnRunning) await this.startTryOn();
      }
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
      const startTime = performance.now();
      const maxWaitMs = Math.max(targetCount * intervalMs + 2000, 5000);
      let lastCollected = 0;
      let localRafId: number | null = null;

      const collect = (): void => {
        const now = performance.now();
        if (now - startTime > maxWaitMs) {
          if (localRafId !== null) cancelAnimationFrame(localRafId);
          localRafId = null;
          reject(createSDKError("UNKNOWN", t("error.analysis_timeout")));
          return;
        }

        const frame = this.camera.getCurrentFrame();
        if (!frame) {
          localRafId = requestAnimationFrame(collect);
          return;
        }

        this.tracker.detect(frame).then((face) => {
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
            localRafId = null;
            resolve(frames);
          } else {
            localRafId = requestAnimationFrame(collect);
          }
        }).catch((err) => {
          if (localRafId !== null) cancelAnimationFrame(localRafId);
          localRafId = null;
          reject(this.toSDKError(err));
        });
      };

      collect();
    });
  }

  // -----------------------------------------------------------------------
  // Snapshot
  // -----------------------------------------------------------------------

  async snapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    this.assertNotDestroyed();

    // Privacy guard: snapshot export must be explicitly allowed.
    if (!this.privacy.canExportSnapshot()) {
      throw createSDKError("UNKNOWN", t("error.snapshot_disabled"));
    }

    try {
      return await this.renderer.snapshot(options);
    } catch (err) {
      throw this.toSDKError(err);
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
    set.add(handler as Function);
  }

  off<E extends EventName>(eventName: E, handler: EventHandler<E>): void {
    const set = this.listeners.get(eventName);
    if (set) set.delete(handler as Function);
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
    this.stopTryOn();
    this.camera.destroy();
    this.tracker.destroy();
    this.renderer.dispose();
    this.listeners.clear();
    this.frameTimes.length = 0;
    this.detectLatencies.length = 0;
    this.renderLatencies.length = 0;
    this.currentAsset = null;
    this.destroyed = true;
  }

  // -----------------------------------------------------------------------
  // Tracking / render loop
  // -----------------------------------------------------------------------

  private loop = (): void => {
    if (!this.tryOnRunning || this.destroyed) return;

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

      if (this.tryOnRunning && !this.destroyed) {
        this.rafId = requestAnimationFrame(this.loop);
      }
    }).catch((err) => {
      this.emitError(err);
      if (this.tryOnRunning && !this.destroyed) {
        this.rafId = requestAnimationFrame(this.loop);
      }
    });
  };

  private handleFaceDetected(face: NormalizedFaceResult): void {
    this.emit("faceDetected", face);

    if (!this.lastFaceDetected) {
      this.lastFaceDetected = true;
    }

    // Quality gate in tryon mode.
    const gate = this.qualityGate.evaluate({ face, mode: "tryon" });

    if (this.currentAsset) {
      const rawPose = this.poseSolver.solve({
        face,
        asset: this.currentAsset,
        config: this.factoryOptions.fitting,
      });
      const smoothedPose = this.smoother.smooth(rawPose, performance.now());
      this.renderer.applyPose(smoothedPose);
      this.emit("poseUpdated", smoothedPose);
    }

    // Suppress unused var warning — gate is for future adaptive quality.
    void gate;
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
