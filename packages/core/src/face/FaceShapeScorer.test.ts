import { describe, it, expect } from "vitest";
import {
  FaceShapeScorer,
  buildGeometrySignals,
  classifyFaceGeometry,
  classifyJawProfile,
  classifyUpperFaceProfile,
} from "./FaceShapeScorer.js";
import { FaceMetricsCalculator } from "./FaceMetricsCalculator.js";
import { computeGeometryQualityScore, getFaceGeometryAdvisories } from "./geometryQuality.js";
import type { FaceQualityWarning } from "../types/index.js";
import { buildFaceResult, buildSemanticPoints } from "../__fixtures__/faceFixtures.js";

describe("FaceShapeScorer", () => {
  const scorer = new FaceShapeScorer();

  it("produces a result with candidates and version", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const result = scorer.score(face);
    expect(result.candidates.length).toBe(7);
    expect(result.version).toBe("0.3.0");
    expect(result.metrics).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("ranks candidates by score descending", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const result = scorer.score(face);
    const scores = result.candidates.map((c) => c.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("identifies a round face as round", () => {
    const face = buildFaceResult(buildSemanticPoints("round"));
    const result = scorer.score(face);
    expect(result.candidates[0].shape).toBe("round");
  });

  it("identifies a square face as square", () => {
    const face = buildFaceResult(buildSemanticPoints("square"));
    const result = scorer.score(face);
    expect(result.candidates[0].shape).toBe("square");
  });

  it("identifies a heart face as heart", () => {
    const face = buildFaceResult(buildSemanticPoints("heart"));
    const result = scorer.score(face);
    expect(result.candidates[0].shape).toBe("heart");
  });

  it("identifies a diamond face as diamond", () => {
    const face = buildFaceResult(buildSemanticPoints("diamond"));
    const result = scorer.score(face);
    expect(result.candidates[0].shape).toBe("diamond");
  });

  it("identifies an oblong face as oblong", () => {
    const face = buildFaceResult(buildSemanticPoints("oblong"));
    const result = scorer.score(face);
    expect(result.candidates[0].shape).toBe("oblong");
  });

  it("returns unknown with LOW_CONFIDENCE when confidence is below threshold", () => {
    // Degraded quality → missing key points → unknown result.
    const sem = buildSemanticPoints("oval");
    delete sem.leftCheek;
    delete sem.rightCheek;
    delete sem.leftJaw;
    delete sem.rightJaw;
    delete sem.chin;
    delete sem.foreheadCenter;
    delete sem.leftFace;
    delete sem.rightFace;
    delete sem.leftForehead;
    delete sem.rightForehead;
    delete sem.noseLeft;
    delete sem.noseRight;
    const face = buildFaceResult(sem, {
      quality: { confidence: 0.3, faceVisible: true, frontalScore: 0.3, stabilityScore: 0.3, warnings: [] },
    });
    const result = scorer.score(face);
    expect(result.primary).toBe("unknown");
    expect(result.warnings).toContain("MISSING_KEY_POINTS");
  });

  it("scoreFromMetrics works with pre-aggregated metrics", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const first = scorer.score(face);
    const result = scorer.scoreFromMetrics(first.metrics, []);
    expect(result.candidates.length).toBe(7);
  });

  it("scoreFrames aggregates multiple frames", () => {
    const frames = Array.from({ length: 4 }, () => buildFaceResult(buildSemanticPoints("round")));
    const result = scorer.scoreFrames(frames);
    expect(result.candidates[0].shape).toBe("round");
  });

  it("returns unknown result for empty frames", () => {
    const result = scorer.scoreFrames([]);
    expect(result.primary).toBe("unknown");
    expect(result.warnings).toContain("LOW_CONFIDENCE");
  });

  it("candidates contain reasons strings", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const result = scorer.score(face);
    for (const c of result.candidates) {
      expect(c.reasons.length).toBeGreaterThan(0);
      expect(typeof c.reasons[0]).toBe("string");
    }
    expect(result.signals).toEqual(result.candidates[0].reasons);
  });

  it("uses the main application's tie order for equal raw scores", () => {
    const metrics = new FaceMetricsCalculator().compute(buildFaceResult(buildSemanticPoints("oval")));
    metrics.visutry = { ...metrics.visutry!, faceAspectRatio: 1.21, jawToCheekWidth: 0.85, foreheadToCheekWidth: 0.9 };
    const result = scorer.scoreFromMetrics(metrics);
    expect(result.primary).toBe("round");
    expect(result.candidates.slice(0, 2).map((candidate) => candidate.shape)).toEqual(["round", "oval"]);
    expect(classifyFaceGeometry(metrics.visutry).alternatives).toEqual(["oval"]);
  });

  it.each([
    [0.92, false],
    [0.920001, true],
  ])("uses strict >0.92 for the broad upper-face signal: %s", (ratio, broad) => {
    const metrics = new FaceMetricsCalculator().compute(buildFaceResult(buildSemanticPoints("oval")));
    const signals = buildGeometrySignals("oval", { ...metrics.visutry!, foreheadToCheekWidth: ratio as number });
    expect(signals[3]).toBe(broad
      ? "Forehead width is close to cheekbone width"
      : "Cheekbones read wider than the upper face");
  });

  it("shares profile boundaries for application display adapters", () => {
    expect(classifyJawProfile(0.78)).toBe("tapered");
    expect(classifyJawProfile(0.780001)).toBe("balanced");
    expect(classifyJawProfile(0.94)).toBe("strong");
    expect(classifyUpperFaceProfile(0.839999)).toBe("narrower");
    expect(classifyUpperFaceProfile(0.84)).toBe("balanced");
    expect(classifyUpperFaceProfile(0.92)).toBe("balanced");
    expect(classifyUpperFaceProfile(0.920001)).toBe("broad");
    expect(classifyJawProfile(Number.NaN)).toBeNull();
    expect(classifyUpperFaceProfile(Infinity)).toBeNull();
  });

  it.each<FaceQualityWarning>(["LOW_CONFIDENCE", "NOT_FRONTAL", "UNSTABLE", "LOW_LIGHT", "OCCLUDED", "MULTIPLE_FACES"])(
    "rejects a complete metric set when the caller passes blocking %s",
    (warning) => {
      const metrics = new FaceMetricsCalculator().compute(buildFaceResult(buildSemanticPoints("oval")));
      const result = scorer.scoreFromMetrics(metrics, [warning]);
      expect(result.primary).toBe("unknown");
      expect(result.confidence).toBe(0);
      expect(result.candidates).toEqual([]);
      expect(result.signals).toEqual([]);
      expect(result.warnings).toContain(warning);
    },
  );

  it("keeps photo-only geometry separate from detector confidence/stability", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    face.quality.confidence = 0.2;
    face.quality.stabilityScore = 0.1;
    const metrics = new FaceMetricsCalculator().compute(face);
    expect(metrics.geometryValid).toBe(true);
    expect(scorer.scoreFromMetrics(metrics).primary).not.toBe("unknown");
    const fullResult = scorer.score(face);
    expect(fullResult.primary).toBe("unknown");
    expect(fullResult.warnings).toEqual(expect.arrayContaining(["LOW_CONFIDENCE", "UNSTABLE"]));
  });

  it("rejects invisible or multiple faces despite complete geometry", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    face.quality.faceVisible = false;
    expect(scorer.score(face).primary).toBe("unknown");
    face.quality.faceVisible = true;
    face.faceCount = 2;
    expect(scorer.score(face).warnings).toContain("MULTIPLE_FACES");
  });

  it("does not let aggregation hide a later detector failure", () => {
    const good = buildFaceResult(buildSemanticPoints("round"));
    const bad = buildFaceResult(buildSemanticPoints("round"));
    bad.quality.confidence = 0.1;
    const result = scorer.scoreFrames([good, good, bad, good]);
    expect(result.primary).toBe("unknown");
    expect(result.warnings).toContain("LOW_CONFIDENCE");
  });

  it("rejects legacy precomputed metrics without an explicit geometry validity marker", () => {
    const metrics = new FaceMetricsCalculator().compute(buildFaceResult(buildSemanticPoints("oval")));
    delete metrics.geometryValid;
    expect(scorer.scoreFromMetrics(metrics).primary).toBe("unknown");
  });

  it("revalidates metric values even when geometryValid is true", () => {
    const metrics = new FaceMetricsCalculator().compute(buildFaceResult(buildSemanticPoints("oval")));
    metrics.visutry!.faceAspectRatio = Number.NaN;
    expect(scorer.scoreFromMetrics(metrics).warnings).toContain("INVALID_LANDMARKS");
    expect(() => classifyFaceGeometry(metrics.visutry!)).toThrow(RangeError);
  });

  it("provides soft photo advice without emitting a blocking warning", () => {
    const metrics = new FaceMetricsCalculator().compute(buildFaceResult(buildSemanticPoints("oval")));
    metrics.visutry!.eyeLineTiltDeg = 10;
    metrics.visutry!.symmetryOffset = 0.1;
    const result = scorer.scoreFromMetrics(metrics);
    expect(result.primary).not.toBe("unknown");
    expect(result.warnings).toEqual([]);
    expect(getFaceGeometryAdvisories(metrics.visutry!)).toEqual(["TILTED_FACE", "OFF_CENTER_FACE"]);
    expect(computeGeometryQualityScore(metrics.visutry!)).toBe(56);
  });
});
