/**
 * @visutry/recommender
 *
 * Glasses recommendation engine for the VisuTry SDK. Combines face-shape x
 * frame-shape rules, optional host-supplied physical measurements and user
 * preferences to rank a glasses inventory. Image geometry does not infer size.
 */

// Engine
export { Recommender } from "./Recommender.js";

// Inspectable heuristic rules
export {
  FACE_SHAPE_FRAME_MATCH,
  SCORE_WEIGHTS,
  MAX_RAW_SCORE,
  LENS_WIDTH_RANGES,
  FACE_WIDTH_TIER_THRESHOLDS,
  type FaceSizeTier,
} from "./constants.js";

// Sizing helpers
export {
  estimateFaceWidthMm,
  estimateEyeCenterDistanceMm,
  recommendSize,
  type SizeRecommendation,
} from "./sizing.js";

export type { PhysicalFaceMeasurements } from "@visutry/tryon-core";
