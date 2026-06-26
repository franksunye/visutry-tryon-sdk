import { describe, it, expect } from "vitest";
import type { FrameInput } from "@visutry/tryon-core";
import { WechatFaceTracker } from "./WechatFaceTracker.js";
import {
  MockVKSession,
  MockWechatEnvironment,
} from "../__testutils__/wechatMock.js";
import type { WechatFrameInput } from "../types.js";

/** Identity 4x4 column-major matrix. */
const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Build a 468-point flat landmark array with known MediaPipe-indexed points. */
function buildFacePoints(): number[] {
  const pts = new Array<number>(468 * 3).fill(0);
  const set = (idx: number, x: number, y: number, z: number) => {
    pts[idx * 3] = x;
    pts[idx * 3 + 1] = y;
    pts[idx * 3 + 2] = z;
  };
  set(33, 0.2, 0.4, 0.1); // leftEyeOuter
  set(133, 0.4, 0.4, 0.1); // leftEyeInner
  set(362, 0.6, 0.4, 0.1); // rightEyeInner
  set(263, 0.8, 0.4, 0.1); // rightEyeOuter
  set(168, 0.5, 0.45, 0.05); // noseBridge
  set(1, 0.5, 0.55, 0.2); // noseTip
  set(152, 0.5, 0.9, 0.05); // chin
  return pts;
}

const SAMPLE_FRAME: WechatFrameInput = {
  data: new ArrayBuffer(16),
  width: 2,
  height: 2,
};

describe("WechatFaceTracker", () => {
  it("degrades gracefully (detect returns null) when VK is unavailable", async () => {
    const env = new MockWechatEnvironment({ caps: { vk: false } });
    const tracker = new WechatFaceTracker({ environment: env });

    await expect(tracker.initialize()).resolves.toBeUndefined();
    expect(tracker.isDegraded()).toBe(true);
    expect(tracker.getDegradeReason()).toMatch(/VKSession/);

    const result = await tracker.detect(SAMPLE_FRAME);
    expect(result).toBeNull();
  });

  it("maps VK landmarks to a NormalizedFaceResult when VK is available", async () => {
    const vkSession = new MockVKSession({
      nextResult: {
        faces: [
          {
            points: buildFacePoints(),
            transform: IDENTITY_MATRIX,
            confidence: 0.9,
          },
        ],
      },
    });
    const env = new MockWechatEnvironment({ vkSession });
    const tracker = new WechatFaceTracker({ environment: env });

    await tracker.initialize();
    expect(tracker.isDegraded()).toBe(false);

    const result = await tracker.detect(SAMPLE_FRAME);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("wechat-vk");

    // Semantic mapping reuses the MediaPipe index map.
    expect(result!.landmarks.semantic.leftEyeOuter).toEqual({
      x: 0.2,
      y: 0.4,
      z: 0.1,
    });
    expect(result!.landmarks.semantic.rightEyeOuter).toEqual({
      x: 0.8,
      y: 0.4,
      z: 0.1,
    });
    // Eye centers are derived from the outer/inner corners.
    expect(result!.landmarks.semantic.leftEyeCenter).toBeDefined();
    expect(result!.landmarks.semantic.eyesCenter).toBeDefined();
    expect(result!.landmarks.semantic.eyesCenter!.x).toBeCloseTo(0.5);

    // Pose is decomposed from the identity transform matrix.
    expect(result!.pose.confidence).toBe(0.9);
    expect(result!.pose.matrix).toBe(IDENTITY_MATRIX);
    expect(result!.pose.yaw).toBeCloseTo(0);
    expect(result!.pose.pitch).toBeCloseTo(0);
    expect(result!.pose.roll).toBeCloseTo(0);

    expect(vkSession.detectCalls).toBe(1);
  });

  it("returns null when VK detects no faces", async () => {
    const vkSession = new MockVKSession({ nextResult: { faces: [] } });
    const env = new MockWechatEnvironment({ vkSession });
    const tracker = new WechatFaceTracker({ environment: env });

    await tracker.initialize();
    const result = await tracker.detect(SAMPLE_FRAME);
    expect(result).toBeNull();
  });

  it("returns null for non-WeChat frame shapes", async () => {
    const env = new MockWechatEnvironment();
    const tracker = new WechatFaceTracker({ environment: env });
    await tracker.initialize();

    const htmlFrame = { __brand: "HTMLVideoElement" as const, el: {} };
    const result = await tracker.detect(htmlFrame as FrameInput);
    expect(result).toBeNull();
    expect(env.vkSession.detectCalls).toBe(0);
  });

  it("returns null when detectFace throws", async () => {
    const env = new MockWechatEnvironment();
    env.vkSession.detectFace = () => {
      throw new Error("boom");
    };
    const tracker = new WechatFaceTracker({ environment: env });
    await tracker.initialize();

    const result = await tracker.detect(SAMPLE_FRAME);
    expect(result).toBeNull();
  });

  it("destroy destroys the VK session", async () => {
    const env = new MockWechatEnvironment();
    const tracker = new WechatFaceTracker({ environment: env });
    await tracker.initialize();
    tracker.destroy();
    expect(env.vkSession.destroyed).toBe(true);
  });
});
