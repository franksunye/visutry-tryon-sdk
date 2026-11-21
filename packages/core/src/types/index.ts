/**
 * VisuTry SDK — Core Type Definitions
 *
 * Platform-agnostic type contracts shared by core, web, wechat and recommender
 * packages. Nothing here depends on the DOM, MediaPipe, Three.js or WeChat APIs.
 */

// ---------------------------------------------------------------------------
// 1. Primitive geometry
// ---------------------------------------------------------------------------

export interface Point2D {
  x: number;
  y: number;
}

/** Source image dimensions in pixels, after the adapter's orientation transform. */
export interface ImageSize {
  width: number;
  height: number;
}

export interface Point3D {
  x: number;
  y: number;
  /** Z is optional — some landmark sources (e.g. 2D projections) omit depth. */
  z?: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** A rectangle in normalized image coordinates (0..1). */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// 2. Face semantic points
// ---------------------------------------------------------------------------

/**
 * Stable semantic landmarks derived from raw tracker output. Every adapter is
 * responsible for mapping its native landmark indices onto this contract so that
 * the core algorithms remain tracker-agnostic.
 */
export interface FaceSemanticPoints {
  leftEyeOuter?: Point3D;
  leftEyeInner?: Point3D;
  rightEyeInner?: Point3D;
  rightEyeOuter?: Point3D;

  leftEyeCenter?: Point3D;
  rightEyeCenter?: Point3D;
  eyesCenter?: Point3D;

  noseBridge?: Point3D;
  noseTip?: Point3D;

  leftBrowCenter?: Point3D;
  rightBrowCenter?: Point3D;

  foreheadCenter?: Point3D;
  chin?: Point3D;

  leftCheek?: Point3D;
  rightCheek?: Point3D;

  leftJaw?: Point3D;
  rightJaw?: Point3D;

  /** Face outline widest points (visutry addition). */
  leftFace?: Point3D;
  rightFace?: Point3D;

  /** Forehead width points (visutry addition). */
  leftForehead?: Point3D;
  rightForehead?: Point3D;

