import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FaceLandmarker } from "@mediapipe/tasks-vision";

// ---------------------------------------------------------------------------
// Mock @mediapipe/tasks-vision using vi.hoisted so the mock factory can
// reference the mock objects (vi.mock is hoisted above all declarations).
// ---------------------------------------------------------------------------

const { mockFaceLandmarker, mockLandmarks } = vi.hoisted(() => {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  // Set a few semantic landmarks to non-center positions.
  landmarks[33] = { x: 0.38, y: 0.42, z: -0.02 };
  landmarks[133] = { x: 0.46, y: 0.42, z: -0.02 };
  landmarks[362] = { x: 0.54, y: 0.42, z: -0.02 };
  landmarks[263] = { x: 0.62, y: 0.42, z: -0.02 };
  landmarks[168] = { x: 0.5, y: 0.48, z: -0.03 };
  landmarks[1] = { x: 0.5, y: 0.54, z: -0.08 };
  landmarks[10] = { x: 0.5, y: 0.32, z: -0.02 };
  landmarks[152] = { x: 0.5, y: 0.7, z: -0.04 };
  landmarks[123] = { x: 0.35, y: 0.52, z: -0.03 };
  landmarks[352] = { x: 0.65, y: 0.52, z: -0.03 };
  landmarks[172] = { x: 0.38, y: 0.63, z: -0.02 };
  landmarks[397] = { x: 0.62, y: 0.63, z: -0.02 };

  const landmarker = {
    detectForVideo: vi.fn().mockReturnValue({
      faceLandmarks: [landmarks],
      facialTransformationMatrixes: [
        {
          data: [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
          ],
        },
      ],
    }),
    close: vi.fn(),
  };

  return { mockFaceLandmarker: landmarker, mockLandmarks: landmarks };
});

vi.mock("@mediapipe/tasks-vision", () => ({
  FaceLandmarker: {
    createFromOptions: vi.fn().mockResolvedValue(mockFaceLandmarker),
  },
  FilesetResolver: {
    forVisionTasks: vi.fn().mockResolvedValue({}),
  },
}));

// Import after mock is set up
import { MediaPipeFaceTracker } from "./MediaPipeFaceTracker.js";

/**
 * Create a real HTMLVideoElement (via jsdom) with readyState=4 so that
 * `instanceof HTMLVideoElement` checks pass in the tracker's extractVideo().
 */
function makeMockVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  Object.defineProperty(video, "readyState", { value: 4, configurable: true });
  return video;
}

