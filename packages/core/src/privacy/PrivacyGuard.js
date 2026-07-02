/** Safe default privacy configuration (spec §19.2). */
export const DEFAULT_PRIVACY_CONFIG = {
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
    constructor(config = {}) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = { ...DEFAULT_PRIVACY_CONFIG, ...config };
        this.assertDefaults();
    }
    /** Re-apply a (partial) configuration. */
    configure(config) {
        this.config = { ...this.config, ...config };
        this.assertDefaults();
    }
    get config_() {
        return { ...this.config };
    }
    /** Whether image / video frames may be sent to a server. Always false in v1.0. */
    canUploadFrames() {
        // On-device-only is the hard contract; uploads are never permitted.
        return false;
    }
    /** Whether face landmarks may leave the device. Always false in v1.0. */
    canUploadLandmarks() {
        return false;
    }
    /** Whether face geometry / metrics may leave the device. Always false in v1.0. */
    canUploadFaceGeometry() {
        return false;
    }
    /** Whether the business layer may request a snapshot export. */
    canExportSnapshot() {
        return this.config.allowSnapshotExport ?? false;
    }
    /** Whether any analytics payload may be emitted. */
    canEmitAnalytics() {
        return this.config.allowAnalytics === true && this.config.analyticsLevel !== "none";
    }
    /** Whether performance metrics may be reported (only if analytics enabled). */
    canReportPerformance() {
        if (!this.canEmitAnalytics())
            return false;
        const level = this.config.analyticsLevel ?? "none";
        return level === "performance" || level === "diagnostic";
    }
    /** Whether diagnostic (non-image) data may be reported. */
    canReportDiagnostics() {
        if (!this.canEmitAnalytics())
            return false;
        return this.config.analyticsLevel === "diagnostic";
    }
    /**
     * Guarded executor: runs `action` only if `predicate` allows it, otherwise
     * returns a privacy-violation error. Centralises the "ask permission" pattern.
     */
    guard(predicate, action, errorCode = "UNKNOWN", message = "Action blocked by privacy policy") {
        if (!predicate()) {
            const error = {
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
    redactionSummary() {
        return {
            frames: this.canUploadFrames(),
            landmarks: this.canUploadLandmarks(),
            faceGeometry: this.canUploadFaceGeometry(),
            snapshot: this.canExportSnapshot(),
            performance: this.canReportPerformance(),
            diagnostics: this.canReportDiagnostics(),
        };
    }
    assertDefaults() {
        // The on-device-only flag is a hard requirement; it cannot be disabled.
        if (!this.config.processOnDeviceOnly) {
            this.config.processOnDeviceOnly = true;
        }
    }
}
//# sourceMappingURL=PrivacyGuard.js.map