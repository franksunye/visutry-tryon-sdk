import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { GlassesAssetManifest, GlassesPose } from "@visutry/tryon-core";

// ---------------------------------------------------------------------------
// Mock three module
// ---------------------------------------------------------------------------

const mockGeometry = { dispose: vi.fn() };
const mockMaterial = { dispose: vi.fn() };
const mockMesh = { geometry: mockGeometry, material: mockMaterial, traverse: vi.fn() };
const mockGltfScene = {
  scale: { multiplyScalar: vi.fn() },
  rotation: { set: vi.fn() },
  traverse: vi.fn((cb: (o: any) => void) => {
    cb(mockMesh);
  }),
};
const mockGroup = {
  add: vi.fn(),
  remove: vi.fn(),
  visible: true,
  position: { set: vi.fn() },
  rotation: { set: vi.fn() },
  scale: { setScalar: vi.fn() },
  traverse: vi.fn((cb: (o: any) => void) => cb(mockMesh)),
};

const mockCamera = {
  position: { set: vi.fn() },
  lookAt: vi.fn(),
};

const mockScene = { add: vi.fn(), remove: vi.fn() };

const mockRenderer = {
  setPixelRatio: vi.fn(),
  setSize: vi.fn(),
  setClearColor: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  domElement: {
    toDataURL: vi.fn(() => "data:image/png;base64,xxx"),
  },
};

vi.mock("three", () => ({
  WebGLRenderer: vi.fn(() => mockRenderer),
  Scene: vi.fn(() => mockScene),
  OrthographicCamera: vi.fn(() => mockCamera),
  AmbientLight: vi.fn(() => ({})),
  DirectionalLight: vi.fn(() => ({ position: { set: vi.fn() } })),
  Group: vi.fn(() => mockGroup),
  Object3D: class {},
}));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: vi.fn(() => ({
    loadAsync: vi.fn().mockResolvedValue({ scene: mockGltfScene }),
  })),
}));

// Import after mocks
import { ThreeJsRenderer } from "./ThreeJsRenderer.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeManifest(overrides: Partial<GlassesAssetManifest> = {}): GlassesAssetManifest {
  return {
    id: "test-glasses",
    name: "Test Glasses",
    modelUrl: "https://example.com/glasses.glb",
    format: "glb",
    coordinateSystem: {
      unit: "millimeter",
      forwardAxis: "+z",
      upAxis: "+y",
    },
    dimensions: {
      frameWidthMm: 140,
      lensWidthMm: 50,
      lensHeightMm: 40,
      bridgeWidthMm: 20,
      templeLengthMm: 140,
    },
    anchors: {
      origin: { x: 0, y: 0, z: 0 },
      noseBridge: { x: 0, y: 0, z: 0 },
      leftHinge: { x: -70, y: 0, z: 0 },
      rightHinge: { x: 70, y: 0, z: 0 },
    },
    fitting: {
      defaultScale: 1,
      defaultOffset: { x: 0, y: 0, z: 0 },
      defaultRotation: { x: 0, y: 0, z: 0 },
      minScale: 0.2,
      maxScale: 3,
    },
    material: {
      lensOpacity: 0.5,
      frameRoughness: 0.4,
      supportsTransparency: true,
    },
    ...overrides,
  };
}

