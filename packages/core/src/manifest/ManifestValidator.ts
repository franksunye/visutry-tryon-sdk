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
export class ManifestValidator {
  validate(manifest: unknown): ManifestValidationResult {
    const issues: ManifestValidationIssue[] = [];

    // --- Structural type guard -------------------------------------------------
    if (manifest === null || typeof manifest !== "object") {
      return {
        valid: false,
        issues: [{ field: "(root)", message: "manifest must be a non-null object", severity: "error" }],
      };
    }

    const m = manifest as Partial<GlassesAssetManifest>;

    // --- Top-level identity ----------------------------------------------
    if (typeof m.id !== "string" || m.id.length === 0) {
      issues.push({ field: "id", message: "id must be a non-empty string", severity: "error" });
    }
    if (typeof m.name !== "string" || m.name.length === 0) {
      issues.push({ field: "name", message: "name must be a non-empty string", severity: "error" });
    }
    if (typeof m.modelUrl !== "string" || m.modelUrl.length === 0) {
      issues.push({ field: "modelUrl", message: "modelUrl must be a non-empty string", severity: "error" });
    }
    if (typeof m.format !== "string" || (m.format !== "glb" && m.format !== "gltf")) {
      issues.push({ field: "format", message: "format must be 'glb' or 'gltf'", severity: "error" });
    }

    // --- Coordinate system ------------------------------------------------
    const cs = m.coordinateSystem;
    if (!cs || typeof cs !== "object") {
      issues.push({ field: "coordinateSystem", message: "coordinateSystem is required and must be an object", severity: "error" });
    } else {
      if (!["millimeter", "centimeter", "meter"].includes(cs.unit ?? "")) {
        issues.push({ field: "coordinateSystem.unit", message: "unit must be millimeter|centimeter|meter", severity: "error" });
      }
      if (cs.forwardAxis !== "+z" && cs.forwardAxis !== "-z") {
        issues.push({ field: "coordinateSystem.forwardAxis", message: "forwardAxis must be '+z' or '-z'", severity: "error" });
      }
      if (cs.upAxis !== "+y" && cs.upAxis !== "+z") {
        issues.push({ field: "coordinateSystem.upAxis", message: "upAxis must be '+y' or '+z'", severity: "error" });
      }
    }

    // --- Dimensions -------------------------------------------------------
    const dims = m.dimensions;
    if (!dims) {
      issues.push({ field: "dimensions", message: "dimensions is required", severity: "error" });
    } else {
      if (typeof dims.frameWidthMm !== "number" || dims.frameWidthMm <= 0) {
        issues.push({ field: "dimensions.frameWidthMm", message: "frameWidthMm must be a positive number", severity: "error" });
      } else if (dims.frameWidthMm < 80 || dims.frameWidthMm > 200) {
        issues.push({
          field: "dimensions.frameWidthMm",
          message: "frameWidthMm outside typical range 80–200mm — verify model units",
          severity: "warning",
        });
      }
      if (dims.lensWidthMm !== undefined && (dims.lensWidthMm <= 0 || dims.lensWidthMm > 80)) {
        issues.push({ field: "dimensions.lensWidthMm", message: "lensWidthMm should be in (0, 80]", severity: "warning" });
      }
    }

    // --- Anchors ----------------------------------------------------------
    const anchors = m.anchors;
    if (!anchors) {
      issues.push({ field: "anchors", message: "anchors is required", severity: "error" });
    } else {
      if (!this.isVector3(anchors.origin)) {
        issues.push({ field: "anchors.origin", message: "origin must be a Vector3", severity: "error" });
      }
      if (!this.isVector3(anchors.noseBridge)) {
        issues.push({ field: "anchors.noseBridge", message: "noseBridge must be a Vector3", severity: "error" });
      }
    }

    // --- Fitting ----------------------------------------------------------
    const fitting = m.fitting;
    if (!fitting) {
      issues.push({ field: "fitting", message: "fitting is required", severity: "error" });
    } else {
      if (typeof fitting.defaultScale !== "number" || fitting.defaultScale <= 0) {
        issues.push({ field: "fitting.defaultScale", message: "defaultScale must be a positive number", severity: "error" });
      }
      if (!this.isVector3(fitting.defaultOffset)) {
        issues.push({ field: "fitting.defaultOffset", message: "defaultOffset must be a Vector3", severity: "error" });
      }
      if (!this.isVector3(fitting.defaultRotation)) {
        issues.push({ field: "fitting.defaultRotation", message: "defaultRotation must be a Vector3", severity: "error" });
      }
      if (
        fitting.minScale !== undefined &&
        fitting.maxScale !== undefined &&
        fitting.minScale > fitting.maxScale
      ) {
        issues.push({ field: "fitting.minScale", message: "minScale must be <= maxScale", severity: "error" });
      }
    }

    // --- Material (optional but type-checked) ----------------------------
    if (m.material) {
      if (m.material.lensOpacity !== undefined && (m.material.lensOpacity < 0 || m.material.lensOpacity > 1)) {
        issues.push({ field: "material.lensOpacity", message: "lensOpacity must be in [0,1]", severity: "error" });
      }
      if (m.material.frameRoughness !== undefined && (m.material.frameRoughness < 0 || m.material.frameRoughness > 1)) {
        issues.push({ field: "material.frameRoughness", message: "frameRoughness must be in [0,1]", severity: "error" });
      }
    }

    const valid = issues.filter((i) => i.severity === "error").length === 0;
    return { valid, issues };
  }

  /** Throw if invalid — convenience for load-time enforcement. */
  validateOrThrow(manifest: unknown): asserts manifest is GlassesAssetManifest {
    const result = this.validate(manifest);
    if (!result.valid) {
      const errors = result.issues.filter((i) => i.severity === "error");
      throw new Error(
        `Invalid glasses manifest: ${errors.map((e) => `${e.field} (${e.message})`).join("; ")}`,
      );
    }
  }

  private isVector3(v: unknown): v is { x: number; y: number; z: number } {
    return (
      !!v &&
      typeof v === "object" &&
      typeof (v as { x?: unknown }).x === "number" &&
      typeof (v as { y?: unknown }).y === "number" &&
      typeof (v as { z?: unknown }).z === "number"
    );
  }
}
