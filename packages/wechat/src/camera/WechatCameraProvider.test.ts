import { describe, it, expect } from "vitest";
import { WechatCameraProvider } from "./WechatCameraProvider.js";
import { MockWechatEnvironment } from "../__testutils__/wechatMock.js";
import { isWechatFrameInput } from "../types.js";

describe("WechatCameraProvider", () => {
  it("rejects initialize when the camera API is unavailable", async () => {
    const env = new MockWechatEnvironment({ caps: { camera: false } });
    const provider = new WechatCameraProvider({ environment: env });
    await expect(provider.initialize()).rejects.toMatchObject({
      code: "CAMERA_NOT_AVAILABLE",
    });
  });

  it("start/stop drive the mock camera context and cache frames", async () => {
    const env = new MockWechatEnvironment();
    const provider = new WechatCameraProvider({ environment: env });

    await provider.initialize({ mirror: true, facingMode: "user" });
    await provider.start();
    expect(env.cameraContext.startCalls).toBe(1);

    // Simulate a frame arriving from the camera stream.
    const frame = { data: new ArrayBuffer(16), width: 2, height: 2 };
    env.cameraContext.emitFrame(frame);

    const current = provider.getCurrentFrame();
    expect(current).not.toBeNull();
    expect(current !== null && isWechatFrameInput(current)).toBe(true);
    if (current !== null && isWechatFrameInput(current)) {
      expect(current.width).toBe(2);
      expect(current.height).toBe(2);
      expect(current.mirror).toBe(true);
    }

    provider.stop();
    expect(env.cameraContext.stopCalls).toBe(1);
    expect(provider.getCurrentFrame()).toBeNull();
  });

  it("switchCamera toggles the configured facingMode", async () => {
    const env = new MockWechatEnvironment();
    const provider = new WechatCameraProvider({ environment: env });

    await provider.initialize({ facingMode: "user" });
    expect(provider.getConfig().facingMode).toBe("user");

    await provider.switchCamera();
    expect(provider.getConfig().facingMode).toBe("environment");

    await provider.switchCamera();
    expect(provider.getConfig().facingMode).toBe("user");
  });

  it("destroy clears the context and frames", async () => {
    const env = new MockWechatEnvironment();
    const provider = new WechatCameraProvider({ environment: env });

    await provider.initialize();
    await provider.start();
    env.cameraContext.emitFrame({ data: new ArrayBuffer(8), width: 1, height: 1 });

    provider.destroy();
    expect(provider.getCurrentFrame()).toBeNull();
  });

  it("start rejects when not initialized", async () => {
    const env = new MockWechatEnvironment();
    const provider = new WechatCameraProvider({ environment: env });
    await expect(provider.start()).rejects.toMatchObject({
      code: "CAMERA_NOT_AVAILABLE",
    });
  });
});
