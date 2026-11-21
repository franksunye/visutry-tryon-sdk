import { describe, it, expect } from "vitest";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";
import { buildFaceResult, buildSemanticPoints, reframeSemanticPoints } from "../__fixtures__/faceFixtures.js";
import type { ImageSize } from "../types/index.js";

const SQUARE = { width: 1000, height: 1000 };

describe("FaceMetricsCalculator", () => {
  const calc = new FaceMetricsCalculator();

  it("computes metrics from a full semantic point set", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem);
    const m = calc.compute(face);

    expect(m.faceWidth).toBeGreaterThan(0);
    expect(m.faceHeight).toBeGreaterThan(0);
    expect(m.cheekboneWidth).toBeGreaterThan(0);
    expect(m.jawWidth).toBeGreaterThan(0);
    expect(m.eyeOuterDistance).toBeGreaterThan(0);
    expect(m.eyeInnerDistance).toBeGreaterThan(0);
    expect(m.eyeCenterDistance).toBeGreaterThan(0);
    expect(m.widthHeightRatio).toBeGreaterThan(0);
    expect(m.jawCheekRatio).toBeGreaterThan(0);
    expect(m.measurementQuality).toBeGreaterThan(0.5);
  });

  it("faceWidth is wider than jawWidth for an oval/heart face", () => {
    const sem = buildSemanticPoints("heart");
    const m = calc.computeFromSemantic(sem, SQUARE);
    expect(m.cheekboneWidth).toBeGreaterThan(m.jawWidth);
    expect(m.jawCheekRatio).toBeLessThan(0.8);
  });

  it("classifies a square face chin as square", () => {
    const sem = buildSemanticPoints("square");
    const m = calc.computeFromSemantic(sem, SQUARE);
    expect(m.chinType).toBe("square");
  });

  it("classifies a heart face chin as pointed", () => {
    const sem = buildSemanticPoints("heart");
    const m = calc.computeFromSemantic(sem, SQUARE);
    expect(m.chinType).toBe("pointed");
  });

  it("tolerates missing points without throwing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftCheek;
    delete sem.rightCheek;
    delete sem.chin;
    const m = calc.computeFromSemantic(sem, SQUARE);
    // cheekboneWidth falls back to 0 when cheek points are gone.
    expect(m.cheekboneWidth).toBe(0);
    expect(m.measurementQuality).toBeLessThan(1);
  });

  it("returns measurementQuality < 1 when key points are missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftJaw;
    delete sem.rightJaw;
    const m = calc.computeFromSemantic(sem, SQUARE);
    expect(m.measurementQuality).toBeLessThan(1);
  });

  it("aggregates multiple frames via median", () => {
    const frames = [buildFaceResult(buildSemanticPoints("oval"))];
    // Add small jitter copies.
    for (let i = 0; i < 4; i++) {
      frames.push(buildFaceResult(buildSemanticPoints("oval")));
    }
    const m = calc.aggregate(frames);
    expect(m.faceWidth).toBeGreaterThan(0);
    expect(m.measurementQuality).toBeGreaterThan(0.5);
  });

  it("returns empty metrics for zero frames", () => {
    const m = calc.aggregate([]);
    expect(m.faceWidth).toBe(0);
    expect(m.chinType).toBe("unknown");
  });

  it("oblong face has lower width/height ratio than round", () => {
    const round = calc.computeFromSemantic(buildSemanticPoints("round"), SQUARE);
    const oblong = calc.computeFromSemantic(buildSemanticPoints("oblong"), SQUARE);
    expect(oblong.widthHeightRatio).toBeLessThan(round.widthHeightRatio);
  });

  it.each([
    { width: 500, height: 500, scale: 0.5, x: 0, y: 0 },
    { width: 1600, height: 1000, scale: 1, x: 300, y: 0 },
    { width: 1000, height: 1600, scale: 1, x: 0, y: 300 },
  ])("preserves pixel geometry in a $width x $height image", ({ width, height, scale, x, y }) => {
    const semantic = buildSemanticPoints("oval");
    semantic.rightEyeOuter!.y += Math.tan(12 * Math.PI / 180)
      * (semantic.rightEyeOuter!.x - semantic.leftEyeOuter!.x);
    const expected = calc.computeFromSemantic(semantic, SQUARE);
    const target = { width, height };
    const transformed = reframeSemanticPoints(semantic, SQUARE, target, scale, { x, y });
    const actual = calc.computeFromSemantic(transformed, target);

    expect(actual.geometryValid).toBe(true);
    expect(actual.visutry).toEqual(expected.visutry);
    expect(actual.eyeLineTiltDeg).toBeCloseTo(12, 10);
    expect(actual.faceWidth).toBeCloseTo(expected.faceWidth * SQUARE.width * scale / width, 10);
    expect(actual.faceSpanX).toBeCloseTo(expected.faceSpanX! * SQUARE.width * scale / width, 10);
    expect(actual.faceSpanY).toBeCloseTo(expected.faceSpanY! * SQUARE.height * scale / height, 10);
  });

  it("preserves shape ratios under padding while rejecting an undersized image-space span", () => {
    const semantic = buildSemanticPoints("oval");
    const target = { width: 2500, height: 1000 };
    const padded = reframeSemanticPoints(semantic, SQUARE, target, 1, { x: 750, y: 0 });
    const expected = calc.computeFromSemantic(semantic, SQUARE);
    const actual = calc.computeFromSemantic(padded, target);
    expect(actual.visutry).toEqual(expected.visutry);
    expect(actual.faceSpanY).toBeGreaterThan(0.16);
    expect(actual.faceSpanX).toBeLessThan(0.16);
    expect(actual.geometryValid).toBe(false);
    expect(actual.geometryWarnings).toContain("FACE_TOO_SMALL");
  });

  it.each([
    undefined,
    { width: 0, height: 1000 },
    { width: -1, height: 1000 },
    { width: 1000, height: Number.NaN },
    { width: Infinity, height: 1000 },
    { width: 1000, height: 0 },
    null as unknown as ImageSize,
  ])("rejects missing or invalid image size %j without a square fallback", (size) => {
    const metrics = calc.computeFromSemantic(buildSemanticPoints("oval"), size);
    expect(metrics.geometryValid).toBe(false);
    expect(metrics.geometryWarnings).toEqual(["INVALID_IMAGE_SIZE"]);
    expect(metrics.measurementQuality).toBe(0);
    expect(metrics.visutry).toBeUndefined();
  });

  it.each([Number.NaN, Infinity, -Infinity])("rejects non-finite key-point coordinates: %s", (invalid) => {
    const semantic = buildSemanticPoints("oval");
    semantic.leftJaw!.x = invalid;
    const metrics = calc.computeFromSemantic(semantic, SQUARE);
    expect(metrics.geometryValid).toBe(false);
    expect(metrics.geometryWarnings).toContain("INVALID_LANDMARKS");
    expect(Object.values(metrics).filter((value) => typeof value === "number").every(Number.isFinite)).toBe(true);
  });

  it("ignores detector-specific z values in 2D photo measurements", () => {
    const semantic = buildSemanticPoints("oval");
    const expected = calc.computeFromSemantic(semantic, SQUARE);
    for (const point of Object.values(semantic)) point!.z = Number.NaN;
    const actual = calc.computeFromSemantic(semantic, SQUARE);
    expect(actual).toEqual(expected);
  });

  it("does not hide an invalid later sample inside aggregate metrics", () => {
    const good = buildFaceResult(buildSemanticPoints("oval"));
    const invalid = buildFaceResult(buildSemanticPoints("oval"), { imageSize: undefined });
    const metrics = calc.aggregate([good, good, invalid, good]);
    expect(metrics.geometryValid).toBe(false);
    expect(metrics.geometryWarnings).toContain("INVALID_IMAGE_SIZE");
    expect(metrics.visutry).toBeUndefined();
  });
});
