/**
 * @visutry/tryon-web
 *
 * Web (H5) adapter for the VisuTry Face Geometry & AR Glasses Try-On SDK.
 * Provides `getUserMedia` camera, MediaPipe `FaceLandmarker` tracker, Three.js
 * renderer and a `createVisuTryWebSDK` facade that composes them into the
 * platform-agnostic `VisuTrySDK` interface.
 */

// Camera
export { WebCameraProvider } from "./camera/WebCameraProvider.js";

// Tracker
export { MediaPipeFaceTracker } from "./tracker/MediaPipeFaceTracker.js";
export {
  DEFAULT_MEDIAPIPE_WASM,
  DEFAULT_FACE_LANDMARKER_MODEL,
} from "./tracker/MediaPipeFaceTracker.js";
export type { MediaPipeTrackerOptions } from "./tracker/MediaPipeFaceTracker.js";

// Renderer
export { ThreeJsRenderer } from "./renderer/ThreeJsRenderer.js";

// Overlay
export { LandmarkOverlay } from "./overlay/LandmarkOverlay.js";
export type { LandmarkOverlayOptions, LandmarkOverlayRenderInput } from "./overlay/LandmarkOverlay.js";

// SDK facade
export { createVisuTryWebSDK, createVisuTryImageAnalyzer } from "./VisuTryWebSDK.js";
export type { VisuTryWebSDKFactoryOptions, ImageAnalyzer, ImageAnalysisResult } from "./VisuTryWebSDK.js";

// Re-export core types and utilities for convenience
export {
  CoordinateSystem,
  FaceSemanticMapper,
  MEDIAPIPE_SEMANTIC_INDEX_MAP,
  FaceMetricsCalculator,
  FaceShapeScorer,
  FACE_SHAPE_SCORER_VERSION,
  GlassesPoseSolver,
  DEFAULT_FITTING_CONFIG,
  MM_TO_RENDER_WORLD,
  PoseSmoother,
  DEFAULT_POSE_SMOOTHING_CONFIG,
  QualityGate,
  PrivacyGuard,
  DEFAULT_PRIVACY_CONFIG,
  ManifestValidator,
  createSDKError,
  setLocale,
  getLocale,
  t,
} from "@visutry/tryon-core";

export type * from "@visutry/tryon-core";
