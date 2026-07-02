import { describe, it, expect } from "vitest";
import { FaceShapeScorer } from "./FaceShapeScorer.js";
import { buildFaceResult, buildSemanticPoints } from "../__fixtures__/faceFixtures.js";

describe("FaceShapeScorer", () => {
  const scorer = new FaceShapeScorer();

  it("produces a result with candidates and version", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const result = scorer.score(face);
    expect(result.candidates.length).toBe(7);
    expect(result.version).toBe("2.0.0");
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
  });
});
