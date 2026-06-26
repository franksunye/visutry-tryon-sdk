import { describe, it, expect } from "vitest";
import { QualityGate } from "./QualityGate.js";
import { buildFaceResult, buildSemanticPoints } from "../__fixtures__/faceFixtures.js";

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

  it("fails analysis mode when bbox is too small", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      bbox: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    });
    const result = gate.evaluate({ face, mode: "analysis" });
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain("FACE_TOO_SMALL");
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
});