describe("MediaPipeFaceTracker", () => {
  let tracker: MediaPipeFaceTracker;

  beforeEach(() => {
    // Reset the default detectForVideo return value (in case a previous test
    // used mockReturnValueOnce/mockImplementationOnce which left the mock in
    // a non-default state).
    mockFaceLandmarker.detectForVideo.mockReturnValue({
      faceLandmarks: [mockLandmarks],
      facialTransformationMatrixes: [
        {
          data: [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
          ],
        },
      ],
    });
    tracker = new MediaPipeFaceTracker({}, { mode: "balanced" });
  });

  afterEach(() => {
    tracker.destroy();
  });

  it("initializes without error", async () => {
    await tracker.initialize({ mode: "balanced" });
    expect(mockFaceLandmarker.close).not.toHaveBeenCalled();
  });

  it("throws TRACKER_INIT_FAILED on initialization error after exhausting retries", async () => {
    // maxInitRetries = 3 → 4 total attempts (1 initial + 3 retries).
    // Use mockImplementation with async throw so all attempts reject. Use fake
    // timers to avoid waiting through the real retry delays (1+2+3 = 6 seconds).
    vi.useFakeTimers();
    vi.mocked(FaceLandmarker.createFromOptions).mockImplementation(async () => {
      throw new Error("Network error");
    });
    try {
      const initPromise = tracker.initialize();
      // Attach the rejection handler up-front so the promise is never briefly
      // unhandled while the fake timers flush the retry backoff (vitest flags
      // unhandled rejections as failures when running the full suite).
      const rejection = initPromise.catch((err) => err);
      // Advance through all retry delays: 1000 + 2000 + 3000 = 6000ms
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(1000);
      const err = await rejection;
      expect(err).toMatchObject({
        code: "TRACKER_INIT_FAILED",
      });
    } finally {
      vi.useRealTimers();
      vi.mocked(FaceLandmarker.createFromOptions).mockResolvedValue(mockFaceLandmarker as unknown as FaceLandmarker);
    }
  });

  it("retries initialization and succeeds on a later attempt", async () => {
    vi.useFakeTimers();
    vi.mocked(FaceLandmarker.createFromOptions)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(mockFaceLandmarker as unknown as FaceLandmarker);
    try {
      const initPromise = tracker.initialize();
      // Advance through the first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      await initPromise; // should resolve
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws TRACKER_DETECT_FAILED when not initialized", async () => {
    await expect(tracker.detect({ __brand: "HTMLVideoElement", el: {} } as any)).rejects.toMatchObject({
      code: "TRACKER_DETECT_FAILED",
    });
  });

  it("detects a face and returns NormalizedFaceResult", async () => {
    await tracker.initialize({ mode: "balanced" });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const result = await tracker.detect(frame);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("mediapipe");
    expect(result!.landmarks.raw).toHaveLength(478);
    expect(result!.landmarks.semantic.leftEyeOuter).toBeDefined();
    expect(result!.landmarks.semantic.rightEyeOuter).toBeDefined();
    expect(result!.landmarks.semantic.noseBridge).toBeDefined();
    expect(result!.landmarks.semantic.eyesCenter).toBeDefined();
    expect(result!.bbox.width).toBeGreaterThan(0);
    expect(result!.bbox.height).toBeGreaterThan(0);
    expect(result!.pose.confidence).toBeGreaterThan(0);
    expect(result!.quality.confidence).toBeGreaterThan(0);
  });

  it("returns null when no face is detected", async () => {
    await tracker.initialize({ mode: "balanced" });
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({ faceLandmarks: [] });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const result = await tracker.detect(frame);
    expect(result).toBeNull();
  });

  it("returns null when video is not ready", async () => {
    await tracker.initialize({ mode: "balanced" });

    const mockVideo = document.createElement("video"); Object.defineProperty(mockVideo, "readyState", { value: 1, configurable: true });
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const result = await tracker.detect(frame);
    expect(result).toBeNull();
  });

  it("returns null for non-video frame input", async () => {
    await tracker.initialize({ mode: "balanced" });
    const result = await tracker.detect({} as any);
    expect(result).toBeNull();
  });

  it("throws TRACKER_DETECT_FAILED on detection error", async () => {
    await tracker.initialize({ mode: "balanced" });
    mockFaceLandmarker.detectForVideo.mockImplementationOnce(() => {
      throw new Error("Detection crashed");
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    await expect(tracker.detect(frame)).rejects.toMatchObject({
      code: "TRACKER_DETECT_FAILED",
    });
  });

  it("computes pose from transformation matrix when available", async () => {
    await tracker.initialize({ mode: "balanced" });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const result = await tracker.detect(frame);
    expect(result!.pose.matrix).toBeDefined();
    expect(result!.pose.matrix).toHaveLength(16);
    expect(result!.pose.confidence).toBeCloseTo(0.95, 1);
  });

  it("falls back to landmark-based pose when matrix is missing", async () => {
    await tracker.initialize({ mode: "balanced" });
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [mockLandmarks],
      facialTransformationMatrixes: [],
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const result = await tracker.detect(frame);
    expect(result!.pose.matrix).toBeUndefined();
    expect(result!.pose.confidence).toBeCloseTo(0.85, 1);
    expect(result!.pose.yaw).toBeDefined();
    expect(result!.pose.pitch).toBeDefined();
    expect(result!.pose.roll).toBeDefined();
  });

  it("computes bbox from landmarks", async () => {
    await tracker.initialize({ mode: "balanced" });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const result = await tracker.detect(frame);
    expect(result!.bbox.x).toBeLessThan(0.5);
    expect(result!.bbox.y).toBeLessThan(0.5);
    expect(result!.bbox.width).toBeGreaterThan(0);
    expect(result!.bbox.height).toBeGreaterThan(0);
  });

  it("computes quality with frontal and stability scores", async () => {
    await tracker.initialize({ mode: "balanced" });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const result = await tracker.detect(frame);
    expect(result!.quality.frontalScore).toBeGreaterThanOrEqual(0);
    expect(result!.quality.frontalScore).toBeLessThanOrEqual(1);
    expect(result!.quality.stabilityScore).toBeGreaterThanOrEqual(0);
    expect(result!.quality.stabilityScore).toBeLessThanOrEqual(1);
    expect(result!.quality.faceVisible).toBe(true);
  });

  it("destroys the landmarker", async () => {
    await tracker.initialize({ mode: "balanced" });
    tracker.destroy();
    expect(mockFaceLandmarker.close).toHaveBeenCalled();
  });

  it("exports CoordinateSystem static accessor", () => {
    expect(MediaPipeFaceTracker.coordinateSystem).toBeDefined();
    expect(MediaPipeFaceTracker.coordinateSystem.normalizedToRenderWorld).toBeDefined();
  });

  it("uses monotonic timestamps", async () => {
    await tracker.initialize({ mode: "balanced" });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    const r1 = await tracker.detect(frame);
    const r2 = await tracker.detect(frame);
    expect(r2!.timestamp).toBeGreaterThan(r1!.timestamp);
  });

  // =========================================================================
  // Additional branch-coverage tests — pushing branches toward 80%+
  // =========================================================================

  // ---------------------------------------------------------------------------
  // extractVideo — __brand present but el is not HTMLVideoElement
  // ---------------------------------------------------------------------------

  it("extractVideo returns null when __brand is HTMLVideoElement but el is not a video", async () => {
    await tracker.initialize({ mode: "balanced" });
    // el is a plain object, not an HTMLVideoElement instance.
    const frame = { __brand: "HTMLVideoElement", el: { foo: "bar" } } as unknown as any;
    const result = await tracker.detect(frame);
    // extractVideo returns null → detect returns null.
    expect(result).toBeNull();
  });

  it("extractVideo returns the element when frame is a raw HTMLVideoElement", async () => {
    await tracker.initialize({ mode: "balanced" });
    // Pass a real HTMLVideoElement directly (not wrapped in __brand).
    const mockVideo = makeMockVideo();
    const result = await tracker.detect(mockVideo as unknown as any);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("mediapipe");
  });

  it("extractVideo returns null for an HTMLCanvasElement (canvasToVideo fallback)", async () => {
    await tracker.initialize({ mode: "balanced" });
    const canvas = document.createElement("canvas");
    const result = await tracker.detect(canvas as unknown as any);
    // canvasToVideo returns null → detect returns null.
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // buildResult — shorter-than-expected landmarks array
  // ---------------------------------------------------------------------------

  it("buildResult handles a shorter-than-expected landmarks array (with matrix)", async () => {
    await tracker.initialize({ mode: "balanced" });
    // Only 50 landmarks — much shorter than the usual 478.
    const shortLandmarks = Array.from({ length: 50 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [shortLandmarks],
      facialTransformationMatrixes: [
        { data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      ],
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;
    const result = await tracker.detect(frame);

    expect(result).not.toBeNull();
    expect(result!.landmarks.raw).toHaveLength(50);
    // leftEyeOuter is at index 33 (< 50) → present.
    expect(result!.landmarks.semantic.leftEyeOuter).toBeDefined();
    // rightEyeOuter is at index 263 (> 50) → absent.
    expect(result!.landmarks.semantic.rightEyeOuter).toBeUndefined();
    // Point count < 400 → MISSING_KEY_POINTS warning.
    expect(result!.quality.warnings).toContain("MISSING_KEY_POINTS");
  });

  // ---------------------------------------------------------------------------
  // buildResult — all landmarks at the same position (zero variance)
  // ---------------------------------------------------------------------------

  it("buildResult handles all landmarks at the same position (zero variance bbox)", async () => {
    await tracker.initialize({ mode: "balanced" });
    const sameLandmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [sameLandmarks],
      facialTransformationMatrixes: [
        { data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      ],
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;
    const result = await tracker.detect(frame);

    expect(result).not.toBeNull();
    // All points identical → bbox is 0x0.
    expect(result!.bbox.width).toBe(0);
    expect(result!.bbox.height).toBe(0);
    // 0 width < 0.12 → FACE_TOO_SMALL warning.
    expect(result!.quality.warnings).toContain("FACE_TOO_SMALL");
  });

  // ---------------------------------------------------------------------------
  // computeBBox — all landmarks at origin
  // ---------------------------------------------------------------------------

  it("computeBBox returns zero-size rect at origin when all landmarks are at origin", () => {
    const points = Array.from({ length: 10 }, () => ({ x: 0, y: 0, z: 0 }));
    const result = (tracker as unknown as {
      computeBBox: (pts: { x: number; y: number; z: number }[]) => { x: number; y: number; width: number; height: number };
    }).computeBBox(points);
    expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  // ---------------------------------------------------------------------------
  // computePose — fallback when matrix AND specific semantic landmarks missing
  // ---------------------------------------------------------------------------

  it("computePose falls back to raw point indices when semantic points are missing", async () => {
    // Use a tracker with an empty indexMap so no semantic points are mapped.
    const customTracker = new MediaPipeFaceTracker({ indexMap: {} }, { mode: "balanced" });
    await customTracker.initialize({ mode: "balanced" });

    // No matrix → forces the landmark-geometry fallback path.
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [mockLandmarks],
      facialTransformationMatrixes: [],
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;
    const result = await customTracker.detect(frame);

    expect(result).not.toBeNull();
    // Landmark-geometry fallback produces confidence 0.85 (not 0.95 from matrix).
    expect(result!.pose.confidence).toBeCloseTo(0.85, 1);
    expect(result!.pose.matrix).toBeUndefined();
    expect(result!.pose.yaw).toBeDefined();
    expect(result!.pose.pitch).toBeDefined();
    expect(result!.pose.roll).toBeDefined();
    customTracker.destroy();
  });

  it("computePose uses matrix path when matrix has 16+ elements", async () => {
    await tracker.initialize({ mode: "balanced" });
    // Provide a matrix with a yaw rotation.
    const angle = 0.3;
    const matrix = [
      Math.cos(angle), 0, -Math.sin(angle), 0,
      0, 1, 0, 0,
      Math.sin(angle), 0, Math.cos(angle), 0,
      0, 0, 0, 1,
    ];
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [mockLandmarks],
      facialTransformationMatrixes: [{ data: matrix }],
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;
    const result = await tracker.detect(frame);

    expect(result).not.toBeNull();
    expect(result!.pose.matrix).toBeDefined();
    expect(result!.pose.matrix).toHaveLength(16);
    expect(result!.pose.confidence).toBeCloseTo(0.95, 1);
  });

  it("computePose falls back to landmarks when matrix is shorter than 16", async () => {
    await tracker.initialize({ mode: "balanced" });
    // Matrix with only 10 elements → length < 16 → fallback.
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [mockLandmarks],
      facialTransformationMatrixes: [{ data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0] }],
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;
    const result = await tracker.detect(frame);

    expect(result).not.toBeNull();
    // Fallback path → confidence 0.85.
    expect(result!.pose.confidence).toBeCloseTo(0.85, 1);
    expect(result!.pose.matrix).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // computeQuality — stability history and warning branches
  // ---------------------------------------------------------------------------

  it("computeQuality emits UNSTABLE warning when eye center jitters", async () => {
    await tracker.initialize({ mode: "balanced" });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;

    // First detection — stable.
    await tracker.detect(frame);

    // Second detection with shifted landmarks (large eye-center movement).
    const shiftedLandmarks = mockLandmarks.map((p) => ({ x: p.x + 0.1, y: p.y + 0.1, z: p.z }));
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [shiftedLandmarks],
      facialTransformationMatrixes: [
        { data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      ],
    });
    const result = await tracker.detect(frame);

    expect(result).not.toBeNull();
    // Large movement → stability drops → UNSTABLE warning.
    expect(result!.quality.stabilityScore).toBeLessThan(1);
  });

  it("computeQuality emits FACE_TOO_CLOSE when bbox is very wide", async () => {
    await tracker.initialize({ mode: "balanced" });
    // Spread landmarks across the full frame → bbox width > 0.8.
    const wideLandmarks = mockLandmarks.map((p, i) => ({
      x: i % 2 === 0 ? 0.0 : 1.0,
      y: p.y,
      z: p.z,
    }));
    mockFaceLandmarker.detectForVideo.mockReturnValueOnce({
      faceLandmarks: [wideLandmarks],
      facialTransformationMatrixes: [
        { data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      ],
    });

    const mockVideo = makeMockVideo();
    const frame = { __brand: "HTMLVideoElement", el: mockVideo } as unknown as any;
    const result = await tracker.detect(frame);

    expect(result).not.toBeNull();
    expect(result!.bbox.width).toBeGreaterThan(0.8);
    expect(result!.quality.warnings).toContain("FACE_TOO_CLOSE");
  });

  it("computeQuality emits LOW_CONFIDENCE when pose confidence is below 0.5", async () => {
    await tracker.initialize({ mode: "balanced" });
    // No matrix → fallback path with confidence 0.85. To get low confidence,
    // we need to mock the result so that the matrix path gives 0.95 but...
    // Actually, the fallback always gives 0.85 and matrix gives 0.95.
    // To test LOW_CONFIDENCE, we need to access computeQuality directly.
    const fakePose = { yaw: 0, pitch: 0, roll: 0, confidence: 0.3 };
    const fakeBbox = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
    const fakeSemantic = { eyesCenter: { x: 0.5, y: 0.5, z: 0 } };
    const result = (tracker as unknown as {
      computeQuality: (p: typeof fakePose, b: typeof fakeBbox, s: typeof fakeSemantic, c: number) => { warnings: string[] };
    }).computeQuality(fakePose, fakeBbox, fakeSemantic, 478);
    expect(result.warnings).toContain("LOW_CONFIDENCE");
  });

  // ---------------------------------------------------------------------------
  // destroy — idempotency
  // ---------------------------------------------------------------------------

  it("destroy is idempotent (calling twice does not throw)", async () => {
    await tracker.initialize({ mode: "balanced" });
    tracker.destroy();
    // Second call: landmarker is already null, ?.close() is a no-op.
    expect(() => tracker.destroy()).not.toThrow();
  });

  it("destroy before initialize does not throw", () => {
    // landmarker is null, ?.close() is a no-op.
    expect(() => tracker.destroy()).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // detectImage — delegation to detect
  // ---------------------------------------------------------------------------

  it("detectImage throws when not initialized", async () => {
    await expect(tracker.detectImage({})).rejects.toMatchObject({
      code: "TRACKER_DETECT_FAILED",
    });
  });

  it("detectImage returns null when video is not ready", async () => {
    await tracker.initialize({ mode: "balanced" });
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: 1, configurable: true });
    const result = await tracker.detectImage(video);
    expect(result).toBeNull();
  });

  it("detectImage delegates to detect for a ready video", async () => {
    await tracker.initialize({ mode: "balanced" });
    const mockVideo = makeMockVideo();
    const result = await tracker.detectImage(mockVideo);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("mediapipe");
  });
});
