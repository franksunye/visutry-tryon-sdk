import { describe, it, expect } from "vitest";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";
import { buildFaceResult, buildSemanticPoints } from "../__fixtures__/faceFixtures.js";

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
    const m = calc.computeFromSemantic(sem);
    expect(m.cheekboneWidth).toBeGreaterThan(m.jawWidth);
    expect(m.jawCheekRatio).toBeLessThan(0.8);
  });

  it("classifies a square face chin as square", () => {
    const sem = buildSemanticPoints("square");
    const m = calc.computeFromSemantic(sem);
    expect(m.chinType).toBe("square");
  });

  it("classifies a heart face chin as pointed", () => {
    const sem = buildSemanticPoints("heart");
    const m = calc.computeFromSemantic(sem);
    expect(m.chinType).toBe("pointed");
  });

  it("tolerates missing points without throwing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftCheek;
    delete sem.rightCheek;
    delete sem.chin;
    const m = calc.computeFromSemantic(sem);
    // cheekboneWidth falls back to 0 when cheek points are gone.
    expect(m.cheekboneWidth).toBe(0);
    expect(m.measurementQuality).toBeLessThan(1);
  });

  it("returns measurementQuality < 1 when key points are missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftJaw;
    delete sem.rightJaw;
    const m = calc.computeFromSemantic(sem);
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
    const round = calc.computeFromSemantic(buildSemanticPoints("round"));
    const oblong = calc.computeFromSemantic(buildSemanticPoints("oblong"));
    expect(oblong.widthHeightRatio).toBeLessThan(round.widthHeightRatio);
  });
});
