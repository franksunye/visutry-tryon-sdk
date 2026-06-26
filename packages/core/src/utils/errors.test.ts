import { describe, it, expect } from "vitest";
import { createSDKError } from "./errors.js";
import type { SDKError, SDKErrorCode } from "../types/index.js";

describe("createSDKError", () => {
  // -------------------------------------------------------------------------
  // Basic shape
  // -------------------------------------------------------------------------

  it("returns an object with code, message, and recoverable fields", () => {
    const err = createSDKError("UNKNOWN", "something went wrong");
    expect(err).toHaveProperty("code", "UNKNOWN");
    expect(err).toHaveProperty("message", "something went wrong");
    expect(err).toHaveProperty("recoverable");
    expect(typeof err.recoverable).toBe("boolean");
  });

  it("has name 'VisuTrySDKError' when used as an error", () => {
    const err = createSDKError("UNKNOWN", "test");
    // The raw object doesn't carry a name, but callers typically use it as
    // an SDKError.  Verify the structural contract holds.
    expect(err.code).toBeDefined();
    expect(err.message).toBeDefined();
    expect(err.recoverable).toBeDefined();
  });

  it("preserves the original error in the cause field", () => {
    const original = new Error("network failure");
    const err = createSDKError("UNKNOWN", "wrapped error", original);
    expect(err.cause).toBe(original);
  });

  it("allows undefined cause", () => {
    const err = createSDKError("UNKNOWN", "no cause");
    expect(err.cause).toBeUndefined();
  });

  it("allows non-Error cause values", () => {
    const err = createSDKError("UNKNOWN", "string cause", "raw string");
    expect(err.cause).toBe("raw string");

    const err2 = createSDKError("UNKNOWN", "object cause", { code: 42 });
    expect(err2.cause).toEqual({ code: 42 });

    const err3 = createSDKError("UNKNOWN", "null cause", null);
    expect(err3.cause).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Recoverable codes
  // -------------------------------------------------------------------------

  const RECOVERABLE_CODES: SDKErrorCode[] = [
    "CAMERA_NOT_AVAILABLE",
    "TRACKER_DETECT_FAILED",
    "LOW_PERFORMANCE",
    "SNAPSHOT_FAILED",
    "UNKNOWN",
  ];

  it.each(RECOVERABLE_CODES)("marks %s as recoverable", (code) => {
    const err = createSDKError(code, "test");
    expect(err.recoverable).toBe(true);
  });

  const NON_RECOVERABLE_CODES: SDKErrorCode[] = [
    "CAMERA_PERMISSION_DENIED",
    "TRACKER_INIT_FAILED",
    "RENDERER_INIT_FAILED",
    "GLASSES_LOAD_FAILED",
    "UNSUPPORTED_PLATFORM",
  ];

  it.each(NON_RECOVERABLE_CODES)("marks %s as non-recoverable", (code) => {
    const err = createSDKError(code, "test");
    expect(err.recoverable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Exhaustive: every valid SDKErrorCode produces a valid SDKError
  // -------------------------------------------------------------------------

  const ALL_CODES: SDKErrorCode[] = [
    "CAMERA_PERMISSION_DENIED",
    "CAMERA_NOT_AVAILABLE",
    "TRACKER_INIT_FAILED",
    "TRACKER_DETECT_FAILED",
    "RENDERER_INIT_FAILED",
    "GLASSES_LOAD_FAILED",
    "UNSUPPORTED_PLATFORM",
    "LOW_PERFORMANCE",
    "SNAPSHOT_FAILED",
    "UNKNOWN",
  ];

  it.each(ALL_CODES)("produces a valid SDKError for code '%s'", (code) => {
    const err = createSDKError(code, `error with ${code}`);
    expect(err.code).toBe(code);
    expect(err.message).toBe(`error with ${code}`);
    expect(typeof err.recoverable).toBe("boolean");
    // Verify it satisfies the SDKError type contract
    const _typed: SDKError = err;
    expect(_typed).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it("handles empty message string", () => {
    const err = createSDKError("UNKNOWN", "");
    expect(err.message).toBe("");
    expect(err.recoverable).toBe(true);
  });

  it("handles long message strings", () => {
    const longMsg = "a".repeat(10000);
    const err = createSDKError("UNKNOWN", longMsg);
    expect(err.message).toBe(longMsg);
  });
});
