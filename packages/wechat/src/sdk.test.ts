import { describe, it, expect } from "vitest";
import type { GlassesAssetManifest } from "@visutry/tryon-core";
import { createWechatSDK } from "./sdk.js";
import { MockWechatEnvironment } from "./__testutils__/wechatMock.js";

const ASSET: GlassesAssetManifest = {
  id: "g1",
  name: "Test Glasses",
  modelUrl: "https://example.com/g.glb",
  format: "glb",
  coordinateSystem: { unit: "millimeter", forwardAxis: "+z", upAxis: "+y" },
  dimensions: { frameWidthMm: 140 },
  anchors: {
    origin: { x: 0, y: 0, z: 0 },
    noseBridge: { x: 0, y: 0, z: 0 },
  },
  fitting: {
    defaultScale: 1,
    defaultOffset: { x: 0, y: 0, z: 0 },
    defaultRotation: { x: 0, y: 0, z: 0 },
  },
  material: {},
};

describe("createWechatSDK", () => {
  it("composes camera / tracker / renderer and runs the full lifecycle", async () => {
    const env = new MockWechatEnvironment();
    const sdk = createWechatSDK({
      environment: env,
      camera: { mirror: true, facingMode: "user" },
      renderer: { width: 300, height: 400 },
    });

    expect(sdk.camera).toBeDefined();
    expect(sdk.tracker).toBeDefined();
    expect(sdk.renderer).toBeDefined();

    await sdk.start();
    expect(env.cameraContext.startCalls).toBe(1);
    expect(sdk.tracker.isDegraded()).toBe(false);
    expect(sdk.renderer.getActiveType()).toBe("webgl");

    await sdk.loadGlasses(ASSET);
    expect(sdk.renderer.hasAsset()).toBe(true);

    const snap = await sdk.snapshot();
    expect(snap.dataUrl).toBe("wxfile://tmp/snapshot.png");
    expect(env.canvasToTempFilePathCalls).toBe(1);

    sdk.stop();
    sdk.destroy();
    // stop + destroy complete without throwing.
  });

  it("shares a single injected environment across all adapters", async () => {
    const env = new MockWechatEnvironment();
    const sdk = createWechatSDK({
      environment: env,
      camera: { facingMode: "user" },
      renderer: { width: 320, height: 240 },
    });

    await sdk.start();
    // Camera: the mock camera context was driven by start().
    expect(env.cameraContext.startCalls).toBe(1);
    // Tracker: VK session was created (not degraded) from the same env.
    expect(sdk.tracker.isDegraded()).toBe(false);
    // Renderer: the offscreen canvas was allocated with the requested size.
    expect(env.canvas.width).toBe(320);
    expect(env.canvas.height).toBe(240);
    sdk.destroy();
  });

  it("start surfaces a camera error when the API is unavailable", async () => {
    const env = new MockWechatEnvironment({ caps: { camera: false } });
    const sdk = createWechatSDK({ environment: env });
    await expect(sdk.start()).rejects.toMatchObject({
      code: "CAMERA_NOT_AVAILABLE",
    });
  });
});
