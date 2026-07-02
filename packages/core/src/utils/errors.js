/**
 * Create an `SDKError` with the standard shape. `recoverable` defaults are
 * encoded per error code so call sites stay terse.
 */
export function createSDKError(code, message, cause) {
    return {
        code,
        message,
        cause,
        recoverable: RECOVERABLE_CODES.has(code),
    };
}
const RECOVERABLE_CODES = new Set([
    "CAMERA_NOT_AVAILABLE",
    "TRACKER_DETECT_FAILED",
    "LOW_PERFORMANCE",
    "SNAPSHOT_FAILED",
    "UNKNOWN",
]);
//# sourceMappingURL=errors.js.map