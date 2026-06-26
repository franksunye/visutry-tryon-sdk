import type { SDKError, SDKErrorCode } from "../types/index.js";

/**
 * Create an `SDKError` with the standard shape. `recoverable` defaults are
 * encoded per error code so call sites stay terse.
 */
export function createSDKError(
  code: SDKErrorCode,
  message: string,
  cause?: unknown,
): SDKError {
  return {
    code,
    message,
    cause,
    recoverable: RECOVERABLE_CODES.has(code),
  };
}

const RECOVERABLE_CODES = new Set<SDKErrorCode>([
  "CAMERA_NOT_AVAILABLE",
  "TRACKER_DETECT_FAILED",
  "LOW_PERFORMANCE",
  "SNAPSHOT_FAILED",
  "UNKNOWN",
]);
