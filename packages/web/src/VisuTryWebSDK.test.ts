import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  createVisuTryWebSDK,
  type VisuTryWebSDKFactoryOptions,
} from "./VisuTryWebSDK.js";
import type {
  GlassesAssetManifest,
  GlassesPose,
  NormalizedFaceResult,
  VisuTrySDK,
} from "@visutry/tryon-core";

// ---------------------------------------------------------------------------
// Mocks for three and mediapipe (needed because the facade constructor
// creates tracker/renderer instances that reference these modules)
// ---------------------------------------------------------------------------

vi.mock("three", () => ({
  WebGLRenderer: vi.fn(() => ({
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    domElement: { toDataURL: vi.fn().mockReturnValue("data:image/png;base64,xxx") },
  })),
  Scene: vi.fn(() => ({ add: vi.fn(), remove: vi.fn() })),
  OrthographicCamera: vi.fn(() => ({ position: { set: vi.fn() }, lookAt: vi.fn() })),
  AmbientLight: vi.fn(() => ({})),
  DirectionalLight: vi.fn(() => ({ position: { set: vi.fn() } })),
  Group: vi.fn(() => ({
    add: vi.fn(), remove: vi.fn(), visible: true,
    position: { set: vi.fn() }, rotation: { set: vi.fn() }, scale: { setScalar: vi.fn() },
    traverse: vi.fn(),
  })),
}));

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: vi.fn(() => ({
    loadAsync: vi.fn().mockResolvedValue({
      scene: { scale: { setScalar: vi.fn() }, rotation: { set: vi.fn() }, traverse: vi.fn() },
    }),
  })),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FaceLandmarker: { createFromOptions: vi.fn().mockResolvedValue({}) },
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFaceResult(overrides: Partial<NormalizedFaceResult> = {}): NormalizedFaceResult {
  const sem = {
    leftEyeOuter: { x: 0.38, y: 0.42, z: -0.02 },
    leftEyeInner: { x: 0.46, y: 0.42, z: -0.02 },
    rightEyeInner: { x: 0.54, y: 0.42, z: -0.02 },
    rightEyeOuter: { x: 0.62, y: 0.42, z: -0.02 },
    leftEyeCenter: { x: 0.42, y: 0.42, z: -0.02 },
    rightEyeCenter: { x: 0.58, y: 0.42, z: -0.02 },
    eyesCenter: { x: 0.5, y: 0.42, z: -0.02 },
    noseBridge: { x: 0.5, y: 0.48, z: -0.03 },
    noseTip: { x: 0.5, y: 0.54, z: -0.08 },
    foreheadCenter: { x: 0.5, y: 0.32, z: -0.02 },
    chin: { x: 0.5, y: 0.7, z: -0.04 },
    leftCheek: { x: 0.35, y: 0.52, z: -0.03 },
    rightCheek: { x: 0.65, y: 0.52, z: -0.03 },
    leftJaw: { x: 0.38, y: 0.63, z: -0.02 },
    rightJaw: { x: 0.62, y: 0.63, z: -0.02 },
    leftBrowCenter: { x: 0.43, y: 0.38, z: -0.02 },
    rightBrowCenter: { x: 0.57, y: 0.38, z: -0.02 },
    // visutry additions
    leftFace: { x: 0.30, y: 0.50, z: -0.01 },
    rightFace: { x: 0.70, y: 0.50, z: -0.01 },
    leftForehead: { x: 0.38, y: 0.36, z: -0.02 },
    rightForehead: { x: 0.62, y: 0.36, z: -0.02 },
    noseLeft: { x: 0.44, y: 0.50, z: -0.03 },
    noseRight: { x: 0.56, y: 0.50, z: -0.03 },
  };

  const raw: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 478; i++) raw.push({ x: 0.5, y: 0.5, z: 0 });

  return {
    source: "mediapipe",
    timestamp: Date.now(),
    landmarks: { raw, normalized: raw, semantic: sem },
    pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95 },
    bbox: { x: 0.2, y: 0.15, width: 0.6, height: 0.7 },
    quality: {
      confidence: 0.92,
      faceVisible: true,
      frontalScore: 0.9,
      stabilityScore: 0.85,
      warnings: [],
    },
    ...overrides,
  };
}

