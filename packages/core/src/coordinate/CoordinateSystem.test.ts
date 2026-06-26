import { describe, it, expect } from "vitest";
import { CoordinateSystem } from "./CoordinateSystem.js";

describe("CoordinateSystem", () => {
  it("converts pixel to normalized coordinates", () => {
    const result = CoordinateSystem.pixelToNormalized({ x: 320, y: 240 }, 640, 480);
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBeCloseTo(0.5);
  });

  it("converts a batch of pixel points", () => {
    const result = CoordinateSystem.pixelToNormalizedBatch(
      [
        { x: 0, y: 0, z: 0 },
        { x: 640, y: 480, z: 0 },
      ],
      640,
      480,
    );
    expect(result[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(result[1].x).toBeCloseTo(1);
    expect(result[1].y).toBeCloseTo(1);
  });

  it("round-trips normalized ↔ pixel", () => {
    const norm = { x: 0.25, y: 0.75, z: 0.1 };
    const px = CoordinateSystem.normalizedToPixel(norm, 640, 480);
    expect(px.x).toBeCloseTo(160);
    expect(px.y).toBeCloseTo(360);
  });

  it("converts normalized (y down) to render-world (y up, centered)", () => {
    const rw = CoordinateSystem.normalizedToRenderWorld({ x: 0.5, y: 0.5, z: 0 }, 1);
    expect(rw).toEqual({ x: 0, y: 0, z: 0 });
    const top = CoordinateSystem.normalizedToRenderWorld({ x: 0.5, y: 0, z: 0 }, 1);
    expect(top.y).toBeCloseTo(0.5);
    const bottom = CoordinateSystem.normalizedToRenderWorld({ x: 0.5, y: 1, z: 0 }, 1);
    expect(bottom.y).toBeCloseTo(-0.5);
  });

  it("scales x by aspect ratio in render-world", () => {
    const rw = CoordinateSystem.normalizedToRenderWorld({ x: 1, y: 0.5, z: 0 }, 16 / 9);
    expect(rw.x).toBeCloseTo((1 - 0.5) * (16 / 9));
  });

  it("round-trips render-world ↔ normalized", () => {
    const rw = { x: 0.2, y: -0.1, z: 0 };
    const norm = CoordinateSystem.renderWorldToNormalized(rw, 1);
    expect(norm.x).toBeCloseTo(0.7);
    expect(norm.y).toBeCloseTo(0.6);
  });

  it("clamps normalized values and reports clamping", () => {
    expect(CoordinateSystem.clampNormalized(0.5)).toEqual({ value: 0.5, clamped: false });
    expect(CoordinateSystem.clampNormalized(-1)).toEqual({ value: 0, clamped: true });
    expect(CoordinateSystem.clampNormalized(2)).toEqual({ value: 1, clamped: true });
  });

  it("describes each coordinate system", () => {
    expect(CoordinateSystem.describe("pixel-image")).toContain("Pixel Image");
    expect(CoordinateSystem.describe("normalized-image")).toContain("Normalized Image");
    expect(CoordinateSystem.describe("render-world")).toContain("Render World");
    expect(CoordinateSystem.describe("glasses-local")).toContain("Glasses Local");
  });
});
