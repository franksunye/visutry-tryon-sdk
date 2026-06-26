import { describe, it, expect } from "vitest";
import type { GlassesAssetManifest, GlassesPose } from "@visutry/tryon-core";
import { WechatRenderer } from "./WechatRenderer.js";
import {
  MockCanvas,
  MockWechatEnvironment,
} from "../__testutils__/wechatMock.js";

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

const POSE: GlassesPose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  visible: true,
  confidence: 1,
};

describe("WechatRenderer", () => {
  it("initialize / applyPose / resize / dispose do not throw", async () => {
    const env = new MockWechatEnvironment();
    const renderer = new WechatRenderer({ environment: env });

    await renderer.initialize({ type: "wechat" }, { width: 300, height: 400 });
    expect(renderer.getActiveType()).toBe("webgl");

    renderer.applyPose(POSE);
    renderer.setVisible(false);
    renderer.resize(320, 480);
    expect(env.canvas.width).toBe(320);
    expect(env.canvas.height).toBe(480);

    renderer.dispose();
    expect(renderer.getActiveType()).toBeNull();
  });

  it("rejects initialize when offscreen canvas is unavailable", async () => {
    const env = new MockWechatEnvironment({ caps: { offscreen: false } });
    const renderer = new WechatRenderer({ environment: env });
    await expect(renderer.initialize({ type: "wechat" })).rejects.toMatchObject({
      code: "RENDERER_INIT_FAILED",
    });
  });

  it("loadGlasses requires initialization first", async () => {
    const env = new MockWechatEnvironment();
    const renderer = new WechatRenderer({ environment: env });

    await expect(renderer.loadGlasses(ASSET)).rejects.toMatchObject({
      code: "GLASSES_LOAD_FAILED",
    });

    await renderer.initialize({ type: "wechat" });
    await expect(renderer.loadGlasses(ASSET)).resolves.toBeUndefined();
    expect(renderer.hasAsset()).toBe(true);
  });

  it("snapshot uses wx.canvasToTempFilePath for a WebGL canvas", async () => {
    const env = new MockWechatEnvironment();
    const renderer = new WechatRenderer({ environment: env });
    await renderer.initialize({ type: "wechat" });

    const res = await renderer.snapshot({ format: "image/png" });
    expect(env.canvasToTempFilePathCalls).toBe(1);
    expect(res.dataUrl).toBe("wxfile://tmp/snapshot.png");
    expect(res.width).toBe(375);
    expect(res.timestamp).toBeGreaterThan(0);
  });

  it("snapshot uses canvas.toDataURL when available (2D canvas)", async () => {
    const canvas = new MockCanvas({
      toDataURL: "data:image/png;base64,AAAA",
      context2d: {},
    });
    const env = new MockWechatEnvironment({ canvas });
    const renderer = new WechatRenderer({ environment: env, canvasType: "2d" });

    await renderer.initialize({ type: "wechat" });
    expect(renderer.getActiveType()).toBe("2d");

    const res = await renderer.snapshot();
    expect(env.canvasToTempFilePathCalls).toBe(0);
    expect(res.dataUrl).toBe("data:image/png;base64,AAAA");
  });

  it("rejects snapshot when not initialized", async () => {
    const env = new MockWechatEnvironment();
    const renderer = new WechatRenderer({ environment: env });
    await expect(renderer.snapshot()).rejects.toMatchObject({
      code: "SNAPSHOT_FAILED",
    });
  });

  it("falls back to 2D when WebGL context is unavailable", async () => {
    const canvas = new MockCanvas({ webgl: null, context2d: {} });
    const env = new MockWechatEnvironment({ canvas });
    const renderer = new WechatRenderer({ environment: env });

    await renderer.initialize({ type: "wechat" });
    expect(renderer.getActiveType()).toBe("2d");
  });
});
