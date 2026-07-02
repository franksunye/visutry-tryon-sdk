/**
 * VisuTry SDK — Core Type Definitions
 *
 * Platform-agnostic type contracts shared by core, web, wechat and recommender
 * packages. Nothing here depends on the DOM, MediaPipe, Three.js or WeChat APIs.
 */
export interface Point2D {
    x: number;
    y: number;
}
export interface Point3D {
    x: number;
    y: number;
    z: number;
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
export type FaceQualityWarning = "LOW_CONFIDENCE" | "NOT_FRONTAL" | "FACE_TOO_SMALL" | "FACE_TOO_CLOSE" | "LOW_LIGHT" | "OCCLUDED" | "UNSTABLE" | "MISSING_KEY_POINTS" | "EXCESSIVE_TILT" | "ASYMMETRIC_FACE" | "MULTIPLE_FACES";
export interface FaceQuality {
    confidence: number;
    faceVisible: boolean;
    frontalScore: number;
    stabilityScore: number;
    lightingScore?: number;
    occlusionScore?: number;
    warnings: FaceQualityWarning[];
}
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
export interface CameraConfig {
    facingMode?: "user" | "environment";
    width?: number;
    height?: number;
    frameRate?: number;
    mirror?: boolean;
}
/** Adapter-defined WeChat frame payload — left opaque to the core. */
export interface WechatFrameInput {
    [key: string]: unknown;
}
export type FrameInput = {
    readonly __brand: "HTMLVideoElement";
    el: unknown;
} | {
    readonly __brand: "HTMLCanvasElement";
    el: unknown;
} | {
    readonly __brand: "ImageData";
    el: unknown;
} | Uint8Array | WechatFrameInput;
export interface ICameraProvider {
    initialize(config?: CameraConfig): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    getCurrentFrame(): FrameInput | null;
    switchCamera?(): Promise<void>;
    destroy(): void;
}
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
export interface WechatCanvasTarget {
    [key: string]: unknown;
}
export type RenderTarget = HTMLCanvasElement | {
    readonly __brand: "HTMLCanvasElement";
    el: unknown;
} | string | WechatCanvasTarget;
export interface RenderOptions {
    width: number;
    height: number;
    mirror?: boolean;
    background?: "transparent" | "camera" | string;
    pixelRatio?: number;
    antialias?: boolean;
    maxTextureSize?: number;
}
export interface IRenderer {
    initialize(target: RenderTarget, options?: RenderOptions): Promise<void>;
    loadGlasses(asset: GlassesAssetManifest): Promise<void>;
    applyPose(pose: GlassesPose): void;
    setVisible(visible: boolean): void;
    snapshot(options?: SnapshotOptions): Promise<SnapshotResult>;
    resize(width: number, height: number): void;
    dispose(): void;
}
export type GlassesShape = "round" | "oval" | "rectangle" | "square" | "cat-eye" | "aviator" | "browline" | "rimless";
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
}
export interface PoseSmoothingConfig {
    enabled: boolean;
    positionLerp: number;
    rotationLerp: number;
    scaleLerp: number;
    jitterThreshold: number;
    lostTrackingDelayMs: number;
}
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
export interface FaceMetrics {
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
    /** Eye line tilt in degrees (0 = level). Positive = right higher. */
    eyeLineTiltDeg?: number;
    /** Symmetry offset: nose bridge deviation from face center (0..1, 0 = perfect). */
    symmetryOffset?: number;
    /** Face span: max(width, height) of bounding box in normalized coords. */
    faceSpan?: number;
    chinType: "pointed" | "rounded" | "square" | "unknown";
    measurementQuality: number;
    /**
     * visutry-compatible ratios (2D distances, no z-component).
     * These match the exact computation from visutry's analyzeFaceLandmarks().
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
export type FaceShape = "oval" | "round" | "square" | "heart" | "diamond" | "oblong" | "triangle" | "unknown";
export interface FaceShapeCandidate {
    shape: FaceShape;
    score: number;
    reasons: string[];
}
export interface FaceShapeResult {
    primary: FaceShape;
    candidates: FaceShapeCandidate[];
    confidence: number;
    metrics: FaceMetrics;
    warnings: FaceQualityWarning[];
    version: string;
}
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
export interface RecommendationInput {
    faceShape: FaceShapeResult;
    faceMetrics?: FaceMetrics;
    preferences?: UserPreferences;
    inventory: GlassesItem[];
}
export interface RecommendedGlasses {
    item: GlassesItem;
    score: number;
    reasons: string[];
    cautions?: string[];
}
export interface SnapshotOptions {
    format?: "image/png" | "image/jpeg" | "image/webp";
    quality?: number;
    mirror?: boolean;
    width?: number;
    height?: number;
}
export interface SnapshotResult {
    dataUrl: string;
    blob?: Blob;
    width: number;
    height: number;
    timestamp: number;
}
export interface PerformanceStats {
    fps: number;
    detectLatencyMs: number;
    renderLatencyMs: number;
    trackingLostCount: number;
    mode: TrackingMode;
    memoryMB?: number;
}
export type SDKErrorCode = "CAMERA_PERMISSION_DENIED" | "CAMERA_NOT_AVAILABLE" | "TRACKER_INIT_FAILED" | "TRACKER_DETECT_FAILED" | "RENDERER_INIT_FAILED" | "GLASSES_LOAD_FAILED" | "UNSUPPORTED_PLATFORM" | "LOW_PERFORMANCE" | "SNAPSHOT_FAILED" | "UNKNOWN";
export interface SDKError {
    code: SDKErrorCode;
    message: string;
    cause?: unknown;
    recoverable: boolean;
}
export interface PrivacyConfig {
    processOnDeviceOnly: true;
    allowSnapshotExport?: boolean;
    allowAnalytics?: boolean;
    analyticsLevel?: "none" | "performance" | "diagnostic";
}
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
export interface VisuTrySDK {
    initialize(): Promise<void>;
    startCamera(): Promise<void>;
    stopCamera(): void;
    startTryOn(): Promise<void>;
    stopTryOn(): void;
    loadGlasses(asset: GlassesAssetManifest): Promise<void>;
    switchGlasses(asset: GlassesAssetManifest): Promise<void>;
    analyzeFaceShape(input?: FaceAnalysisInput): Promise<FaceShapeResult>;
    analyzeFaceShapeFromImage(image: unknown): Promise<FaceShapeResult>;
    snapshot(options?: SnapshotOptions): Promise<SnapshotResult>;
    on<EventName extends keyof VisuTrySDKEvents>(eventName: EventName, handler: VisuTrySDKEvents[EventName]): void;
    off<EventName extends keyof VisuTrySDKEvents>(eventName: EventName, handler: VisuTrySDKEvents[EventName]): void;
    getPerformanceStats(): PerformanceStats;
    destroy(): void;
}
/** Configuration passed to the platform SDK factory (web / wechat). */
export interface VisuTrySDKConfig {
    camera?: CameraConfig;
    tracker?: TrackerConfig;
    renderer?: RenderOptions;
    privacy?: PrivacyConfig;
    smoothing?: Partial<PoseSmoothingConfig>;
    fitting?: GlassesFittingConfig;
}
export type CoordinateSystemType = "pixel-image" | "normalized-image" | "render-world" | "glasses-local";
//# sourceMappingURL=index.d.ts.map