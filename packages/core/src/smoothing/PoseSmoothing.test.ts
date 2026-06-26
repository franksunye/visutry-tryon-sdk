import { describe, it, expect } from "vitest";
import { PoseSmoother, DEFAULT_POSE_SMOOTHING_CONFIG } from "./PoseSmoothing.js";
import type { GlassesPose } from "../types/index.js";

function pose(x: number, y: number, visible = true, confidence = 0.9): GlassesPose {
  return {
    position: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible,
    confidence,
  };
}

describe("PoseSmoother", () => {
  it("adopts the first pose directly", () => {
    const s = new PoseSmoother();
    const out = s.smooth(pose(1, 2), 0);
    expect(out.position).toEqual({ x: 1, y: 2, z: 0 });
  });

  it("lerps toward a new pose", () => {
    const s = new PoseSmoother({ positionLerp: 0.5 });
    s.smooth(pose(0, 0), 0);
    const out = s.smooth(pose(10, 10), 16);
    // 0.5 lerp → halfway.
    expect(out.position.x).toBeCloseTo(5);
    expect(out.position.y).toBeCloseTo(5);
  });

  it("ignores sub-threshold deltas to suppress jitter", () => {
    const s = new PoseSmoother({ positionLerp: 1, jitterThreshold: 0.01 });
    s.smooth(pose(0, 0), 0);
    const out = s.smooth(pose(0.001, 0.001), 16);
    // Below threshold → keeps previous.
    expect(out.position.x).toBe(0);
  });

  it("holds the last pose during brief tracking loss", () => {
    const s = new PoseSmoother({ lostTrackingDelayMs: 250 });
    s.smooth(pose(1, 1), 0);
    const out = s.smooth(pose(0, 0, false), 100);
    expect(out.visible).toBe(true);
    expect(out.position.x).toBe(1);
  });

  it("fades out after the lost tracking delay", () => {
    const s = new PoseSmoother({ lostTrackingDelayMs: 250 });
    s.smooth(pose(1, 1), 0);
    const out = s.smooth(pose(0, 0, false), 500);
    expect(out.visible).toBe(false);
  });

  it("recovers smoothly after tracking resumes", () => {
    const s = new PoseSmoother({ lostTrackingDelayMs: 100, positionLerp: 0.5 });
    s.smooth(pose(0, 0), 0);
    s.smooth(pose(0, 0, false), 500); // fully lost & faded
    const recovered = s.smooth(pose(10, 10, true), 600);
    // Should not jump to 10 immediately; lerp resumes.
    expect(recovered.position.x).toBeLessThan(10);
    expect(recovered.visible).toBe(true);
  });

  it("returns raw pose when disabled", () => {
    const s = new PoseSmoother({ enabled: false });
    const out = s.smooth(pose(5, 5), 0);
    expect(out.position.x).toBe(5);
  });

  it("can be reset", () => {
    const s = new PoseSmoother();
    s.smooth(pose(1, 1), 0);
    s.reset();
    const out = s.smooth(pose(9, 9), 100);
    expect(out.position.x).toBe(9);
  });

  it("exposes the lost state", () => {
    const s = new PoseSmoother({ lostTrackingDelayMs: 50 });
    s.smooth(pose(1, 1), 0);
    expect(s.isLost).toBe(false);
    s.smooth(pose(0, 0, false), 200);
    expect(s.isLost).toBe(true);
  });

  it("has the documented default config", () => {
    expect(DEFAULT_POSE_SMOOTHING_CONFIG.enabled).toBe(true);
    expect(DEFAULT_POSE_SMOOTHING_CONFIG.positionLerp).toBe(0.35);
    expect(DEFAULT_POSE_SMOOTHING_CONFIG.rotationLerp).toBe(0.3);
    expect(DEFAULT_POSE_SMOOTHING_CONFIG.scaleLerp).toBe(0.25);
    expect(DEFAULT_POSE_SMOOTHING_CONFIG.jitterThreshold).toBe(0.003);
    expect(DEFAULT_POSE_SMOOTHING_CONFIG.lostTrackingDelayMs).toBe(250);
  });
});
