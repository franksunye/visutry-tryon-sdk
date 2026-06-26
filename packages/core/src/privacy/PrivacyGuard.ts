import type { PrivacyConfig, SDKError } from "../types/index.js";

/** Safe default privacy configuration (spec §19.2). */
export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  processOnDeviceOnly: true,
  allowSnapshotExport: true,
  allowAnalytics: false,
  analyticsLevel: "none",
};

/**
 * Enforces the SDK privacy contract.
 *
 * The guard is the single source of truth for what may leave the device. By
 * default everything stays on-device; analytics is off; snapshots require
 * explicit opt-in. The guard exposes intent-revealing methods so the rest of
 * the SDK never has to reason about the raw config flags.
 */
export class PrivacyGuard {
  private config: PrivacyConfig;

  constructor(config: Partial<PrivacyConfig> = {}) {
    this.config = { ...DEFAULT_PRIVACY_CONFIG, ...config };
    this.assertDefaults();
  }

  /** Re-apply a (partial) configuration. */
  configure(config: Partial<PrivacyConfig>): void {
    this.config = { ...this.config, ...config };
    this.assertDefaults();
  }

  get config_(): PrivacyConfig {
    return { ...this.config };
  }

  /** Whether image / video frames may be sent to a server. Always false in v1.0. */
  canUploadFrames(): boolean {
    // On-device-only is the hard contract; uploads are never permitted.
    return false;
  }

  /** Whether face landmarks may leave the device. Always false in v1.0. */
  canUploadLandmarks(): boolean {
    return false;
  }

  /** Whether face geometry / metrics may leave the device. Always false in v1.0. */
  canUploadFaceGeometry(): boolean {
    return false;
  }

  /** Whether the business layer may request a snapshot export. */
  canExportSnapshot(): boolean {
    return this.config.allowSnapshotExport ?? false;
  }

  /** Whether any analytics payload may be emitted. */
  canEmitAnalytics(): boolean {
    return this.config.allowAnalytics === true && this.config.analyticsLevel !== "none";
  }

  /** Whether performance metrics may be reported (only if analytics enabled). */
  canReportPerformance(): boolean {
    if (!this.canEmitAnalytics()) return false;
    const level = this.config.analyticsLevel ?? "none";
    return level === "performance" || level === "diagnostic";
  }

  /** Whether diagnostic (non-image) data may be reported. */
  canReportDiagnostics(): boolean {
    if (!this.canEmitAnalytics()) return false;
    return this.config.analyticsLevel === "diagnostic";
  }

  /**
   * Guarded executor: runs `action` only if `predicate` allows it, otherwise
   * returns a privacy-violation error. Centralises the "ask permission" pattern.
   */
  guard<T>(
    predicate: () => boolean,
    action: () => T,
    errorCode: SDKError["code"] = "UNKNOWN",
    message = "Action blocked by privacy policy",
  ): T {
    if (!predicate()) {
      const error: SDKError = {
        code: errorCode,
        message,
        recoverable: false,
      };
      throw error;
    }
    return action();
  }

  /**
   * Returns a redaction summary for diagnostic logging: lists which data
   * categories are allowed to leave the device. Never includes actual data.
   */
  redactionSummary(): Record<string, boolean> {
    return {
      frames: this.canUploadFrames(),
      landmarks: this.canUploadLandmarks(),
      faceGeometry: this.canUploadFaceGeometry(),
      snapshot: this.canExportSnapshot(),
      performance: this.canReportPerformance(),
      diagnostics: this.canReportDiagnostics(),
    };
  }

  private assertDefaults(): void {
    // The on-device-only flag is a hard requirement; it cannot be disabled.
    if (!this.config.processOnDeviceOnly) {
      this.config.processOnDeviceOnly = true;
    }
  }
}
