import type { GlassesAssetManifest } from "../types/index.js";
export interface ManifestValidationIssue {
    field: string;
    message: string;
    severity: "error" | "warning";
}
export interface ManifestValidationResult {
    valid: boolean;
    issues: ManifestValidationIssue[];
}
/**
 * Validates a `GlassesAssetManifest` against the SDK model standard (spec §14).
 *
 * The validator is used at glasses-load time to fail fast on malformed assets,
 * and by the eval tooling to keep the official demo models compliant.
 */
export declare class ManifestValidator {
    validate(manifest: unknown): ManifestValidationResult;
    /** Throw if invalid — convenience for load-time enforcement. */
    validateOrThrow(manifest: unknown): asserts manifest is GlassesAssetManifest;
    private isVector3;
}
//# sourceMappingURL=ManifestValidator.d.ts.map