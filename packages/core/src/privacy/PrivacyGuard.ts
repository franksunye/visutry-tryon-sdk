import type { PrivacyConfig, SDKError } from "../types/index.js";

/** Current policy defaults: local processing, snapshots enabled, analytics disabled. */
export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  processOnDeviceOnly: true,
  allowSnapshotExport: true,
  allowAnalytics: false,
  analyticsLevel: "none",
};

/**
 * Evaluates SDK privacy policy for callers that explicitly consult this helper.
 *
 * Upload-policy methods deny face-data uploads and analytics is disabled by
 * default. Snapshot export is enabled by the current default configuration.
 * The Web facade checks snapshot permission; this helper does not intercept
 * network requests or prevent host applications from using returned data.
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

  /** Upload-policy decision for images / video frames; always false in this implementation. */
  canUploadFrames(): boolean {
    // On-device-only is the hard contract; uploads are never permitted.
    return false;
  }

  /** Upload-policy decision for landmarks; always false in this implementation. */
  canUploadLandmarks(): boolean {
    return false;
  }

  /** Upload-policy decision for geometry / metrics; always false in this implementation. */
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
   * categories the policy permits. It does not redact returned data or enforce
   * transport restrictions. Never includes actual face data.
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