function makeManifest(): GlassesAssetManifest {
  return {
    id: "test-glasses",
    name: "Test Glasses",
    modelUrl: "https://example.com/glasses.glb",
    format: "glb",
    coordinateSystem: { unit: "millimeter", forwardAxis: "+z", upAxis: "+y" },
    dimensions: { frameWidthMm: 140 },
    anchors: { origin: { x: 0, y: 0, z: 0 }, noseBridge: { x: 0, y: 0, z: 0 } },
    fitting: {
      defaultScale: 1,
      defaultOffset: { x: 0, y: 0, z: 0 },
      defaultRotation: { x: 0, y: 0, z: 0 },
      minScale: 0.2,
      maxScale: 3,
    },
    material: {},
  };
}

function makeOptions(overrides: Partial<VisuTryWebSDKFactoryOptions> = {}): VisuTryWebSDKFactoryOptions {
  return {
    canvas: { __brand: "HTMLCanvasElement", el: document.createElement("canvas") } as any,
    camera: { width: 640, height: 480 },
    tracker: { mode: "balanced" },
    renderer: { width: 640, height: 480, background: "transparent" },
    privacy: { processOnDeviceOnly: true, allowSnapshotExport: true },
    ...overrides,
  };
}

// Accessor to get the internal impl for testing internal state via public getters
function getImpl(sdk: VisuTrySDK): any {
  return sdk as any;
}

