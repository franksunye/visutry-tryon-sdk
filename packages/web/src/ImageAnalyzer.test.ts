import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedFaceResult } from "@visutry/tryon-core";
import { buildFaceResult, buildSemanticPoints } from "../../core/src/__fixtures__/faceFixtures.js";

const tracker = vi.hoisted(() => ({ detectImage: vi.fn(), destroy: vi.fn() }));
vi.mock("./tracker/MediaPipeFaceTracker.js", () => ({
  MediaPipeFaceTracker: vi.fn().mockImplementation(() => tracker),
}));

import { createVisuTryImageAnalyzer } from "./ImageAnalyzer.js";

function validFace(): NormalizedFaceResult {
  return { ...buildFaceResult(buildSemanticPoints("oval")), imageSize: { width: 1000, height: 1000 }, faceCount: 1 };
}

describe("image analysis validity and lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tracker.detectImage.mockResolvedValue(validFace());
  });

  it("passes the supplied image to detection and returns the shared analysis", async () => {
    const image = document.createElement("canvas");
    const analyzer = createVisuTryImageAnalyzer();
    const output = await analyzer.analyzeImage(image);
    expect(tracker.detectImage).toHaveBeenCalledWith(image);
    expect(output.status).toBe("accepted");
    expect(output.result.primary).not.toBe("unknown");
    expect(output.result.metrics.geometryValid).toBe(true);
    expect(output.result.version).toBe("0.3.0");
    expect(analyzer.getLastFaceResult()).toBe(output.face);
  });

  it("does not leave a confident shape on an observation that fails the quality gate", async () => {
    const face = validFace();
    face.quality.confidence = 0.1;
    tracker.detectImage.mockResolvedValue(face);
    const output = await createVisuTryImageAnalyzer().analyzeImage({});
    expect(output.status).toBe("rejected");
    expect(output.result).toMatchObject({ primary: "unknown", confidence: 0, candidates: [] });
    expect(output.result.warnings).toContain("LOW_CONFIDENCE");
  });

  it("rejects multiple people instead of silently analyzing the first face", async () => {
    const face = validFace();
    face.faceCount = 2;
    tracker.detectImage.mockResolvedValue(face);
    const output = await createVisuTryImageAnalyzer().analyzeImage({});
    expect(output.status).toBe("rejected");
    expect(output.result.primary).toBe("unknown");
    expect(output.result.warnings).toContain("MULTIPLE_FACES");
  });

  it("clears stale face data after no-face input and supports a subsequent retry", async () => {
    const analyzer = createVisuTryImageAnalyzer();
    await analyzer.analyzeImage({});
    tracker.detectImage.mockResolvedValueOnce(null);
    await expect(analyzer.analyzeImage({})).rejects.toMatchObject({ code: "FACE_NOT_DETECTED", recoverable: true });
    expect(analyzer.getLastFaceResult()).toBeNull();
    expect((await analyzer.analyzeImage({})).status).toBe("accepted");
  });

  it("rejects overlapping analyses without clearing the first result", async () => {
    let finish!: (face: NormalizedFaceResult) => void;
    tracker.detectImage.mockReturnValueOnce(new Promise<NormalizedFaceResult>((resolve) => { finish = resolve; }));
    const analyzer = createVisuTryImageAnalyzer();
    const first = analyzer.analyzeImage({});
    await expect(analyzer.analyzeImage({})).rejects.toMatchObject({ code: "ANALYSIS_IN_PROGRESS" });
    finish(validFace());
    expect((await first).status).toBe("accepted");
    expect(tracker.detectImage).toHaveBeenCalledTimes(1);
  });

  it("does not expose a late detection after destroy and closes only once", async () => {
    let finish!: (face: NormalizedFaceResult) => void;
    tracker.detectImage.mockReturnValueOnce(new Promise<NormalizedFaceResult>((resolve) => { finish = resolve; }));
    const analyzer = createVisuTryImageAnalyzer();
    const result = analyzer.analyzeImage({});
    analyzer.destroy();
    analyzer.destroy();
    finish(validFace());
    await expect(result).rejects.toMatchObject({ message: "Image analyzer has been destroyed" });
    expect(analyzer.getLastFaceResult()).toBeNull();
    expect(tracker.destroy).toHaveBeenCalledTimes(1);
    await expect(analyzer.analyzeImage({})).rejects.toMatchObject({ message: "Image analyzer has been destroyed" });
  });
});
