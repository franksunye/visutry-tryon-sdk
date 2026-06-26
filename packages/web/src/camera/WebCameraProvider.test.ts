import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebCameraProvider } from "./WebCameraProvider.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeMockStream(): MediaStream {
  const track = { stop: vi.fn(), kind: "video" } as unknown as MediaStreamTrack;
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function makeMockVideo(): HTMLVideoElement {
  return {
    autoplay: false,
    playsInline: false,
    muted: false,
    srcObject: null as MediaStream | null,
    readyState: 4,
    play: vi.fn().mockResolvedValue(undefined),
  } as unknown as HTMLVideoElement;
}

/**
 * Override the private `video` field on a WebCameraProvider with a mock video
 * element. Uses `Object.defineProperty` with `writable: true` so that
 * `destroy()` can still set it to null.
 */
function injectMockVideo(provider: WebCameraProvider, video: HTMLVideoElement): void {
  Object.defineProperty(provider, "video", {
    value: video,
    writable: true,
    configurable: true,
  });
}

describe("WebCameraProvider", () => {
  let provider: WebCameraProvider;

  beforeEach(() => {
    provider = new WebCameraProvider();
  });

  afterEach(() => {
    provider.destroy();
  });

  it("creates a video element on initialize", async () => {
    await provider.initialize({ width: 640, height: 480 });
    expect(provider.videoElement).not.toBeNull();
    expect(provider.videoElement!.autoplay).toBe(true);
    expect(provider.videoElement!.playsInline).toBe(true);
    expect(provider.videoElement!.muted).toBe(true);
  });

  it("reports isRunning=false before start", () => {
    expect(provider.isRunning).toBe(false);
  });

  it("starts the camera and reports isRunning=true", async () => {
    await provider.initialize();
    const mockStream = makeMockStream();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      configurable: true,
    });

    await provider.start();
    expect(provider.isRunning).toBe(true);
    expect(mockVideo.srcObject).toBe(mockStream);
    expect(mockVideo.play).toHaveBeenCalled();
  });

  it("returns null from getCurrentFrame before start", async () => {
    await provider.initialize();
    expect(provider.getCurrentFrame()).toBeNull();
  });

  it("returns a frame after start", async () => {
    await provider.initialize();
    const mockStream = makeMockStream();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      configurable: true,
    });

    await provider.start();
    const frame = provider.getCurrentFrame();
    expect(frame).not.toBeNull();
    const f = frame as unknown as { __brand: string; el: unknown };
    expect(f.__brand).toBe("HTMLVideoElement");
    expect(f.el).toBe(mockVideo);
  });

  it("stops the camera and clears the stream", async () => {
    await provider.initialize();
    const mockStream = makeMockStream();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      configurable: true,
    });

    await provider.start();
    provider.stop();
    expect(provider.isRunning).toBe(false);
    expect(mockVideo.srcObject).toBeNull();
  });

  it("throws CAMERA_PERMISSION_DENIED on NotAllowedError", async () => {
    await provider.initialize();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    const domErr = new DOMException("Permission denied", "NotAllowedError");
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(domErr) },
      configurable: true,
    });

    await expect(provider.start()).rejects.toMatchObject({
      code: "CAMERA_PERMISSION_DENIED",
    });
  });

  it("throws CAMERA_NOT_AVAILABLE on NotFoundError", async () => {
    await provider.initialize();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    const domErr = new DOMException("Not found", "NotFoundError");
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockRejectedValue(domErr) },
      configurable: true,
    });

    await expect(provider.start()).rejects.toMatchObject({
      code: "CAMERA_NOT_AVAILABLE",
    });
  });

  it("throws UNSUPPORTED_PLATFORM when getUserMedia is missing", async () => {
    await provider.initialize();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });

    await expect(provider.start()).rejects.toMatchObject({
      code: "UNSUPPORTED_PLATFORM",
    });
  });

  it("switchCamera toggles facingMode", async () => {
    await provider.initialize({ facingMode: "user" });
    const mockStream = makeMockStream();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      configurable: true,
    });

    await provider.start();
    await provider.switchCamera();
    expect(provider.isRunning).toBe(true);
  });

  it("destroy stops the camera and nulls the video", async () => {
    await provider.initialize();
    const mockStream = makeMockStream();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      configurable: true,
    });

    await provider.start();
    provider.destroy();
    expect(provider.videoElement).toBeNull();
  });

  it("defaults to mirror=true", async () => {
    await provider.initialize();
    expect(provider.mirror).toBe(true);
  });

  it("respects custom mirror config", async () => {
    await provider.initialize({ mirror: false });
    expect(provider.mirror).toBe(false);
  });

  it("start is idempotent", async () => {
    await provider.initialize();
    const mockStream = makeMockStream();
    const mockVideo = makeMockVideo();
    injectMockVideo(provider, mockVideo);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      configurable: true,
    });

    await provider.start();
    await provider.start(); // should not throw or re-acquire stream
    expect(provider.isRunning).toBe(true);
  });
});