describe("ThreeJsRenderer", () => {
  let renderer: ThreeJsRenderer;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    renderer = new ThreeJsRenderer();
  });

  afterEach(() => {
    renderer.dispose();
    vi.restoreAllMocks();
  });

  it("initializes with a canvas element", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    expect(renderer.currentGlassesAsset).toBeNull();
  });

  it("initializes with a selector string", async () => {
    canvas.id = "test-canvas";
    document.body.appendChild(canvas);
    await renderer.initialize("#test-canvas", { width: 640, height: 480 });
    document.body.removeChild(canvas);
  });

  it("initializes with branded canvas target", async () => {
    const target = { __brand: "HTMLCanvasElement", el: canvas } as any;
    await renderer.initialize(target, { width: 320, height: 240 });
  });

  it("throws RENDERER_INIT_FAILED when no canvas is provided", async () => {
    await expect(renderer.initialize({} as any)).rejects.toMatchObject({
      code: "RENDERER_INIT_FAILED",
    });
  });

  it("throws GLASSES_LOAD_FAILED when not initialized", async () => {
    await expect(renderer.loadGlasses(makeManifest())).rejects.toMatchObject({
      code: "RENDERER_INIT_FAILED",
    });
  });

  it("loads glasses model", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    const manifest = makeManifest();
    await renderer.loadGlasses(manifest);
    expect(renderer.currentGlassesAsset).toEqual(manifest);
    expect(mockGltfScene.scale.multiplyScalar).toHaveBeenCalledWith(0.005); // mm → render world
    expect(mockGltfScene.rotation.set).not.toHaveBeenCalled(); // solver applies fitting rotation
    expect(mockScene.add).toHaveBeenCalled();
  });

  it("loads glasses with cm unit normalization", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    const manifest = makeManifest({
      coordinateSystem: { unit: "centimeter", forwardAxis: "+z", upAxis: "+y" },
    });
    await renderer.loadGlasses(manifest);
    expect(mockGltfScene.scale.multiplyScalar).toHaveBeenCalledWith(0.05); // cm → render world
  });

  it("loads glasses with meter unit normalization", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    const manifest = makeManifest({
      coordinateSystem: { unit: "meter", forwardAxis: "+z", upAxis: "+y" },
    });
    await renderer.loadGlasses(manifest);
    expect(mockGltfScene.scale.multiplyScalar).toHaveBeenCalledWith(5); // m → render world
  });

  it("applies pose to glasses group", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    await renderer.loadGlasses(makeManifest());

    const pose: GlassesPose = {
      position: { x: 0.1, y: 0.2, z: 0.3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3 },
      scale: { x: 2, y: 2, z: 2 },
      visible: true,
      confidence: 0.9,
    };
    renderer.applyPose(pose);
    expect(mockGroup.visible).toBe(true);
    expect(mockGroup.position.set).toHaveBeenCalledWith(0.1, 0.2, 0.3);
    expect(mockGroup.rotation.set).toHaveBeenCalledWith(0.1, 0.2, 0.3);
    expect(mockGroup.scale.setScalar).toHaveBeenCalledWith(2);
  });

  it("hides glasses when pose.visible=false", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    await renderer.loadGlasses(makeManifest());

    const pose: GlassesPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: false,
      confidence: 0,
    };
    renderer.applyPose(pose);
    expect(mockGroup.visible).toBe(false);
  });

  it("setVisible toggles glasses visibility", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    await renderer.loadGlasses(makeManifest());
    renderer.setVisible(false);
    expect(mockGroup.visible).toBe(false);
    renderer.setVisible(true);
    expect(mockGroup.visible).toBe(true);
  });

  it("renderFrame renders the scene", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    renderer.renderFrame();
    expect(mockRenderer.render).toHaveBeenCalled();
  });

  it("renderFrame is a no-op when not initialized", () => {
    renderer.renderFrame();
    expect(mockRenderer.render).not.toHaveBeenCalled();
  });

  it("captures a snapshot", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    const result = await renderer.snapshot({ format: "image/png" });
    expect(result.dataUrl).toBe("data:image/png;base64,xxx");
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("snapshot at custom resolution", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    const result = await renderer.snapshot({ width: 1280, height: 960 });
    expect(result.width).toBe(1280);
    expect(result.height).toBe(960);
  });

  it("restores the viewport when snapshot encoding fails", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    mockRenderer.domElement.toDataURL.mockImplementationOnce(() => { throw new Error("encode failed"); });
    await expect(renderer.snapshot({ width: 1280, height: 960 })).rejects.toThrow("encode failed");
    expect(mockRenderer.setSize).toHaveBeenLastCalledWith(640, 480, false);
  });

  it("copies the overlay immediately after rendering and restores its viewport", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    const drawImage = vi.fn();
    renderer.drawToCanvas({ drawImage } as unknown as CanvasRenderingContext2D, 1280, 960);
    expect(drawImage).toHaveBeenCalledWith(mockRenderer.domElement, 0, 0, 1280, 960);
    expect(mockRenderer.render.mock.invocationCallOrder.at(-1)).toBeLessThan(drawImage.mock.invocationCallOrder[0]);
    expect(mockRenderer.setSize).toHaveBeenLastCalledWith(640, 480, false);
  });

  it("rejects invalid export sizes without changing the viewport", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    mockRenderer.setSize.mockClear();
    await expect(renderer.snapshot({ width: 0 })).rejects.toMatchObject({ code: "SNAPSHOT_FAILED" });
    expect(mockRenderer.setSize).not.toHaveBeenCalled();
  });

  it("disposes a late parsed GLB after destroy without attaching it", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    let finish!: (value: { scene: typeof mockGltfScene }) => void;
    const loader = (renderer as any).gltfLoader;
    loader.loadAsync.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = renderer.loadGlasses(makeManifest());
    renderer.dispose();
    mockScene.add.mockClear();
    finish({ scene: mockGltfScene });
    await expect(pending).rejects.toMatchObject({ code: "GLASSES_LOAD_FAILED" });
    expect(mockScene.add).not.toHaveBeenCalled();
    expect(mockGeometry.dispose).toHaveBeenCalledTimes(1);
    expect(mockMaterial.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.currentGlassesAsset).toBeNull();
  });

  it("keeps the previous asset and GPU model when a replacement fails", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    const first = makeManifest();
    await renderer.loadGlasses(first);
    const loader = (renderer as any).gltfLoader;
    loader.loadAsync.mockRejectedValue(new Error("404"));
    vi.spyOn(renderer as any, "delay").mockResolvedValue(undefined);
    await expect(renderer.loadGlasses(makeManifest({ id: "missing" })))
      .rejects.toMatchObject({ code: "GLASSES_LOAD_FAILED" });
    expect(renderer.currentGlassesAsset).toBe(first);
    expect(mockScene.remove).not.toHaveBeenCalled();
    expect(mockGeometry.dispose).not.toHaveBeenCalled();
    expect(mockMaterial.dispose).not.toHaveBeenCalled();
  });

  it("throws SNAPSHOT_FAILED when not initialized", async () => {
    await expect(renderer.snapshot()).rejects.toMatchObject({
      code: "SNAPSHOT_FAILED",
    });
  });

  it("resizes the renderer", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    renderer.resize(320, 240);
    expect(mockRenderer.setSize).toHaveBeenCalledWith(320, 240, false);
  });

  it("resize is a no-op when not initialized", () => {
    renderer.resize(320, 240);
    expect(mockRenderer.setSize).not.toHaveBeenCalled();
  });

  it("dispose cleans up resources", async () => {
    await renderer.initialize(canvas, { width: 640, height: 480 });
    await renderer.loadGlasses(makeManifest());
    renderer.dispose();
    expect(mockRenderer.dispose).toHaveBeenCalled();
    expect(renderer.currentGlassesAsset).toBeNull();
  });

  it("dispose is safe to call when not initialized", () => {
    renderer.dispose();
    // Should not throw
  });
});
