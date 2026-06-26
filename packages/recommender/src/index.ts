/**
 * @visutry/recommender
 *
 * Glasses recommendation engine for the VisuTry SDK. Combines face-shape x
 * frame-shape matching, millimetre-level size recommendation and user
 * preference scoring to rank a glasses inventory for a given face.
 */

// Engine
export { Recommender } from "./Recommender.js";

// Constants & calibration
export {
  FACE_SHAPE_FRAME_MATCH,
  SCORE_WEIGHTS,
  MAX_RAW_SCORE,
  LENS_WIDTH_RANGES,
  FACE_WIDTH_TIER_THRESHOLDS,
  AVERAGE_FACE_WIDTH_MM,
  AVERAGE_FACE_WIDTH_NORM,
  AVERAGE_EYE_CENTER_DISTANCE_MM,
  MM_PER_NORM,
  type FaceSizeTier,
} from "./constants.js";

// Sizing helpers
export {
  estimateFaceWidthMm,
  estimateEyeCenterDistanceMm,
  recommendSize,
  type SizeRecommendation,
} from "./sizing.js";
