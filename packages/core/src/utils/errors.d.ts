import type { SDKError, SDKErrorCode } from "../types/index.js";
/**
 * Create an `SDKError` with the standard shape. `recoverable` defaults are
 * encoded per error code so call sites stay terse.
 */
export declare function createSDKError(code: SDKErrorCode, message: string, cause?: unknown): SDKError;
//# sourceMappingURL=errors.d.ts.map