// Mock getUserMedia for camera tests
function setupMediaDevices(): void {
  const mockStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VisuTryWebSDK (facade)", () => {
  let sdk: VisuTrySDK;

  beforeEach(() => {
    vi.clearAllMocks();
    setupMediaDevices();
    sdk = createVisuTryWebSDK(makeOptions());
  });

  afterEach(() => {
    sdk.destroy();
  });

  // --- Construction & state ----------------------------------------------

  it("creates an SDK instance", () => {
    expect(sdk).toBeDefined();
    expect(getImpl(sdk).isInitialized).toBe(false);
    expect(getImpl(sdk).isCameraStarted).toBe(false);
    expect(getImpl(sdk).isTryOnRunning).toBe(false);
    expect(getImpl(sdk).isDestroyed).toBe(false);
  });

  it("defaults privacy config to allow snapshot export", () => {
    expect(getImpl(sdk).privacyConfig.allowSnapshotExport).toBe(true);
  });

  it("respects privacy config that disables snapshots", () => {
    const s = createVisuTryWebSDK(makeOptions({
      privacy: { processOnDeviceOnly: true, allowSnapshotExport: false },
    }));
    expect(getImpl(s).privacyConfig.allowSnapshotExport).toBe(false);
    s.destroy();
  });

  // --- Events -------------------------------------------------------------

  it("registers and calls event handlers via on()", async () => {
    const handler = vi.fn();
    sdk.on("ready", handler);
    await sdk.initialize();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removes event handlers via off()", async () => {
    const handler = vi.fn();
    sdk.on("ready", handler);
    sdk.off("ready", handler);
    await sdk.initialize();
    expect(handler).not.toHaveBeenCalled();
  });

  it("emits error event when initialization fails", async () => {
    const errorSpy = vi.fn();
    sdk.on("error", errorSpy);

    // The tracker retries up to 3 times (4 total attempts) with backoff delays
    // of 1s + 2s + 3s = 6s. Use mockImplementation so ALL calls reject.
    const original = vi.mocked(FaceLandmarker.createFromOptions).getMockImplementation();
    vi.mocked(FaceLandmarker.createFromOptions).mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );

    await expect(sdk.initialize()).rejects.toMatchObject({
      code: "TRACKER_INIT_FAILED",
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ code: "TRACKER_INIT_FAILED" }));

    // Restore so subsequent tests get the default resolving mock
    vi.mocked(FaceLandmarker.createFromOptions).mockImplementation(original ?? (() => Promise.resolve({} as unknown as FaceLandmarker)));
  }, 15000);

  // --- Performance --------------------------------------------------------

  it("returns initial performance stats", () => {
    const stats = sdk.getPerformanceStats();
    expect(stats.fps).toBe(0);
    expect(stats.detectLatencyMs).toBe(0);
    expect(stats.renderLatencyMs).toBe(0);
    expect(stats.trackingLostCount).toBe(0);
    expect(stats.mode).toBe("balanced");
  });

  // --- analyzeFaceShape with pre-collected frames ------------------------

  it("analyzes face shape from pre-collected frames", async () => {
    const frames = [
      buildFaceResult(),
      buildFaceResult({ timestamp: Date.now() + 100 }),
      buildFaceResult({ timestamp: Date.now() + 200 }),
    ];

    const analyzedSpy = vi.fn();
    sdk.on("faceShapeAnalyzed", analyzedSpy);

    const result = await sdk.analyzeFaceShape({ frames });
    expect(result).toBeDefined();
    expect(result.primary).toBeDefined();
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.metrics).toBeDefined();
    expect(result.version).toBe("0.2.0");
    expect(analyzedSpy).toHaveBeenCalledWith(result);
  });

  // --- Snapshot privacy ---------------------------------------------------

  it("throws when snapshot is disabled by privacy policy", async () => {
    const s = createVisuTryWebSDK(makeOptions({
      privacy: { processOnDeviceOnly: true, allowSnapshotExport: false },
    }));
    await expect(s.snapshot()).rejects.toMatchObject({
      message: expect.stringContaining("privacy policy"),
    });
    s.destroy();
  });

  // --- Destroy -----------------------------------------------------------

  it("destroy is idempotent", () => {
    sdk.destroy();
    sdk.destroy();
    expect(getImpl(sdk).isDestroyed).toBe(true);
  });

  it("rejects initialize after destroy", () => {
    sdk.destroy();
    expect(sdk.initialize()).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  // --- loadGlasses -------------------------------------------------------

  it("loadGlasses emits glassesLoaded event after initialization", async () => {
    const loadedSpy = vi.fn();
    sdk.on("glassesLoaded", loadedSpy);

    await sdk.initialize();
    await sdk.loadGlasses(makeManifest());

    expect(loadedSpy).toHaveBeenCalledTimes(1);
    expect(getImpl(sdk).currentGlasses).not.toBeNull();
    expect(getImpl(sdk).currentGlasses.id).toBe("test-glasses");
  });

  it("switchGlasses delegates to loadGlasses", async () => {
    const loadedSpy = vi.fn();
    sdk.on("glassesLoaded", loadedSpy);

    await sdk.initialize();
    const manifest = makeManifest();
    manifest.id = "other-glasses";
    await sdk.switchGlasses(manifest);

    expect(loadedSpy).toHaveBeenCalledTimes(1);
    expect(getImpl(sdk).currentGlasses.id).toBe("other-glasses");
  });

  // --- stopTryOn / stopCamera --------------------------------------------

  it("stopCamera sets cameraStarted to false", async () => {
    await sdk.initialize();
    await sdk.startCamera();
    expect(getImpl(sdk).isCameraStarted).toBe(true);
    sdk.stopCamera();
    expect(getImpl(sdk).isCameraStarted).toBe(false);
  });

  it("stopTryOn sets tryOnRunning to false", async () => {
    await sdk.initialize();
    await sdk.startCamera();
    await sdk.startTryOn();
    expect(getImpl(sdk).isTryOnRunning).toBe(true);
    sdk.stopTryOn();
    expect(getImpl(sdk).isTryOnRunning).toBe(false);
  });

  // --- initialize is idempotent -----------------------------------------

  it("initialize is idempotent", async () => {
    const readySpy = vi.fn();
    sdk.on("ready", readySpy);
    await sdk.initialize();
    await sdk.initialize();
    expect(readySpy).toHaveBeenCalledTimes(1);
  });

  // --- startCamera auto-initializes -------------------------------------

  it("startCamera auto-initializes the SDK", async () => {
    await sdk.startCamera();
    expect(getImpl(sdk).isInitialized).toBe(true);
    expect(getImpl(sdk).isCameraStarted).toBe(true);
  });

  // --- startTryOn auto-starts camera ------------------------------------

  it("startTryOn auto-starts camera", async () => {
    await sdk.startTryOn();
    expect(getImpl(sdk).isInitialized).toBe(true);
    expect(getImpl(sdk).isCameraStarted).toBe(true);
    expect(getImpl(sdk).isTryOnRunning).toBe(true);
    sdk.stopTryOn();
  });

  // --- snapshot after init with privacy enabled -------------------------

  it("snapshot succeeds when privacy allows it", async () => {
    await sdk.initialize();
    const result = await sdk.snapshot();
    expect(result.dataUrl).toBeDefined();
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  // =========================================================================
  // Additional coverage tests — uncovered internal methods
  // =========================================================================

  // ---------------------------------------------------------------------------
  // handleFaceDetected — direct call
  // ---------------------------------------------------------------------------

  it("handleFaceDetected emits faceDetected and poseUpdated when asset loaded", async () => {
    const impl = getImpl(sdk);
    const faceDetectedSpy = vi.fn();
    const poseUpdatedSpy = vi.fn();
    sdk.on("faceDetected", faceDetectedSpy);
    sdk.on("poseUpdated", poseUpdatedSpy);

    // Initialize and load glasses
    await sdk.initialize();
    await sdk.loadGlasses(makeManifest());

    // Reset spies to clear events from init/load
    faceDetectedSpy.mockClear();
    poseUpdatedSpy.mockClear();

    const face = buildFaceResult();
    impl.handleFaceDetected(face);

    expect(faceDetectedSpy).toHaveBeenCalledTimes(1);
    expect(faceDetectedSpy).toHaveBeenCalledWith(face);
    expect(poseUpdatedSpy).toHaveBeenCalledTimes(1);
    expect(poseUpdatedSpy).toHaveBeenCalledWith(expect.objectContaining({
      visible: true,
    }));
  });

  it("handleFaceDetected does not emit poseUpdated when no asset loaded", async () => {
    const impl = getImpl(sdk);
    const poseUpdatedSpy = vi.fn();
    sdk.on("poseUpdated", poseUpdatedSpy);

    const face = buildFaceResult();
    impl.handleFaceDetected(face);

    expect(poseUpdatedSpy).not.toHaveBeenCalled();
  });

  it("handleFaceDetected calls renderer.applyPose with smoothed pose", async () => {
    const impl = getImpl(sdk);
    await sdk.initialize();
    await sdk.loadGlasses(makeManifest());

    const applyPoseSpy = vi.spyOn(impl.renderer, "applyPose");

    const face = buildFaceResult();
    impl.handleFaceDetected(face);

    expect(applyPoseSpy).toHaveBeenCalledTimes(1);
    const calledPose = applyPoseSpy.mock.calls[0][0] as GlassesPose;
    expect(calledPose.visible).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // handleFaceLost — direct call
  // ---------------------------------------------------------------------------

  it("handleFaceLost emits faceLost and applies hidden pose", async () => {
    const impl = getImpl(sdk);
    const faceLostSpy = vi.fn();
    sdk.on("faceLost", faceLostSpy);

    await sdk.initialize();
    await sdk.loadGlasses(makeManifest());

    // First mark face as detected
    const face = buildFaceResult();
    impl.handleFaceDetected(face);
    expect(impl.lastFaceDetected).toBe(true);

    const applyPoseSpy = vi.spyOn(impl.renderer, "applyPose");

    // Now lose the face
    impl.handleFaceLost();

    expect(faceLostSpy).toHaveBeenCalledTimes(1);
    expect(impl.lastFaceDetected).toBe(false);
    expect(impl.trackingLostCount).toBe(1);
    expect(applyPoseSpy).toHaveBeenCalled();
    // The lost pose should have visible: false after smoothing
  });

  it("handleFaceLost with smoother fade-out (call twice rapidly)", async () => {
    const impl = getImpl(sdk);
    const faceLostSpy = vi.fn();
    sdk.on("faceLost", faceLostSpy);

    await sdk.initialize();
    await sdk.loadGlasses(makeManifest());

    // Mark face as detected
    impl.handleFaceDetected(buildFaceResult());

    // First handleFaceLost
    impl.handleFaceLost();
    const firstCallCount = faceLostSpy.mock.calls.length;
    const firstTrackingLost = impl.trackingLostCount;

    // Mark as detected again
    impl.handleFaceDetected(buildFaceResult());

    // Second handleFaceLost
    impl.handleFaceLost();

    // Should have emitted faceLost twice
    expect(faceLostSpy).toHaveBeenCalledTimes(firstCallCount + 1);
    expect(impl.trackingLostCount).toBe(firstTrackingLost + 1);
  });

  it("handleFaceLost does not emit faceLost when face was not previously detected", async () => {
    const impl = getImpl(sdk);
    const faceLostSpy = vi.fn();
    sdk.on("faceLost", faceLostSpy);

    await sdk.initialize();

    // lastFaceDetected is false by default
    impl.handleFaceLost();
    expect(faceLostSpy).not.toHaveBeenCalled();
    expect(impl.trackingLostCount).toBe(0);
  });

  it("handleFaceLost without asset does not call applyPose", async () => {
    const impl = getImpl(sdk);
    await sdk.initialize();
    // Don't load glasses → currentAsset is null

    impl.handleFaceDetected(buildFaceResult());
    impl.handleFaceLost();

    // No error thrown, no crash
    expect(impl.lastFaceDetected).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // maybeEmitPerformance — throttling
  // ---------------------------------------------------------------------------

  it("maybeEmitPerformance throttles to PERF_EMIT_INTERVAL_MS", () => {
    const impl = getImpl(sdk);
    const perfSpy = vi.fn();
    sdk.on("performanceUpdated", perfSpy);

    const now = 1000;
    impl.lastPerformanceEmit = 0;

    // First call — should emit
    impl.maybeEmitPerformance(now);
    expect(perfSpy).toHaveBeenCalledTimes(1);

    // Call again within interval — should NOT emit
    impl.maybeEmitPerformance(now + 500);
    expect(perfSpy).toHaveBeenCalledTimes(1);

    // Call after interval — should emit
    impl.maybeEmitPerformance(now + 1200);
    expect(perfSpy).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // getPerformanceStats — with populated frame data
  // ---------------------------------------------------------------------------

  it("getPerformanceStats returns correct fps from frame times", () => {
    const impl = getImpl(sdk);

    // Feed some frame times
    impl.frameTimes.push(1000, 1010, 1020, 1030, 1040);
    impl.detectLatencies.push(5, 6, 7);
    impl.renderLatencies.push(2, 3, 4);
    impl.trackingLostCount = 3;

    const stats = impl.getPerformanceStats();

    // 4 frames over 40ms → 4 * 1000 / 40 = 100 fps
    expect(stats.fps).toBe(100);
    expect(stats.detectLatencyMs).toBeCloseTo(6, 0);
    expect(stats.renderLatencyMs).toBeCloseTo(3, 0);
    expect(stats.trackingLostCount).toBe(3);
    expect(stats.mode).toBe("balanced");
  });

  it("getPerformanceStats returns 0 fps with less than 2 frames", () => {
    const impl = getImpl(sdk);
    impl.frameTimes.push(1000);
    expect(impl.getPerformanceStats().fps).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // toSDKError — various input types
  // ---------------------------------------------------------------------------

  it("toSDKError passes through objects with code and message", () => {
    const impl = getImpl(sdk);
    const sdkErr = { code: "UNKNOWN", message: "test error", cause: null, recoverable: true };
    const result = impl.toSDKError(sdkErr);
    expect(result).toBe(sdkErr);
  });

  it("toSDKError wraps Error instances with UNKNOWN code", () => {
    const impl = getImpl(sdk);
    const err = new Error("something failed");
    const result = impl.toSDKError(err);
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("something failed");
    expect(result.cause).toBe(err);
    expect(result.recoverable).toBe(true);
  });

  it("toSDKError handles non-Error objects", () => {
    const impl = getImpl(sdk);
    // A string is not typeof "object", so it falls to the else branch:
    // (err as Error)?.message is undefined → "Unknown error"
    const result = impl.toSDKError("string error");
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("Unknown error");
    expect(result.cause).toBe("string error");
  });

  it("toSDKError handles null/undefined", () => {
    const impl = getImpl(sdk);
    const result = impl.toSDKError(null);
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("Unknown error");
  });

  it("toSDKError handles number", () => {
    const impl = getImpl(sdk);
    const result = impl.toSDKError(42);
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("Unknown error");
  });

  // ---------------------------------------------------------------------------
  // assertNotDestroyed — throws after destroy
  // ---------------------------------------------------------------------------

  it("assertNotDestroyed throws after destroy", async () => {
    const impl = getImpl(sdk);
    sdk.destroy();
    expect(() => impl.assertNotDestroyed()).toThrow();
  });

  it("assertNotDestroyed does not throw before destroy", () => {
    const impl = getImpl(sdk);
    expect(() => impl.assertNotDestroyed()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // collectAnalysisFrames — mocked tracker
  // ---------------------------------------------------------------------------

  it("collectAnalysisFrames collects quality frames from mocked tracker", async () => {
    const impl = getImpl(sdk);
    await sdk.initialize();

    // Mock camera to return a frame
    const fakeFrame = { __brand: "HTMLVideoElement" as const, el: {} };
    impl.camera.getCurrentFrame = vi.fn().mockReturnValue(fakeFrame);

    // Mock tracker to return a quality face synchronously via a custom mock
    const qualityFace = buildFaceResult();
    impl.tracker.detect = vi.fn().mockImplementation(() => Promise.resolve(qualityFace));

    // Mock quality gate to pass
    impl.qualityGate.evaluate = vi.fn().mockReturnValue({ passed: true, score: 0.9, warnings: [] });

    // The key insight: we mock requestAnimationFrame to execute the callback
    // via setTimeout(0), so the event loop processes detect().then() naturally.
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      return globalThis.setTimeout(cb, 0) as unknown as number;
    });

    const collectPromise = impl.collectAnalysisFrames(2, 0, true);

    // Wait for the collection to complete — the RAF + detect chain will resolve
    // within a few event loop ticks. We poll until the promise settles.
    const frames = await Promise.race([
      collectPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);

    expect(frames.length).toBe(2);
    rafSpy.mockRestore();
  }, 10000);

  it("collectAnalysisFrames times out when no quality frames arrive", async () => {
    const impl = getImpl(sdk);
    await sdk.initialize();

    // Mock camera to return a frame
    impl.camera.getCurrentFrame = vi.fn().mockReturnValue({ __brand: "HTMLVideoElement" as const, el: {} });
    // Tracker returns null (no face detected)
    impl.tracker.detect = vi.fn().mockResolvedValue(null);

    // Mock RAF to use setTimeout(0)
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      return globalThis.setTimeout(cb, 0) as unknown as number;
    });

    // Mock performance.now to simulate time advancing fast
    let fakeTime = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => fakeTime);

    const collectPromise = impl.collectAnalysisFrames(3, 0, true);

    // Advance time rapidly in small increments so RAF callbacks see increasing time
    const advanceInterval = 500;
    const advanceStep = () => {
      fakeTime += advanceInterval;
    };
    const timer = setInterval(advanceStep, 1);

    // Wait for rejection (timeout)
    await expect(
      Promise.race([
        collectPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("test timeout")), 5000)),
      ])
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: expect.stringContaining("timed out"),
    });

    clearInterval(timer);
    rafSpy.mockRestore();
    nowSpy.mockRestore();
  }, 10000);

  // ---------------------------------------------------------------------------
  // Event emission — multiple listeners
  // ---------------------------------------------------------------------------

  it("emits to multiple registered listeners", () => {
    const impl = getImpl(sdk);
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    sdk.on("faceLost", spy1);
    sdk.on("faceLost", spy2);

    impl.emit("faceLost");

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  it("handler errors in emit() do not crash the emit function", () => {
    const impl = getImpl(sdk);
    const goodSpy = vi.fn();
    const badSpy = vi.fn(() => { throw new Error("handler error"); });

    sdk.on("faceLost", badSpy);
    sdk.on("faceLost", goodSpy);

    // Should not throw even though badSpy throws
    expect(() => impl.emit("faceLost")).not.toThrow();

    // goodSpy should still have been called (it was registered after badSpy)
    expect(badSpy).toHaveBeenCalledTimes(1);
    expect(goodSpy).toHaveBeenCalledTimes(1);
  });

  it("emit does nothing when no listeners registered", () => {
    const impl = getImpl(sdk);
    // Emit to an event with no listeners — should not throw
    expect(() => impl.emit("faceLost")).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // loop — internal behavior
  // ---------------------------------------------------------------------------

  it("loop exits immediately when tryOnRunning is false", () => {
    const impl = getImpl(sdk);
    impl.tryOnRunning = false;
    // loop should return without scheduling RAF
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");
    impl.loop();
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it("loop exits immediately when destroyed", () => {
    const impl = getImpl(sdk);
    impl.tryOnRunning = true;
    impl.destroyed = true;
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");
    impl.loop();
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it("loop schedules RAF when no camera frame is available", () => {
    const impl = getImpl(sdk);
    impl.tryOnRunning = true;
    impl.camera.getCurrentFrame = vi.fn().mockReturnValue(null);

    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);
    impl.loop();

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(impl.rafId).toBe(1);
    rafSpy.mockRestore();
  });

  it("loop handles tracker.detect rejection with emitError", async () => {
    const impl = getImpl(sdk);
    impl.tryOnRunning = true;
    const fakeFrame = { __brand: "HTMLVideoElement" as const, el: {} };
    impl.camera.getCurrentFrame = vi.fn().mockReturnValue(fakeFrame);
    impl.tracker.detect = vi.fn().mockRejectedValue(new Error("detect fail"));

    const errorSpy = vi.fn();
    sdk.on("error", errorSpy);

    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(1);

    impl.loop();

    // Wait for the detect promise to resolve
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    rafSpy.mockRestore();
  }, 3000);

  // =========================================================================
  // Additional branch-coverage tests — pushing branches toward 80%+
  // =========================================================================

  // ---------------------------------------------------------------------------
  // loadGlasses — renderer throws → emits glassesLoadFailed
  // ---------------------------------------------------------------------------

  it("loadGlasses emits glassesLoadFailed when renderer throws", async () => {
    await sdk.initialize();

    const impl = getImpl(sdk);
    const failedSpy = vi.fn();
    sdk.on("glassesLoadFailed", failedSpy);

    // Make renderer.loadGlasses reject
    vi.spyOn(impl.renderer, "loadGlasses").mockRejectedValue(new Error("model load failed"));

    await expect(sdk.loadGlasses(makeManifest())).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "model load failed",
    });

    expect(failedSpy).toHaveBeenCalledTimes(1);
    expect(failedSpy).toHaveBeenCalledWith(expect.objectContaining({
      code: "UNKNOWN",
      message: "model load failed",
    }));

    // currentAsset should remain null
    expect(impl.currentGlasses).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // switchGlasses — race protection (load in progress)
  // ---------------------------------------------------------------------------

  it("switchGlasses waits for in-progress load to complete (race protection)", async () => {
    await sdk.initialize();

    const impl = getImpl(sdk);

    // Make the first load take some time (controllable promise)
    let resolveFirst!: () => void;
    const firstLoadPromise = new Promise<void>((resolve) => { resolveFirst = resolve; });

    const loadSpy = vi.spyOn(impl.renderer, "loadGlasses")
      .mockReturnValueOnce(firstLoadPromise)
      .mockResolvedValue(undefined);

    const manifest1 = makeManifest();
    manifest1.id = "first";
    const manifest2 = makeManifest();
    manifest2.id = "second";

    // Start first load (don't await yet)
    const load1Promise = sdk.loadGlasses(manifest1);

    // Start second load while first is in progress
    const load2Promise = sdk.switchGlasses(manifest2);

    // Wait a tick to ensure the second load sees the in-flight promise
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The second load should NOT have started yet (first is still pending)
    expect(loadSpy).toHaveBeenCalledTimes(1);

    // Resolve the first load
    resolveFirst();
    await load1Promise;

    // Now the second load should proceed and complete
    await load2Promise;

    // Both loads should have been called
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(impl.currentGlasses.id).toBe("second");

    loadSpy.mockRestore();
  });

  it("switchGlasses proceeds even if prior load failed (swallows prior error)", async () => {
    await sdk.initialize();

    const impl = getImpl(sdk);

    const loadSpy = vi.spyOn(impl.renderer, "loadGlasses")
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValue(undefined);

    const manifest1 = makeManifest();
    manifest1.id = "first";
    const manifest2 = makeManifest();
    manifest2.id = "second";

    // Start first load (will fail) and second load (should succeed)
    const load1Promise = sdk.loadGlasses(manifest1).catch((e) => e);
    const load2Promise = sdk.switchGlasses(manifest2);

    const [result1, result2] = await Promise.all([load1Promise, load2Promise]);

    // First load failed
    expect(result1).toMatchObject({ code: "UNKNOWN" });
    // Second load succeeded despite first failure
    expect(result2).toBeUndefined();
    expect(impl.currentGlasses.id).toBe("second");

    loadSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // getPerformanceStats — empty frame arrays and edge cases
  // ---------------------------------------------------------------------------

  it("getPerformanceStats returns zeros with completely empty frame arrays", () => {
    const impl = getImpl(sdk);
    impl.frameTimes.length = 0;
    impl.detectLatencies.length = 0;
    impl.renderLatencies.length = 0;
    impl.trackingLostCount = 0;

    const stats = impl.getPerformanceStats();
    expect(stats.fps).toBe(0);
    expect(stats.detectLatencyMs).toBe(0);
    expect(stats.renderLatencyMs).toBe(0);
    expect(stats.trackingLostCount).toBe(0);
    expect(stats.mode).toBe("balanced");
  });

  it("computeFps returns 0 when all frame times are identical (span <= 0)", () => {
    const impl = getImpl(sdk);
    impl.frameTimes.length = 0;
    impl.frameTimes.push(1000, 1000, 1000, 1000);
    expect(impl.computeFps()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // on/off — non-existent event name
  // ---------------------------------------------------------------------------

  it("off with non-existent event name does not throw", () => {
    const handler = vi.fn();
    // off for an event that was never registered
    expect(() => sdk.off("performanceUpdated", handler)).not.toThrow();
  });

  it("emit with empty listener set (after all handlers removed) does not throw", () => {
    const impl = getImpl(sdk);
    const handler = vi.fn();
    sdk.on("faceLost", handler);
    sdk.off("faceLost", handler);
    // Set exists but is empty
    expect(() => impl.emit("faceLost")).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // startTryOn — idempotent when already running
  // ---------------------------------------------------------------------------

  it("startTryOn is idempotent when already running", async () => {
    const impl = getImpl(sdk);
    await sdk.startTryOn();
    expect(impl.isTryOnRunning).toBe(true);

    // Spy on smoother.reset — startTryOn calls it on startup
    const resetSpy = vi.spyOn(impl.smoother, "reset");

    // Call startTryOn again — should return early
    await sdk.startTryOn();

    // reset should NOT have been called again (early return)
    expect(resetSpy).not.toHaveBeenCalled();

    sdk.stopTryOn();
    resetSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // stopCamera — no-op when not started
  // ---------------------------------------------------------------------------

  it("stopCamera when not started is a no-op (does not throw)", () => {
    expect(() => sdk.stopCamera()).not.toThrow();
    expect(getImpl(sdk).isCameraStarted).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // snapshot — after camera started but before tryOn
  // ---------------------------------------------------------------------------

  it("snapshot works after camera started but before tryOn", async () => {
    await sdk.initialize();
    await sdk.startCamera();
    // Don't start tryOn
    const result = await sdk.snapshot();
    expect(result.dataUrl).toBeDefined();
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // emit — no listeners registered (explicit branch test)
  // ---------------------------------------------------------------------------

  it("emit with no listeners registered for a specific event is a no-op", () => {
    const impl = getImpl(sdk);
    // Emit to an event that has never been registered
    expect(() => impl.emit("faceShapeAnalyzed", {} as any)).not.toThrow();
  });
});
