/**
 * @visutry/tryon-core
 *
 * Platform-agnostic core of the VisuTry Face Geometry & AR Glasses Try-On SDK.
 * No DOM, MediaPipe, Three.js or WeChat dependencies live here.
 */

// Types
export * from "./types/index.js";

// i18n (user-facing error message localisation)
export { setLocale, getLocale, t } from "./i18n/index.js";
export type { Locale } from "./i18n/index.js";

// Coordinate system
export { CoordinateSystem } from "./coordinate/CoordinateSystem.js";

// Face semantic mapping
export {
  FaceSemanticMapper,
  MEDIAPIPE_SEMANTIC_INDEX_MAP,
} from "./face/FaceSemanticMapper.js";
export type { SemanticIndexMap, FaceSemanticMapperOptions } from "./face/FaceSemanticMapper.js";

// Face metrics
export { FaceMetricsCalculator } from "./face/FaceMetricsCalculator.js";

// Face shape scoring
export { FaceShapeScorer, FACE_SHAPE_SCORER_VERSION } from "./face/FaceShapeScorer.js";

// Glasses pose solver
export {
  GlassesPoseSolver,
  DEFAULT_FITTING_CONFIG,
  MM_TO_RENDER_WORLD,
  decomposeMatrixToEuler,
  degreesToRadians,
} from "./pose/GlassesPoseSolver.js";

// Pose smoothing
export {
  PoseSmoother,
  DEFAULT_POSE_SMOOTHING_CONFIG,
} from "./smoothing/PoseSmoothing.js";

// Quality gate
export { QualityGate } from "./quality/QualityGate.js";

// Privacy
export { PrivacyGuard, DEFAULT_PRIVACY_CONFIG } from "./privacy/PrivacyGuard.js";

// Manifest validation
export {
  ManifestValidator,
} from "./manifest/ManifestValidator.js";
export type {
  ManifestValidationIssue,
  ManifestValidationResult,
} from "./manifest/ManifestValidator.js";

// Utilities
export { createSDKError } from "./utils/errors.js";
export * as math from "./utils/math.js";
export {
  clamp,
  clamp01,
  clampAngle,
  lerp,
  lerpVec3,
  distance2D,
  distance3D,
  mean,
  median,
  trimmedMean,
  standardDeviation,
  softmax,
  minMaxNormalize,
  mapRange,
  DEG2RAD,
  RAD2DEG,
} from "./utils/math.js";
