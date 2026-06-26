import { describe, it, expect } from "vitest";
import {
  add,
  sub,
  scale,
  lerp,
  lerpVec3,
  dot,
  cross,
  length,
  normalize,
  distance2D,
  distance3D,
  midpoint,
  clamp,
  clamp01,
  clampAngle,
  mean,
  median,
  trimmedMean,
  standardDeviation,
  softmax,
  minMaxNormalize,
  mapRange,
  DEG2RAD,
  RAD2DEG,
} from "../utils/math.js";

describe("vector math", () => {
  it("adds and subtracts vectors", () => {
    expect(add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toEqual({ x: 5, y: 7, z: 9 });
    expect(sub({ x: 4, y: 5, z: 6 }, { x: 1, y: 2, z: 3 })).toEqual({ x: 3, y: 3, z: 3 });
  });

  it("scales a vector", () => {
    expect(scale({ x: 1, y: 2, z: 3 }, 2)).toEqual({ x: 2, y: 4, z: 6 });
  });

  it("lerps scalars and vectors", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerpVec3({ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, 0.5)).toEqual({
      x: 5,
      y: 10,
      z: 15,
    });
  });

  it("computes dot and cross product", () => {
    expect(dot({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
    expect(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("computes length and normalizes", () => {
    expect(length({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
    const n = normalize({ x: 3, y: 4, z: 0 });
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
  });

  it("computes 2D / 3D distances and midpoint", () => {
    expect(distance2D({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBe(13);
    expect(midpoint({ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 })).toEqual({
      x: 5,
      y: 10,
      z: 15,
    });
  });
});

describe("clamp helpers", () => {
  it("clamps values to range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("clamps to [0,1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
  });

  it("wraps angles to [-PI, PI)", () => {
    expect(clampAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(clampAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(clampAngle(0)).toBe(0);
  });
});

describe("statistics", () => {
  it("computes mean", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([])).toBe(0);
  });

  it("computes median", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("computes trimmed mean", () => {
    // trim 20% from each end of [1,2,3,4,5] => drop 1 and 5 => mean(2,3,4)=3
    expect(trimmedMean([1, 2, 3, 4, 5], 0.2)).toBe(3);
  });

  it("computes standard deviation", () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 1);
  });
});

describe("softmax and normalization", () => {
  it("softmax sums to 1 and is stable", () => {
    const result = softmax([1000, 1000, 1000]);
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(result[0]).toBeCloseTo(1 / 3);
  });

  it("softmax sharpens with low temperature", () => {
    const cold = softmax([1, 2, 3], 0.1);
    expect(cold[2]).toBeGreaterThan(0.9);
  });

  it("min-max normalizes to [0,1]", () => {
    expect(minMaxNormalize([0, 5, 10])).toEqual([0, 0.5, 1]);
    expect(minMaxNormalize([5, 5, 5])).toEqual([1, 1, 1]);
  });

  it("maps a value between ranges", () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(0, 0, 10, 100, 200)).toBe(100);
  });
});

describe("angle constants", () => {
  it("converts degrees and radians", () => {
    expect(180 * DEG2RAD).toBeCloseTo(Math.PI);
    expect(Math.PI * RAD2DEG).toBeCloseTo(180);
  });
});
