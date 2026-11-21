import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  FacePose,
  FaceQuality,
  FaceQualityWarning,
  FaceResultSource,
  FrameInput,
  NormalizedFaceResult,
  NormalizedRect,
  Point3D,
  TrackerConfig,
  IFaceTracker,
} from "@visutry/tryon-core";
import {
  CoordinateSystem,
  FaceSemanticMapper,
  MEDIAPIPE_SEMANTIC_INDEX_MAP,
  clamp01,
  createSDKError,
  decomposeMatrixToEuler,
  t,
} from "@visutry/tryon-core";

/** Default CDN locations for MediaPipe wasm + face landmarker model. */
export const DEFAULT_MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const DEFAULT_FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface MediaPipeTrackerOptions {
  wasmPath?: string;
  modelAssetPath?: string;
  /** Override the semantic index map (defaults to MediaPipe 468 topology). */
  indexMap?: typeof MEDIAPIPE_SEMANTIC_INDEX_MAP;
}

const TRACKING_MODE_SETTINGS: Record<
  TrackerConfig["mode"],
  { delegate: "CPU" | "GPU"; minDetection: number; minPresence: number; minTracking: number }
> = {
  realtime: { delegate: "GPU", minDetection: 0.4, minPresence: 0.4, minTracking: 0.4 },
  balanced: { delegate: "GPU", minDetection: 0.5, minPresence: 0.5, minTracking: 0.5 },
  batterySaver: { delegate: "CPU", minDetection: 0.5, minPresence: 0.5, minTracking: 0.5 },
};

/**
 * Face tracker backed by MediaPipe `FaceLandmarker` (tasks-vision).
 *
 * Translates MediaPipe's 478-point output into the SDK's
 * `NormalizedFaceResult`, including semantic points, pose, bounding box and a
 * quality assessment. Tracker-agnostic core algorithms never see MediaPipe
 * types directly.
 */
