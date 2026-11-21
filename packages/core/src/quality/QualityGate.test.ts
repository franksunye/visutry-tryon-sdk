import { describe, it, expect } from "vitest";
import { QualityGate } from "./QualityGate.js";
import { buildFaceResult, buildSemanticPoints, reframeSemanticPoints } from "../__fixtures__/faceFixtures.js";
import { FaceMetricsCalculator } from "../face/FaceMetricsCalculator.js";
import { FaceShapeScorer } from "../face/FaceShapeScorer.js";

describe("QualityGate", () => {
  const gate = new QualityGate();

  it("passes a high-quality frontal face in analysis mode", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("fails analysis mode when frontal score is too low", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      quality: { confidence: 0.9, faceVisible: true, frontalScore: 0.5, stabilityScore: 0.9, warnings: [] },
    });
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("NOT_FRONTAL");
  });

  it("fails analysis mode when confidence is too low", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      quality: { confidence: 0.5, faceVisible: true, frontalScore: 0.9, stabilityScore: 0.9, warnings: [] },
    });
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("LOW_CONFIDENCE");
  });

  it("uses semantic spans instead of legacy tracker bbox thresholds in analysis mode", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      bbox: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    });
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(true);
    expect(result.warnings).not.toContain("FACE_TOO_SMALL");
  });

  it("fails analysis mode when required semantic points are missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftJaw;
    delete sem.rightJaw;
    const face = buildFaceResult(sem);
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("MISSING_KEY_POINTS");
  });

  it("passes tryon mode with moderate quality", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      quality: { confidence: 0.6, faceVisible: true, frontalScore: 0.6, stabilityScore: 0.6, warnings: [] },
      bbox: { x: 0.3, y: 0.3, width: 0.3, height: 0.4 },
    });
    const result = gate.evaluate({ face, mode: "tryon" });
    expect(result.passed).toBe(true);
  });

  it("fails tryon mode when eyesCenter is missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.eyesCenter;
    const face = buildFaceResult(sem);
    const result = gate.evaluate({ face, mode: "tryon" });
    expect(result.passed).toBe(false);
  });

  it("fails tryon mode when neither noseBridge nor noseTip exist", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.noseBridge;
    delete sem.noseTip;
    const face = buildFaceResult(sem);
    const result = gate.evaluate({ face, mode: "tryon" });
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("MISSING_KEY_POINTS");
  });

  it("fails snapshot mode when face is not visible", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      quality: { confidence: 0.9, faceVisible: false, frontalScore: 0.9, stabilityScore: 0.9, warnings: [] },
    });
    const result = gate.evaluate({ face, mode: "snapshot" });
    expect(result.passed).toBe(false);
  });

  it("emits FACE_TOO_CLOSE when bbox is very large", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    });
    const result = gate.evaluate({ face, mode: "tryon" });
    expect(result.warnings).toContain("FACE_TOO_CLOSE");
  });

  it("emits LOW_LIGHT when lighting score is low", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      quality: { confidence: 0.9, faceVisible: true, frontalScore: 0.9, stabilityScore: 0.9, lightingScore: 0.2, warnings: [] },
    });
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.warnings).toContain("LOW_LIGHT");
  });

  it("emits UNSTABLE when stability score is low in analysis mode", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      quality: { confidence: 0.9, faceVisible: true, frontalScore: 0.9, stabilityScore: 0.5, warnings: [] },
    });
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.warnings).toContain("UNSTABLE");
  });

  it.each([
    [0.159, 0.3, false],
    [0.3, 0.159, false],
    [0.16, 0.16, true],
    [0.2, 0.3, true],
  ])("shares per-axis span acceptance for %s x %s", (width, height, passed) => {
    const semantic = buildSemanticPoints("oval");
    semantic.leftFace = { x: 0, y: 0.5 };
    semantic.rightFace = { x: width as number, y: 0.5 };
    semantic.noseBridge!.x = (width as number) / 2;
    semantic.foreheadCenter!.y = 0;
    semantic.chin!.y = height as number;
    const face = buildFaceResult(semantic);
    const metrics = new FaceMetricsCalculator().compute(face);
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(metrics.geometryValid).toBe(passed);
    expect(result.passed).toBe(passed);
    expect(new FaceShapeScorer().score(face).primary === "unknown").toBe(!passed);
  });

  it.each([14.9, 15, 15.04, 15.06, 15.1])("shares rounded pixel-space tilt acceptance at %s degrees", (degrees) => {
    const semantic = buildSemanticPoints("oval");
    semantic.rightEyeOuter!.y += Math.tan(degrees * Math.PI / 180)
      * (semantic.rightEyeOuter!.x - semantic.leftEyeOuter!.x);
    const imageSize = { width: 1000, height: 1600 };
    const portrait = reframeSemanticPoints(semantic, { width: 1000, height: 1000 }, imageSize, 1, { x: 0, y: 300 });
    const face = buildFaceResult(portrait, { imageSize });
    const metrics = new FaceMetricsCalculator().compute(face);
    const expected = Math.round(degrees * 10) / 10 <= 15;
    expect(metrics.geometryValid).toBe(expected);
    expect(gate.evaluate({ face, mode: "analysis" }).passed).toBe(expected);
    expect(new FaceShapeScorer().score(face).primary === "unknown").toBe(!expected);
  });

  it("uses the same Euclidean symmetry denominator as analysis metrics", () => {
    const semantic = buildSemanticPoints("oval");
    semantic.leftFace = { x: 0.3, y: 0.3 };
    semantic.rightFace = { x: 0.7, y: 0.5 };
    semantic.noseBridge!.x = 0.56;
    const face = buildFaceResult(semantic);
    const metrics = new FaceMetricsCalculator().compute(face);
    // dx-only symmetry would be 0.15 and reject; the canonical 2D width gives 0.134.
    expect(metrics.visutry!.symmetryOffset).toBe(0.134);
    expect(metrics.geometryValid).toBe(true);
    expect(gate.evaluate({ face, mode: "analysis" }).passed).toBe(true);
  });

  it.each([Number.NaN, Infinity])("rejects invalid detector quality and returns a finite score: %s", (confidence) => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    face.quality.confidence = confidence;
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("LOW_CONFIDENCE");
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("rejects multiple detected faces and preserves adapter warnings", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), { faceCount: 2 });
    face.quality.warnings = ["OCCLUDED"];
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(false);
    expect(result.warnings).toEqual(expect.arrayContaining(["MULTIPLE_FACES", "OCCLUDED"]));
  });
});
