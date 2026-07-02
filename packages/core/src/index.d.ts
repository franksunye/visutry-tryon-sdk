/**
 * @visutry/tryon-core
 *
 * Platform-agnostic core of the VisuTry Face Geometry & AR Glasses Try-On SDK.
 * No DOM, MediaPipe, Three.js or WeChat dependencies live here.
 */
export * from "./types/index.js";
export { setLocale, getLocale, t } from "./i18n/index.js";
export type { Locale } from "./i18n/index.js";
export { CoordinateSystem } from "./coordinate/CoordinateSystem.js";
export { FaceSemanticMapper, MEDIAPIPE_SEMANTIC_INDEX_MAP, } from "./face/FaceSemanticMapper.js";
export type { SemanticIndexMap, FaceSemanticMapperOptions } from "./face/FaceSemanticMapper.js";
export { FaceMetricsCalculator } from "./face/FaceMetricsCalculator.js";
export { FaceShapeScorer, FACE_SHAPE_SCORER_VERSION } from "./face/FaceShapeScorer.js";
export { GlassesPoseSolver, DEFAULT_FITTING_CONFIG, MM_TO_RENDER_WORLD, decomposeMatrixToEuler, degreesToRadians, } from "./pose/GlassesPoseSolver.js";
export { PoseSmoother, DEFAULT_POSE_SMOOTHING_CONFIG, } from "./smoothing/PoseSmoothing.js";
export { QualityGate } from "./quality/QualityGate.js";
export { PrivacyGuard, DEFAULT_PRIVACY_CONFIG } from "./privacy/PrivacyGuard.js";
export { ManifestValidator, } from "./manifest/ManifestValidator.js";
export type { ManifestValidationIssue, ManifestValidationResult, } from "./manifest/ManifestValidator.js";
export { createSDKError } from "./utils/errors.js";
export * as math from "./utils/math.js";
export { clamp, clamp01, clampAngle, lerp, lerpVec3, distance2D, distance3D, mean, median, trimmedMean, standardDeviation, softmax, minMaxNormalize, mapRange, DEG2RAD, RAD2DEG, } from "./utils/math.js";
//# sourceMappingURL=index.d.ts.map