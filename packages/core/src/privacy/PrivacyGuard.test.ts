import { describe, it, expect } from "vitest";
import { PrivacyGuard, DEFAULT_PRIVACY_CONFIG } from "./PrivacyGuard.js";

describe("PrivacyGuard", () => {
  it("defaults to on-device-only with analytics off", () => {
    const guard = new PrivacyGuard();
    expect(guard.canUploadFrames()).toBe(false);
    expect(guard.canUploadLandmarks()).toBe(false);
    expect(guard.canUploadFaceGeometry()).toBe(false);
    expect(guard.canEmitAnalytics()).toBe(false);
    expect(guard.canReportPerformance()).toBe(false);
  });

  it("allows snapshot export by default", () => {
    const guard = new PrivacyGuard();
    expect(guard.canExportSnapshot()).toBe(true);
  });

  it("can disable snapshot export", () => {
    const guard = new PrivacyGuard({ allowSnapshotExport: false });
    expect(guard.canExportSnapshot()).toBe(false);
  });

  it("never allows frame/landmark uploads even when analytics enabled", () => {
    const guard = new PrivacyGuard({ allowAnalytics: true, analyticsLevel: "diagnostic" });
    expect(guard.canUploadFrames()).toBe(false);
    expect(guard.canUploadLandmarks()).toBe(false);
    expect(guard.canUploadFaceGeometry()).toBe(false);
    expect(guard.canEmitAnalytics()).toBe(true);
    expect(guard.canReportPerformance()).toBe(true);
    expect(guard.canReportDiagnostics()).toBe(true);
  });

  it("performance reporting requires performance or diagnostic level", () => {
    const perfGuard = new PrivacyGuard({ allowAnalytics: true, analyticsLevel: "performance" });
    expect(perfGuard.canReportPerformance()).toBe(true);
    expect(perfGuard.canReportDiagnostics()).toBe(false);
  });

  it("cannot disable processOnDeviceOnly", () => {
    const guard = new PrivacyGuard({ processOnDeviceOnly: false as never });
    // The guard re-asserts the default; uploads remain blocked.
    expect(guard.canUploadFrames()).toBe(false);
  });

  it("guard() runs the action when predicate passes", () => {
    const guard = new PrivacyGuard();
    const result = guard.guard(() => true, () => 42);
    expect(result).toBe(42);
  });

  it("guard() throws when predicate fails", () => {
    const guard = new PrivacyGuard();
    expect(() => guard.guard(() => false, () => 42, "SNAPSHOT_FAILED", "blocked")).toThrow();
  });

  it("redactionSummary lists all data categories", () => {
    const guard = new PrivacyGuard({ allowAnalytics: true, analyticsLevel: "performance" });
    const summary = guard.redactionSummary();
    expect(summary).toHaveProperty("frames");
    expect(summary).toHaveProperty("landmarks");
    expect(summary).toHaveProperty("performance");
    expect(summary.frames).toBe(false);
    expect(summary.performance).toBe(true);
  });

  it("has the documented default config", () => {
    expect(DEFAULT_PRIVACY_CONFIG.processOnDeviceOnly).toBe(true);
    expect(DEFAULT_PRIVACY_CONFIG.allowAnalytics).toBe(false);
    expect(DEFAULT_PRIVACY_CONFIG.analyticsLevel).toBe("none");
  });

  it("can be reconfigured after construction", () => {
    const guard = new PrivacyGuard();
    expect(guard.canExportSnapshot()).toBe(true);
    guard.configure({ allowSnapshotExport: false });
    expect(guard.canExportSnapshot()).toBe(false);
  });
});
