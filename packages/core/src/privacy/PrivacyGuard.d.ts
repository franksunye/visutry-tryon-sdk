import type { PrivacyConfig, SDKError } from "../types/index.js";
/** Safe default privacy configuration (spec §19.2). */
export declare const DEFAULT_PRIVACY_CONFIG: PrivacyConfig;
/**
 * Enforces the SDK privacy contract.
 *
 * The guard is the single source of truth for what may leave the device. By
 * default everything stays on-device; analytics is off; snapshots require
 * explicit opt-in. The guard exposes intent-revealing methods so the rest of
 * the SDK never has to reason about the raw config flags.
 */
export declare class PrivacyGuard {
    private config;
    constructor(config?: Partial<PrivacyConfig>);
    /** Re-apply a (partial) configuration. */
    configure(config: Partial<PrivacyConfig>): void;
    get config_(): PrivacyConfig;
    /** Whether image / video frames may be sent to a server. Always false in v1.0. */
    canUploadFrames(): boolean;
    /** Whether face landmarks may leave the device. Always false in v1.0. */
    canUploadLandmarks(): boolean;
    /** Whether face geometry / metrics may leave the device. Always false in v1.0. */
    canUploadFaceGeometry(): boolean;
    /** Whether the business layer may request a snapshot export. */
    canExportSnapshot(): boolean;
    /** Whether any analytics payload may be emitted. */
    canEmitAnalytics(): boolean;
    /** Whether performance metrics may be reported (only if analytics enabled). */
    canReportPerformance(): boolean;
    /** Whether diagnostic (non-image) data may be reported. */
    canReportDiagnostics(): boolean;
    /**
     * Guarded executor: runs `action` only if `predicate` allows it, otherwise
     * returns a privacy-violation error. Centralises the "ask permission" pattern.
     */
    guard<T>(predicate: () => boolean, action: () => T, errorCode?: SDKError["code"], message?: string): T;
    /**
     * Returns a redaction summary for diagnostic logging: lists which data
     * categories are allowed to leave the device. Never includes actual data.
     */
    redactionSummary(): Record<string, boolean>;
    private assertDefaults;
}
//# sourceMappingURL=PrivacyGuard.d.ts.map