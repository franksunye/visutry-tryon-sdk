import { describe, it, expect } from "vitest";
import { ManifestValidator } from "./ManifestValidator.js";
import { buildManifest } from "../__fixtures__/faceFixtures.js";

describe("ManifestValidator", () => {
  const validator = new ManifestValidator();

  it("validates a correct manifest", () => {
    const result = validator.validate(buildManifest());
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("reports errors for missing required fields", () => {
    const result = validator.validate({});
    expect(result.valid).toBe(false);
    const fields = result.issues.map((i) => i.field);
    expect(fields).toContain("id");
    expect(fields).toContain("name");
    expect(fields).toContain("modelUrl");
    expect(fields).toContain("format");
    expect(fields).toContain("coordinateSystem");
    expect(fields).toContain("dimensions");
    expect(fields).toContain("anchors");
    expect(fields).toContain("fitting");
  });

  it("rejects an invalid format", () => {
    const result = validator.validate(buildManifest({ format: "obj" as never }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "format")).toBe(true);
  });

  it("rejects an invalid coordinate system unit", () => {
    const result = validator.validate(
      buildManifest({ coordinateSystem: { unit: "inch" as never, forwardAxis: "+z", upAxis: "+y" } }),
    );
    expect(result.valid).toBe(false);
  });

  it("warns when frameWidthMm is outside the typical range", () => {
    const result = validator.validate(buildManifest({ dimensions: { frameWidthMm: 50 } }));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.field === "dimensions.frameWidthMm" && i.severity === "warning")).toBe(true);
  });

  it("rejects non-positive frameWidthMm", () => {
    const result = validator.validate(buildManifest({ dimensions: { frameWidthMm: 0 } }));
    expect(result.valid).toBe(false);
  });

  it("rejects minScale > maxScale", () => {
    const result = validator.validate(
      buildManifest({ fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 3, maxScale: 1 } }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects lensOpacity out of [0,1]", () => {
    const result = validator.validate(buildManifest({ material: { lensOpacity: 1.5 } }));
    expect(result.valid).toBe(false);
  });

  it("requires anchors.origin and anchors.noseBridge to be Vector3", () => {
    const result = validator.validate(
      buildManifest({ anchors: { origin: { x: 0, y: 0 } as never, noseBridge: { x: 0, y: 0, z: 0 } } }),
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "anchors.origin")).toBe(true);
  });

  it("validateOrThrow throws on invalid manifest", () => {
    expect(() => validator.validateOrThrow({ id: "bad" })).toThrow();
  });

  it("validateOrThrow passes on valid manifest", () => {
    expect(() => validator.validateOrThrow(buildManifest())).not.toThrow();
  });

  // --- Runtime type guard tests (P2) ---
  it("rejects null manifest", () => {
    const result = validator.validate(null);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].field).toBe("(root)");
    expect(result.issues[0].message).toContain("non-null object");
  });

  it("rejects primitive values (string, number, boolean)", () => {
    for (const val of ["not-an-object", 42, true]) {
      const result = validator.validate(val);
      expect(result.valid).toBe(false);
      expect(result.issues[0].field).toBe("(root)");
      expect(result.issues[0].message).toContain("non-null object");
    }
  });

  it("rejects undefined as manifest", () => {
    const result = validator.validate(undefined);
    expect(result.valid).toBe(false);
    expect(result.issues[0].field).toBe("(root)");
  });

  it("rejects manifest with non-string id", () => {
    const result = validator.validate(buildManifest({ id: 123 as never }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "id")).toBe(true);
  });

  it("rejects manifest with non-string name", () => {
    const result = validator.validate(buildManifest({ name: null as never }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "name")).toBe(true);
  });

  it("rejects manifest with non-string modelUrl", () => {
    const result = validator.validate(buildManifest({ modelUrl: undefined as never }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "modelUrl")).toBe(true);
  });

  it("rejects manifest with non-string format", () => {
    const result = validator.validate(buildManifest({ format: 123 as never }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "format")).toBe(true);
  });

  it("rejects manifest where coordinateSystem is a string instead of object", () => {
    const result = validator.validate(buildManifest({ coordinateSystem: "millimeter" as never }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "coordinateSystem")).toBe(true);
    expect(result.issues.some((i) => i.message.includes("must be an object"))).toBe(true);
  });

  it("rejects manifest where coordinateSystem is null", () => {
    const result = validator.validate(buildManifest({ coordinateSystem: null as never }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === "coordinateSystem")).toBe(true);
  });
});