  /** Nose wing points for nose bridge width (visutry addition). */
  noseLeft?: Point3D;
  noseRight?: Point3D;
}

// ---------------------------------------------------------------------------
// 3. Face pose & quality
// ---------------------------------------------------------------------------

export interface FacePose {
  /** Radians. */
  yaw: number;
  /** Radians. */
  pitch: number;
  /** Radians. */
  roll: number;
  /** Optional 4x4 column-major transformation matrix when the tracker provides one. */
  matrix?: number[];
  confidence: number;
}

export type FaceQualityWarning =
  | "LOW_CONFIDENCE"
  | "NOT_FRONTAL"
  | "FACE_TOO_SMALL"
  | "FACE_TOO_CLOSE"
  | "LOW_LIGHT"
  | "OCCLUDED"
  | "UNSTABLE"
  | "MISSING_KEY_POINTS"
  | "EXCESSIVE_TILT"
  | "ASYMMETRIC_FACE"
  | "MULTIPLE_FACES"
  | "INVALID_IMAGE_SIZE"
  | "INVALID_LANDMARKS";

export interface FaceQuality {
  confidence: number;
  faceVisible: boolean;
  frontalScore: number;
  stabilityScore: number;
  lightingScore?: number;
  occlusionScore?: number;
  warnings: FaceQualityWarning[];
}

// ---------------------------------------------------------------------------
// 4. Normalized face result
// ---------------------------------------------------------------------------

export type FaceResultSource = "mediapipe" | "wechat-vk" | "custom";

/** A pair of landmark indices representing a connection/edge. */
export interface LandmarkConnection {
  start: number;
  end: number;
}

/** Connection groups for landmark mesh rendering (MediaPipe convention). */
export interface LandmarkConnections {
  tesselation: LandmarkConnection[];
  contours: LandmarkConnection[];
  irises: LandmarkConnection[];
}

export interface NormalizedFaceResult {
  source: FaceResultSource;
  timestamp: number;
  /**
   * Dimensions of the image whose x/W and y/H coordinates appear below.
   * Required for geometry analysis; absent/invalid dimensions reject analysis.
   * Optional in the type for existing tracking-only adapters.
   */
  imageSize?: ImageSize;
  /** Number of detected faces when the adapter can report it. */
  faceCount?: number;
  landmarks: {
    raw: Point3D[];
    normalized: Point3D[];
    semantic: FaceSemanticPoints;
    /** Connection data for mesh rendering (available when source="mediapipe"). */
    connections?: LandmarkConnections;
  };
  pose: FacePose;
  bbox: NormalizedRect;
  quality: FaceQuality;
}

// ---------------------------------------------------------------------------
// 5. Camera provider contract
// ---------------------------------------------------------------------------

export interface CameraConfig {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  frameRate?: number;
  mirror?: boolean;
}

/**
 * Adapter-defined WeChat frame payload. Carries the canvas and image data
 * needed by the WeChat tracker adapter. Left opaque in core so the WeChat
 * package owns the concrete implementation.
 */
export interface WechatFrameInput {
  /** Canvas element or canvas ID for drawing the video frame. */
  canvas?: unknown;
  /** Image data (RGBA array or base64 string) from the WeChat camera frame. */
  imageData?: unknown;
  /** Frame width in pixels. */
  width?: number;
  /** Frame height in pixels. */
  height?: number;
  /** Additional adapter-specific properties. */
  [key: string]: unknown;
}

export type FrameInput =
  | { readonly __brand: "HTMLVideoElement"; el: unknown }
  | { readonly __brand: "HTMLCanvasElement"; el: unknown }
  | { readonly __brand: "ImageData"; el: unknown }
  | Uint8Array
  | WechatFrameInput;

export interface ICameraProvider {
  initialize(config?: CameraConfig): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  getCurrentFrame(): FrameInput | null;
  switchCamera?(): Promise<void>;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// 6. Face tracker contract
// ---------------------------------------------------------------------------

export type TrackingMode = "realtime" | "balanced" | "batterySaver";

export interface TrackerConfig {
  mode: TrackingMode;
  maxFaces?: number;
  minFaceDetectionConfidence?: number;
  minFacePresenceConfidence?: number;
  minTrackingConfidence?: number;
  enableTransformationMatrix?: boolean;
  worker?: boolean;
}

export interface IFaceTracker {
  initialize(config?: TrackerConfig): Promise<void>;
  detect(frame: FrameInput): Promise<NormalizedFaceResult | null>;
  detectImage?(input: unknown): Promise<NormalizedFaceResult | null>;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// 7. Renderer contract
// ---------------------------------------------------------------------------

export interface WechatCanvasTarget {
  [key: string]: unknown;
}

/** Structural canvas contract; concrete DOM or native types belong to adapters. */
export interface CanvasRenderTarget {
  width: number;
  height: number;
  getContext(contextId: string): unknown;
}

export type RenderTarget =
  | CanvasRenderTarget
  | { readonly __brand: "HTMLCanvasElement"; el: unknown }
  | string
  | WechatCanvasTarget;

export interface RenderOptions {
  width: number;
  height: number;
  mirror?: boolean;
  background?: "transparent" | "camera" | string;
  pixelRatio?: number;
  antialias?: boolean;
  maxTextureSize?: number;
}

export interface IRenderer<TBlob = unknown> {
  initialize(target: RenderTarget, options?: RenderOptions): Promise<void>;
  loadGlasses(asset: GlassesAssetManifest): Promise<void>;
  applyPose(pose: GlassesPose): void;
  setVisible(visible: boolean): void;
  snapshot(options?: SnapshotOptions): Promise<SnapshotResult<TBlob>>;
  resize(width: number, height: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// 8. Glasses asset manifest
// ---------------------------------------------------------------------------

export type GlassesShape =
  | "round"
  | "oval"
  | "rectangle"
  | "square"
  | "cat-eye"
  | "aviator"
  | "browline"
  | "rimless";

export interface GlassesAssetManifest {
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl?: string;
  format: "glb" | "gltf";
  coordinateSystem: {
    unit: "millimeter" | "centimeter" | "meter";
    forwardAxis: "+z" | "-z";
    upAxis: "+y" | "+z";
  };
  dimensions: {
    frameWidthMm: number;
    lensWidthMm?: number;
    lensHeightMm?: number;
    bridgeWidthMm?: number;
    templeLengthMm?: number;
  };
  anchors: {
    origin: Vector3;
    noseBridge: Vector3;
    leftHinge?: Vector3;
    rightHinge?: Vector3;
    leftLensCenter?: Vector3;
    rightLensCenter?: Vector3;
  };
  fitting: {
    defaultScale: number;
    defaultOffset: Vector3;
    defaultRotation: Vector3;
    minScale?: number;
    maxScale?: number;
    /** Default fitting strategy hints mirrored from GlassesFittingConfig. */
    fitBy?: "eyeOuterDistance" | "eyeCenterDistance" | "faceWidth";
    verticalAnchor?: "noseBridge" | "eyeLine" | "browLine";
  };
  material: {
    lensOpacity?: number;
    lensColor?: string;
    frameColor?: string;
    frameMaterial?: string;
    frameRoughness?: number;
    frameMetalness?: number;
    supportsTransparency?: boolean;
  };
  metadata?: {
    brand?: string;
    shapeCategory?: GlassesShape;
    colors?: string[];
    tags?: string[];
    price?: number;
    currency?: string;
  };
}

// ---------------------------------------------------------------------------
// 9. Glasses pose
// ---------------------------------------------------------------------------

export interface GlassesPose {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  visible: boolean;
  confidence: number;
  reason?: string;
}

export interface GlassesFittingConfig {
  scaleMultiplier?: number;
  positionOffset?: Vector3;
  rotationOffset?: Vector3;
  useTransformationMatrix?: boolean;
  fitBy?: "eyeOuterDistance" | "eyeCenterDistance" | "faceWidth";
  verticalAnchor?: "noseBridge" | "eyeLine" | "browLine";
  depthStrategy?: "noseTip" | "matrix" | "fixed";
}

export interface GlassesPoseSolverInput {
  face: NormalizedFaceResult;
  asset: GlassesAssetManifest;
  config?: GlassesFittingConfig;
  /** Source image dimensions, matching the renderer viewport aspect ratio. */
  frameSize?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// 10. Pose smoothing
// ---------------------------------------------------------------------------

export interface PoseSmoothingConfig {
  enabled: boolean;
  positionLerp: number;
  rotationLerp: number;
  scaleLerp: number;
  jitterThreshold: number;
  lostTrackingDelayMs: number;
}

// ---------------------------------------------------------------------------
// 11. Quality gate
// ---------------------------------------------------------------------------

export type QualityGateMode = "analysis" | "tryon" | "snapshot";

export interface QualityGateInput {
  face: NormalizedFaceResult;
  mode: QualityGateMode;
}

export interface QualityGateResult {
  passed: boolean;
  score: number;
  warnings: FaceQualityWarning[];
}

// ---------------------------------------------------------------------------
// 12. Face metrics & shape analysis
// ---------------------------------------------------------------------------

export interface FaceMetrics {
  /**
   * True only when source dimensions, 2D geometry and geometric quality checks
   * are valid. Legacy metrics without this marker cannot be classified.
   */
  geometryValid?: boolean;
  /** Blocking geometry warnings; does not include tracker confidence/stability. */
  geometryWarnings?: FaceQualityWarning[];
  /** 2D lengths below use source-image-width units, never physical millimeters. */
  faceWidth: number;
  faceHeight: number;
  cheekboneWidth: number;
  jawWidth: number;
  foreheadWidth?: number;
  faceOutlineWidth?: number;
  eyeOuterDistance: number;
  eyeInnerDistance: number;
  eyeCenterDistance: number;
  noseBridgeToEyeLine: number;
  noseBridgeWidth?: number;
  widthHeightRatio: number;
  jawCheekRatio: number;
  foreheadCheekRatio?: number;
  /** Eye line tilt in degrees in image coordinates (y down; positive = right lower). */
  eyeLineTiltDeg?: number;
  /** Symmetry offset: nose bridge deviation from face center (0..1, 0 = perfect). */
  symmetryOffset?: number;
  /** Horizontal face extent as a fraction of source image width. */
  faceSpanX?: number;
  /** Vertical face extent as a fraction of source image height. */
  faceSpanY?: number;
  /** Legacy summary: max(faceSpanX, faceSpanY); not an analysis acceptance rule. */
  faceSpan?: number;
  chinType: "pointed" | "rounded" | "square" | "unknown";
  measurementQuality: number;
  /**
   * Ratios inherited from the VisuTry geometry model (2D distances, no z-component).
   * Names describe the SDK contract; parity with another application must be
   * verified against its exact revision and normalized inputs.
   */
  visutry?: {
    faceAspectRatio: number;
    cheekToFaceWidth: number;
    jawToCheekWidth: number;
    foreheadToCheekWidth: number;
    eyeLineTiltDeg: number;
    symmetryOffset: number;
    noseBridgeToFaceWidth: number;
  };
}

export interface FaceAnalysisConfig {
  sampleFrames?: number;
  sampleIntervalMs?: number;
  requireFrontal?: boolean;
}

export interface FaceAnalysisInput {
  source?: FaceResultSource;
  frames?: NormalizedFaceResult[];
  config?: FaceAnalysisConfig;
}

export type FaceShape =
  | "oval"
  | "round"
  | "square"
  | "heart"
  | "diamond"
  | "oblong"
  | "triangle"
  | "unknown";

export interface FaceShapeCandidate {
  shape: FaceShape;
  score: number;
  reasons: string[];
}

/** Heuristic geometry classification; confidence is not a calibrated probability. */
export interface FaceShapeResult {
  primary: FaceShape;
  candidates: FaceShapeCandidate[];
  confidence: number;
  metrics: FaceMetrics;
  warnings: FaceQualityWarning[];
  /** Geometry explanations for the primary shape; empty for rejected results. */
  signals?: string[];
  version: string;
}

// ---------------------------------------------------------------------------
// 13. Recommender
// ---------------------------------------------------------------------------

export interface UserPreferences {
  brands?: string[];
  maxPrice?: number;
  preferredShapes?: GlassesShape[];
  preferredMaterials?: string[];
  preferredColors?: string[];
  style?: "business" | "casual" | "fashion" | "sport";
}

export interface GlassesItem {
  id: string;
  name: string;
  brand?: string;
  thumbnailUrl: string;
  modelUrl?: string;
  manifest?: GlassesAssetManifest;
  shapeCategory: GlassesShape;
  dimensions?: {
    frameWidthMm?: number;
    lensWidthMm?: number;
    lensHeightMm?: number;
    bridgeWidthMm?: number;
  };
  material?: string;
  colors?: string[];
  price?: number;
}

/**
 * Physical dimensions supplied and validated by the host application.
 * `source` records the host's assertion; the SDK cannot verify measurement
 * provenance or calibration accuracy. All supplied distances must be finite
 * and greater than zero. Normalized image distances are not physical inputs.
 */
export interface PhysicalFaceMeasurements {
  faceWidthMm: number;
  eyeCenterDistanceMm?: number;
  source: "measured" | "calibrated";
}

export interface RecommendationInput {
  /** Omit for generic preference-based recommendations. */
  faceShape?: FaceShapeResult;
  /** @deprecated Image-space metrics do not establish physical size; ignored. */
  faceMetrics?: FaceMetrics;
  measurements?: PhysicalFaceMeasurements;
  preferences?: UserPreferences;
  inventory: GlassesItem[];
}

export interface RecommendedGlasses {
  item: GlassesItem;
  /** Normalized rule-ranking score, not a probability or verified fit score. */
  score: number;
  /** Whether a known, geometry-valid face result contributed shape rules. */
  faceShapeApplied: boolean;
  /** Availability of host-supplied physical inputs, not a physical-fit verdict. */
  size:
    | {
        status: "available";
        source: PhysicalFaceMeasurements["source"];
        faceWidthMm: number;
        eyeCenterDistanceMm?: number;
        tier: "small" | "medium" | "large";
        lensWidthRange: readonly [number, number];
        idealFrameWidthMm: number;
      }
    | {
        status: "unavailable";
        reason: "measurements-required" | "invalid-measurements";
      };
  reasons: string[];
  cautions?: string[];
}

// ---------------------------------------------------------------------------
// 14. Snapshot
// ---------------------------------------------------------------------------

export interface SnapshotOptions {
  format?: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
  mirror?: boolean;
  width?: number;
  height?: number;
}

/** Adapters specialize TBlob (for example the Web adapter uses the browser Blob). */
export interface SnapshotResult<TBlob = unknown> {
  dataUrl: string;
  blob?: TBlob;
  width: number;
  height: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// 15. Performance & errors
// ---------------------------------------------------------------------------

export interface PerformanceStats {
  fps: number;
  detectLatencyMs: number;
  renderLatencyMs: number;
  trackingLostCount: number;
  mode: TrackingMode;
  memoryMB?: number;
}

export type SDKErrorCode =
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_NOT_AVAILABLE"
  | "TRACKER_INIT_FAILED"
  | "TRACKER_DETECT_FAILED"
  | "FACE_NOT_DETECTED"
  | "ANALYSIS_IN_PROGRESS"
  | "RENDERER_INIT_FAILED"
  | "GLASSES_LOAD_FAILED"
  | "UNSUPPORTED_PLATFORM"
  | "LOW_PERFORMANCE"
  | "SNAPSHOT_FAILED"
  | "UNKNOWN";

export interface SDKError {
  code: SDKErrorCode;
  message: string;
  cause?: unknown;
  recoverable: boolean;
}

// ---------------------------------------------------------------------------
// 16. Privacy
// ---------------------------------------------------------------------------

/** Policy settings; enforcement depends on the consuming facade or host code. */
export interface PrivacyConfig {
  processOnDeviceOnly: true;
  allowSnapshotExport?: boolean;
  allowAnalytics?: boolean;
  analyticsLevel?: "none" | "performance" | "diagnostic";
}

// ---------------------------------------------------------------------------
// 17. SDK facade
// ---------------------------------------------------------------------------

export interface VisuTrySDKEvents {
  ready: () => void;
  faceDetected: (face: NormalizedFaceResult) => void;
  faceLost: () => void;
  poseUpdated: (pose: GlassesPose) => void;
  glassesLoaded: (asset: GlassesAssetManifest) => void;
  glassesLoadFailed: (error: SDKError) => void;
  faceShapeAnalyzed: (result: FaceShapeResult) => void;
  performanceUpdated: (stats: PerformanceStats) => void;
  error: (error: SDKError) => void;
}

export interface VisuTrySDK<TBlob = unknown> {
  initialize(): Promise<void>;
  startCamera(): Promise<void>;
  stopCamera(): void;
  startTryOn(): Promise<void>;
  stopTryOn(): void;
  loadGlasses(asset: GlassesAssetManifest): Promise<void>;
  switchGlasses(asset: GlassesAssetManifest): Promise<void>;
  analyzeFaceShape(input?: FaceAnalysisInput): Promise<FaceShapeResult>;
  analyzeFaceShapeFromImage(image: unknown): Promise<FaceShapeResult>;
  snapshot(options?: SnapshotOptions): Promise<SnapshotResult<TBlob>>;
  on<EventName extends keyof VisuTrySDKEvents>(
    eventName: EventName,
    handler: VisuTrySDKEvents[EventName],
  ): void;
  off<EventName extends keyof VisuTrySDKEvents>(
    eventName: EventName,
    handler: VisuTrySDKEvents[EventName],
  ): void;
  getPerformanceStats(): PerformanceStats;
  destroy(): void;
}

/** Base configuration used by the Web SDK factory; WeChat has its own WechatSDKConfig. */
export interface VisuTrySDKConfig {
  camera?: CameraConfig;
  tracker?: TrackerConfig;
  renderer?: RenderOptions;
  privacy?: PrivacyConfig;
  smoothing?: Partial<PoseSmoothingConfig>;
  fitting?: GlassesFittingConfig;
}

// ---------------------------------------------------------------------------
// 18. Coordinate system tags
// ---------------------------------------------------------------------------

export type CoordinateSystemType =
  | "pixel-image"
  | "normalized-image"
  | "render-world"
  | "glasses-local";
