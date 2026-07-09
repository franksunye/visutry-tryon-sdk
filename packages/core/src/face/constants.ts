/**
 * Shared quality thresholds used by both FaceShapeScorer and QualityGate.
 *
 * These values mirror visutry's production analysis thresholds and must
 * stay in sync across both consumers. Extracting them here prevents
 * silent divergence when one file is updated without the other.
 */

/** Maximum acceptable eye-line tilt in degrees before face shape analysis is rejected. */
export const MAX_TILT_DEG = 15;

/** Maximum acceptable nose-bridge lateral offset (normalized) before rejection. */
export const MAX_SYMMETRY_OFFSET = 0.14;

/** Minimum face span (normalized bbox max dimension) before rejection. */
export const MIN_FACE_SPAN = 0.16;
