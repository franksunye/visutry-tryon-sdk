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

  it("uses the supplied preview video as the tracking frame source", async () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "readyState", { value: 4 });
    vi.spyOn(video, "play").mockResolvedValue(undefined);
    const stream = makeMockStream();
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) }, configurable: true,
    });
    provider = new WebCameraProvider(video);
    await provider.initialize();
    await provider.start();
    expect(video.srcObject).toBe(stream);
    expect(provider.getCurrentFrame()).toMatchObject({ el: video });
    provider.destroy();
    expect(video.srcObject).toBeNull();
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
  });

  it("rejects an invalid preview selector before acquiring a camera", async () => {
    provider = new WebCameraProvider("#missing-preview");
    await expect(provider.initialize()).rejects.toMatchObject({ code: "CAMERA_NOT_AVAILABLE" });
  });

  it("releases the acquired stream when video playback fails", async () => {
    await provider.initialize();
    const stream = makeMockStream();
    const video = makeMockVideo();
    vi.mocked(video.play).mockRejectedValue(new DOMException("Playback denied", "NotAllowedError"));
    injectMockVideo(provider, video);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) }, configurable: true,
    });
    await expect(provider.start()).rejects.toMatchObject({ code: "CAMERA_PERMISSION_DENIED" });
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(provider.isRunning).toBe(false);
  });

  it("stops a late permission result after destroy without attaching it", async () => {
    await provider.initialize();
    const video = makeMockVideo();
    injectMockVideo(provider, video);
    let resolve!: (stream: MediaStream) => void;
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn(() => new Promise<MediaStream>((done) => { resolve = done; })) },
      configurable: true,
    });
    const pending = provider.start();
    provider.destroy();
    const stream = makeMockStream();
    resolve(stream);
    await expect(pending).rejects.toMatchObject({ code: "CAMERA_NOT_AVAILABLE" });
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(provider.isRunning).toBe(false);
  });

  it("shares a pending camera start instead of requesting two streams", async () => {
    await provider.initialize();
    injectMockVideo(provider, makeMockVideo());
    let resolve!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((done) => { resolve = done; }));
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const first = provider.start();
    const second = provider.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    resolve(makeMockStream());
    await Promise.all([first, second]);
    expect(provider.isRunning).toBe(true);
  });

  it("does not let an old cancelled request stop a newer stream", async () => {
    await provider.initialize();
    const video = makeMockVideo();
    injectMockVideo(provider, video);
    let resolveOld!: (stream: MediaStream) => void;
    const current = makeMockStream();
    const getUserMedia = vi.fn()
      .mockImplementationOnce(() => new Promise<MediaStream>((done) => { resolveOld = done; }))
      .mockResolvedValueOnce(current);
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const oldStart = provider.start();
    provider.stop();
    await provider.start();
    const oldStream = makeMockStream();
    resolveOld(oldStream);
    await expect(oldStart).rejects.toMatchObject({ code: "CAMERA_NOT_AVAILABLE" });
    expect(oldStream.getTracks()[0].stop).toHaveBeenCalled();
    expect(current.getTracks()[0].stop).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(current);
    expect(provider.isRunning).toBe(true);
  });
});