export class MediaPipeFaceTracker implements IFaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private imageLandmarker: FaceLandmarker | null = null;
  private imageInitialization: Promise<void> | null = null;
  private mapper: FaceSemanticMapper;
  private config: TrackerConfig;
  private options: MediaPipeTrackerOptions;
  private lastTimestamp = -1;
  private readonly eyeHistory: Point3D[] = [];
  private static readonly HISTORY_SIZE = 6;
  private disposed = false;
  private initRetries = 0;
  private readonly maxInitRetries = 3;
  private readonly retryDelayMs = 1000;

  constructor(options: MediaPipeTrackerOptions = {}, config: TrackerConfig = { mode: "balanced" }) {
    this.options = options;
    this.config = { maxFaces: 1, ...config };
    this.mapper = new FaceSemanticMapper({ indexMap: options.indexMap ?? MEDIAPIPE_SEMANTIC_INDEX_MAP });
  }

  async initialize(config?: TrackerConfig): Promise<void> {
    if (this.disposed) throw createSDKError("TRACKER_INIT_FAILED", t("error.tracker_not_initialized"));
    if (config) this.config = { ...this.config, ...config };
    const settings = TRACKING_MODE_SETTINGS[this.config.mode];

    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(
        this.options.wasmPath ?? DEFAULT_MEDIAPIPE_WASM,
      );
    } catch (err) {
      throw createSDKError("TRACKER_INIT_FAILED", t("error.tracker_init_failed"), err);
    }
    if (this.disposed) throw createSDKError("TRACKER_INIT_FAILED", t("error.tracker_not_initialized"));

    const createOptions = {
      baseOptions: {
        modelAssetPath: this.options.modelAssetPath ?? DEFAULT_FACE_LANDMARKER_MODEL,
        delegate: settings.delegate,
      },
      runningMode: "VIDEO" as const,
      numFaces: this.config.maxFaces ?? 1,
      minFaceDetectionConfidence: this.config.minFaceDetectionConfidence ?? settings.minDetection,
      minFacePresenceConfidence: this.config.minFacePresenceConfidence ?? settings.minPresence,
      minTrackingConfidence: this.config.minTrackingConfidence ?? settings.minTracking,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: this.config.enableTransformationMatrix ?? true,
    };

    // Retry FaceLandmarker creation with linear backoff.
    let lastErr: unknown;
    while (true) {
      try {
        const landmarker = await FaceLandmarker.createFromOptions(vision, createOptions);
        if (this.disposed) {
          landmarker.close();
          throw createSDKError("TRACKER_INIT_FAILED", t("error.tracker_not_initialized"));
        }
        this.landmarker = landmarker;
        this.initRetries = 0;
        return;
      } catch (err) {
        lastErr = err;
        if (this.disposed) break;
        if (this.initRetries < this.maxInitRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * (this.initRetries + 1)));
          this.initRetries++;
          continue;
        }
        break;
      }
    }
    throw createSDKError(
      "TRACKER_INIT_FAILED",
      `${t("error.tracker_init_failed")} (${this.initRetries + 1} attempts)`,
      lastErr,
    );
  }

  async detect(frame: FrameInput): Promise<NormalizedFaceResult | null> {
    if (this.disposed || !this.landmarker) {
      throw createSDKError("TRACKER_DETECT_FAILED", t("error.tracker_not_initialized"));
    }
    const video = this.extractVideo(frame);
    if (!video || video.readyState < 2) return null;

    const timestamp = performance.now();
    // MediaPipe requires monotonically increasing timestamps.
    const ts = timestamp <= this.lastTimestamp ? this.lastTimestamp + 1 : timestamp;
    this.lastTimestamp = ts;

    let result: FaceLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, ts);
    } catch (err) {
      throw createSDKError("TRACKER_DETECT_FAILED", t("error.tracker_detect_failed"), err);
    }

    if (!result.faceLandmarks?.length) {
      this.eyeHistory.length = 0;
      return null;
    }

    const landmarks = result.faceLandmarks[0];
    const matrix = result.facialTransformationMatrixes?.[0]?.data;
    return this.buildResult(landmarks, matrix, ts, "mediapipe", video, result.faceLandmarks.length);
  }

  async detectImage(input: unknown): Promise<NormalizedFaceResult | null> {
    if (this.disposed) {
      throw createSDKError("TRACKER_DETECT_FAILED", t("error.tracker_not_initialized"));
    }

    // Accept HTMLImageElement, HTMLCanvasElement, ImageBitmap, or HTMLVideoElement.
    let imageSource: HTMLImageElement | HTMLCanvasElement | ImageBitmap | HTMLVideoElement;
    if (input instanceof HTMLImageElement) {
      imageSource = input;
    } else if (input instanceof HTMLCanvasElement) {
      imageSource = input;
    } else if (typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap) {
      imageSource = input;
    } else if (input instanceof HTMLVideoElement) {
      imageSource = input;
    } else {
      throw createSDKError("TRACKER_DETECT_FAILED", "Unsupported image input type for detectImage");
    }

    // Use decoded, intrinsic dimensions, not an element's CSS/display size.
    // Validate before downloading models so unsupported input has no side effects.
    if (!this.getImageSize(imageSource)) {
      throw createSDKError("TRACKER_DETECT_FAILED", "Image input has no valid decoded dimensions");
    }

    // Share initialization across concurrent callers and close a model that
    // finishes loading after destroy(). Detection itself is synchronous.
    if (!this.imageLandmarker) {
      if (!this.imageInitialization) this.imageInitialization = this.initImageLandmarker();
      const pending = this.imageInitialization;
      try {
        await pending;
      } finally {
        if (this.imageInitialization === pending) this.imageInitialization = null;
      }
    }
    if (this.disposed || !this.imageLandmarker) {
      throw createSDKError("TRACKER_DETECT_FAILED", t("error.tracker_not_initialized"));
    }

    let result: FaceLandmarkerResult;
    try {
      result = this.imageLandmarker.detect(imageSource);
    } catch (err) {
      throw createSDKError("TRACKER_DETECT_FAILED", t("error.tracker_detect_failed"), err);
    }

    if (!result.faceLandmarks?.length) return null;

    const landmarks = result.faceLandmarks[0];
    const matrix = result.facialTransformationMatrixes?.[0]?.data;
    // Use 0 as timestamp for single-image detection (no temporal context needed).
    return this.buildResult(landmarks, matrix, 0, "mediapipe", imageSource, result.faceLandmarks.length, false);
  }

  /**
   * Lazily create a separate IMAGE-mode FaceLandmarker for still photo analysis.
   * Uses the same model and CDN paths but with runningMode="IMAGE".
   */
  private async initImageLandmarker(): Promise<void> {
    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(
        this.options.wasmPath ?? DEFAULT_MEDIAPIPE_WASM,
      );
    } catch (err) {
      throw createSDKError("TRACKER_INIT_FAILED", t("error.tracker_init_failed"), err);
    }

    if (this.disposed) {
      throw createSDKError("TRACKER_DETECT_FAILED", t("error.tracker_not_initialized"));
    }

    const settings = TRACKING_MODE_SETTINGS[this.config.mode];
    try {
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: this.options.modelAssetPath ?? DEFAULT_FACE_LANDMARKER_MODEL,
          delegate: settings.delegate,
        },
        runningMode: "IMAGE",
        // Detect a second face so the shared analysis gate can reject ambiguous
        // photos instead of silently treating the first person as the subject.
        numFaces: Math.max(2, this.config.maxFaces ?? 1),
        minFaceDetectionConfidence: settings.minDetection,
        minFacePresenceConfidence: settings.minPresence,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });
      if (this.disposed) {
        landmarker.close();
        throw createSDKError("TRACKER_DETECT_FAILED", t("error.tracker_not_initialized"));
      }
      this.imageLandmarker = landmarker;
    } catch (err) {
      throw createSDKError("TRACKER_INIT_FAILED", "Failed to init IMAGE-mode landmarker", err);
    }
  }

  destroy(): void {
    this.disposed = true;
    this.eyeHistory.length = 0;
    const models = [this.landmarker, this.imageLandmarker];
    this.landmarker = null;
    this.imageLandmarker = null;
    for (const model of models) {
      try {
        model?.close();
      } catch (err) {
        console.warn("[VisuTrySDK]", "MediaPipeFaceTracker: error closing landmarker:", err);
      }
    }
  }

  // -----------------------------------------------------------------------

  /**
   * Extract MediaPipe connection data (tesselation, contours, irises) for
   * landmark mesh rendering. These are static arrays on the FaceLandmarker class.
   */
  private cachedConnections: import("@visutry/tryon-core").LandmarkConnections | null = null;

  private getConnections(): import("@visutry/tryon-core").LandmarkConnections | undefined {
    if (this.cachedConnections) return this.cachedConnections;

    // FaceLandmarker exposes static connection arrays on the class itself.
    const FL = this.landmarker?.constructor as typeof FaceLandmarker;
    // Also check the IMAGE-mode landmarker
    const FL2 = this.imageLandmarker?.constructor as typeof FaceLandmarker;
    const cls = FL ?? FL2;
    if (!cls) return undefined;

    const tesselation = (cls as unknown as {
      FACE_LANDMARKS_TESSELATION?: Array<{ start: number; end: number }>;
    }).FACE_LANDMARKS_TESSELATION;
    const contours = (cls as unknown as {
      FACE_LANDMARKS_CONTOURS?: Array<{ start: number; end: number }>;
    }).FACE_LANDMARKS_CONTOURS;
    const irises = (cls as unknown as {
      FACE_LANDMARKS_IRISES?: Array<{ start: number; end: number }>;
    }).FACE_LANDMARKS_IRISES;

    if (!tesselation && !contours && !irises) return undefined;

    this.cachedConnections = {
      tesselation: tesselation ?? [],
      contours: contours ?? [],
      irises: irises ?? [],
    };
    return this.cachedConnections;
  }

  private buildResult(
    landmarks: { x: number; y: number; z?: number }[],
    matrix: number[] | undefined,
    timestamp: number,
    source: FaceResultSource,
    imageSource: unknown,
    faceCount = 1,
    temporal = true,
  ): NormalizedFaceResult {
    // Results own their points. Retaining one result for analysis or an overlay
    // must not let a later detection silently mutate its raw/normalized data.
    const points: Point3D[] = landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
    const imageSize = this.getImageSize(imageSource);
    const semantic = this.mapper.map(points);
    const bbox = this.computeBBox(points);
    const pose = this.computePose(points, semantic, matrix, imageSize);
    const quality = this.computeQuality(pose, bbox, semantic, points.length, temporal);
    if (faceCount > 1) quality.warnings.push("MULTIPLE_FACES");

    return {
      source,
      timestamp,
      imageSize,
      faceCount,
      landmarks: {
        raw: points,
        normalized: points,
        semantic,
        connections: this.getConnections(),
      },
      pose,
      bbox,
      quality,
    };
  }

  private getImageSize(input: unknown): { width: number; height: number } | undefined {
    let width: number;
    let height: number;
    if (input instanceof HTMLVideoElement) {
      width = input.videoWidth;
      height = input.videoHeight;
    } else if (input instanceof HTMLImageElement) {
      width = input.naturalWidth;
      height = input.naturalHeight;
    } else if (input instanceof HTMLCanvasElement ||
      (typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap)) {
      width = input.width;
      height = input.height;
    } else {
      return undefined;
    }
    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
      ? { width, height } : undefined;
  }

  private computeBBox(points: Point3D[]): NormalizedRect {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private computePose(
    points: Point3D[],
    semantic: NormalizedFaceResult["landmarks"]["semantic"],
    matrix: number[] | undefined,
    imageSize?: { width: number; height: number },
  ): FacePose {
    if (matrix && matrix.length >= 16) {
      const euler = decomposeMatrixToEuler(matrix);
      return {
        yaw: euler.y,
        pitch: euler.x,
        roll: euler.z,
        matrix,
        confidence: 0.95,
      };
    }
    // Fallback: estimate yaw/pitch/roll from landmark geometry.
    const le = semantic.leftEyeCenter ?? points[33];
    const re = semantic.rightEyeCenter ?? points[263];
    const nose = semantic.noseTip ?? points[1];
    const forehead = semantic.foreheadCenter ?? points[10];
    const chin = semantic.chin ?? points[152];
    if (!le || !re || !nose || !forehead || !chin) {
      return { yaw: 0, pitch: 0, roll: 0, confidence: 0 };
    }

    const eyeDX = re.x - le.x;
    const eyeDY = (re.y - le.y) * (imageSize ? imageSize.height / imageSize.width : 1);
    const roll = Math.atan2(eyeDY, eyeDX);

    // Yaw from nose lateral offset relative to eye line midpoint.
    const eyeMidX = (le.x + re.x) / 2;
    const eyeSpan = Math.hypot(eyeDX, eyeDY) || 1e-6;
    const yaw = clamp01(Math.abs(nose.x - eyeMidX) / (eyeSpan * 0.5)) * 0.9 * Math.sign(nose.x - eyeMidX);

    // Pitch from nose vertical position between forehead and chin.
    const verticalSpan = Math.abs(chin.y - forehead.y) || 1e-6;
    const noseRel = (nose.y - forehead.y) / verticalSpan; // ~0.55 neutral
    const pitch = (noseRel - 0.55) * 1.2;

    return { yaw, pitch, roll, confidence: 0.85 };
  }

  private computeQuality(
    pose: FacePose,
    bbox: NormalizedRect,
    semantic: NormalizedFaceResult["landmarks"]["semantic"],
    pointCount: number,
    temporal = true,
  ): FaceQuality {
    const warnings: FaceQualityWarning[] = [];

    const confidence = pose.confidence;
    if (confidence < 0.5) warnings.push("LOW_CONFIDENCE");

    // Frontality: closer to 0 yaw/pitch => more frontal.
    const yawMag = Math.abs(pose.yaw);
    const pitchMag = Math.abs(pose.pitch);
    const frontalScore = clamp01(1 - (yawMag + pitchMag) / 0.9);
    if (frontalScore < 0.55) warnings.push("NOT_FRONTAL");

    // Stability from eye-center jitter history.
    const ec = semantic.eyesCenter;
    let stabilityScore = 1;
    if (ec && temporal) {
      this.eyeHistory.push(ec);
      if (this.eyeHistory.length > MediaPipeFaceTracker.HISTORY_SIZE) this.eyeHistory.shift();
      stabilityScore = this.computeStability(this.eyeHistory);
    }
    if (stabilityScore < 0.6) warnings.push("UNSTABLE");

    if (bbox.width < 0.12) warnings.push("FACE_TOO_SMALL");
    if (bbox.width > 0.8) warnings.push("FACE_TOO_CLOSE");

    if (pointCount < 400) warnings.push("MISSING_KEY_POINTS");

    return {
      confidence,
      faceVisible: confidence > 0.3 && pointCount > 0,
      frontalScore,
      stabilityScore,
      warnings,
    };
  }

  private computeStability(history: Point3D[]): number {
    if (history.length < 2) return 1;
    let maxDelta = 0;
    for (let i = 1; i < history.length; i++) {
      const d = Math.hypot(
        history[i].x - history[i - 1].x,
        history[i].y - history[i - 1].y,
      );
      if (d > maxDelta) maxDelta = d;
    }
    // 0 movement => 1; >= 0.03 movement => 0.
    return clamp01(1 - maxDelta / 0.03);
  }

  private extractVideo(frame: FrameInput): HTMLVideoElement | null {
    const f = frame as unknown as { __brand?: string; el?: unknown };
    if (f && f.__brand === "HTMLVideoElement" && f.el instanceof HTMLVideoElement) {
      return f.el;
    }
    if (frame instanceof HTMLVideoElement) return frame;
    if (frame instanceof HTMLCanvasElement) return this.canvasToVideo(frame);
    return null;
  }

  private canvasToVideo(canvas: HTMLCanvasElement): HTMLVideoElement | null {
    // MediaPipe needs a video element; we cannot trivially cast a canvas, so
    // return null and let the caller supply a real video stream. This keeps the
    // tracker robust when used with non-video frame sources.
    void canvas;
    return null;
  }

  static get coordinateSystem() {
    return CoordinateSystem;
  }
}
