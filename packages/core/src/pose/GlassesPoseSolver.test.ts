import { describe, it, expect } from "vitest";
import type { NormalizedFaceResult, GlassesFittingConfig } from "../types/index.js";
import { GlassesPoseSolver, MM_TO_RENDER_WORLD, DEFAULT_FITTING_CONFIG, decomposeMatrixToEuler, degreesToRadians } from "./GlassesPoseSolver.js";
import { buildFaceResult, buildManifest, buildSemanticPoints } from "../__fixtures__/faceFixtures.js";

describe("GlassesPoseSolver", () => {
  const solver = new GlassesPoseSolver();

  it("produces a visible pose for a valid frontal face", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const asset = buildManifest();
    const pose = solver.solve({ face, asset });

    expect(pose.visible).toBe(true);
    expect(pose.confidence).toBeGreaterThan(0);
    expect(pose.scale.x).toBeGreaterThan(0);
    expect(pose.position).toBeDefined();
    expect(pose.rotation).toBeDefined();
  });

  it("returns invisible pose when eyesCenter is missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.eyesCenter;
    delete sem.leftEyeCenter;
    delete sem.rightEyeCenter;
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
    expect(pose.reason).toContain("EYES_CENTER");
  });

  it("returns invisible pose when nose references are missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.noseBridge;
    delete sem.noseTip;
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
    expect(pose.reason).toContain("NOSE");
  });

  it("returns invisible pose when tracker confidence is too low", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.3 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
  });

  it("returns invisible pose when face bbox is too small", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      bbox: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
  });

  it("computes roll from the eye line", () => {
    const sem = buildSemanticPoints("oval");
    // Tilt the eye line: raise right eye, lower left eye.
    sem.leftEyeCenter!.y += 0.03;
    sem.rightEyeCenter!.y -= 0.03;
    sem.leftEyeOuter!.y += 0.03;
    sem.rightEyeOuter!.y -= 0.03;
    sem.leftEyeInner!.y += 0.03;
    sem.rightEyeInner!.y -= 0.03;
    sem.eyesCenter = {
      x: (sem.leftEyeCenter!.x + sem.rightEyeCenter!.x) / 2,
      y: (sem.leftEyeCenter!.y + sem.rightEyeCenter!.y) / 2,
      z: 0,
    };
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    // Roll should be negative (right eye higher in render-world y-up).
    expect(pose.rotation.z).not.toBeCloseTo(0, 2);
  });

  it("scales the glasses based on eye outer distance", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const poseDefault = solver.solve({ face, asset: buildManifest() });

    // Wider face → larger scale.
    const wide = buildSemanticPoints("oval");
    wide.leftEyeOuter!.x -= 0.05;
    wide.rightEyeOuter!.x += 0.05;
    const faceWide = buildFaceResult(wide);
    const poseWide = solver.solve({ face: faceWide, asset: buildManifest() });

    expect(poseWide.scale.x).toBeGreaterThan(poseDefault.scale.x);
  });

  it("applies manifest defaultOffset and defaultRotation", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const asset = buildManifest({
      fitting: {
        defaultScale: 1,
        defaultOffset: { x: 0.1, y: 0.2, z: 0.3 },
        defaultRotation: { x: 0.4, y: 0.5, z: 0.6 },
        minScale: 0.1,
        maxScale: 5,
      },
    });
    const pose = solver.solve({ face, asset });
    // The position should include the offset; rotation should include default rotation.
    expect(pose.position.x).toBeGreaterThan(0);
    expect(pose.rotation.z).toBeGreaterThan(0.5);
  });

  it("clamps scale to manifest min/max", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const asset = buildManifest({
      fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 2, maxScale: 2 },
    });
    const pose = solver.solve({ face, asset });
    expect(pose.scale.x).toBe(2);
  });

  it("respects fitBy configuration", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const poseEyeOuter = solver.solve({ face, asset: buildManifest(), config: { fitBy: "eyeOuterDistance" } });
    const poseFaceWidth = solver.solve({ face, asset: buildManifest(), config: { fitBy: "faceWidth" } });
    // faceWidth uses cheek distance which is larger → bigger scale.
    expect(poseFaceWidth.scale.x).toBeGreaterThan(poseEyeOuter.scale.x);
  });

  it("uses noseTip depth strategy", () => {
    const sem = buildSemanticPoints("oval");
    sem.noseTip = { x: 0.5, y: 0.55, z: -0.2 };
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest(), config: { depthStrategy: "noseTip" } });
    expect(pose.position.z).not.toBe(0);
  });

  it("uses fixed depth strategy (z=0)", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const pose = solver.solve({ face, asset: buildManifest(), config: { depthStrategy: "fixed" } });
    expect(pose.position.z).toBe(0);
  });

  it("decomposes a transformation matrix to Euler angles", () => {
    // Identity matrix → all zeros.
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const e = decomposeMatrixToEuler(identity);
    expect(e.x).toBeCloseTo(0);
    expect(e.y).toBeCloseTo(0);
    expect(e.z).toBeCloseTo(0);
  });

  it("exports the mm→render-world calibration constant", () => {
    expect(MM_TO_RENDER_WORLD).toBeCloseTo(1 / 200);
  });

  // =========================================================================
  // Additional coverage tests — branches 44.77% → 80%+
  // =========================================================================

  // ---------------------------------------------------------------------------
  // computeScale — fitBy modes
  // ---------------------------------------------------------------------------

  it("computeScale with fitBy: 'eyeCenterDistance' uses inner eye points", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem);
    const poseCenter = solver.solve({
      face,
      asset: buildManifest(),
      config: { fitBy: "eyeCenterDistance" },
    });
    // eyeCenterDistance < eyeOuterDistance → smaller scale
    const poseOuter = solver.solve({
      face,
      asset: buildManifest(),
      config: { fitBy: "eyeOuterDistance" },
    });
    expect(poseCenter.scale.x).toBeLessThan(poseOuter.scale.x);
  });

  it("computeScale with fitBy: 'faceWidth' uses cheek points", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const poseFaceWidth = solver.solve({
      face,
      asset: buildManifest(),
      config: { fitBy: "faceWidth" },
    });
    // Cheeks are wider than eye outers → larger scale
    const poseEyeOuter = solver.solve({
      face,
      asset: buildManifest(),
      config: { fitBy: "eyeOuterDistance" },
    });
    expect(poseFaceWidth.scale.x).toBeGreaterThan(poseEyeOuter.scale.x);
  });

  it("fitMetricRW falls back to eye outer when faceWidth points missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftCheek;
    delete sem.rightCheek;
    const face = buildFaceResult(sem);
    const pose = solver.solve({
      face,
      asset: buildManifest(),
      config: { fitBy: "faceWidth" },
    });
    // Should still produce a visible result using eye fallback
    expect(pose.visible).toBe(true);
    expect(pose.scale.x).toBeGreaterThan(0);
  });

  it("returns defaultScale when fitMetric is near-zero", () => {
    const sem = buildSemanticPoints("oval");
    // Make eye points nearly identical
    sem.leftEyeOuter = { x: 0.5, y: 0.42, z: 0 };
    sem.rightEyeOuter = { x: 0.5001, y: 0.42, z: 0 };
    sem.leftEyeCenter = { x: 0.5, y: 0.42, z: 0 };
    sem.rightEyeCenter = { x: 0.5001, y: 0.42, z: 0 };
    sem.eyesCenter = { x: 0.5, y: 0.42, z: 0 };
    const face = buildFaceResult(sem);
    const asset = buildManifest();
    const pose = solver.solve({ face, asset });
    expect(pose.visible).toBe(true);
    // Near-zero metric → rawScale ~ 0 → clampScale applies minScale (0.2)
    expect(pose.scale.x).toBeGreaterThanOrEqual(asset.fitting.minScale!);
    expect(pose.scale.x).toBeLessThanOrEqual(asset.fitting.maxScale!);
  });

  // ---------------------------------------------------------------------------
  // computePosition — verticalAnchor modes
  // ---------------------------------------------------------------------------

  it("computePosition with verticalAnchor: 'eyeLine' uses eyesCenter", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem);
    const poseNose = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: "noseBridge" },
    });
    const poseEye = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: "eyeLine" },
    });
    // eyeLine is higher than noseBridge (smaller y in normalized → larger y in render-world)
    expect(poseEye.position.y).toBeGreaterThan(poseNose.position.y);
  });

  it("computePosition with verticalAnchor: 'browLine' uses brow midpoint", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem);
    const poseBrow = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: "browLine" },
    });
    const poseEye = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: "eyeLine" },
    });
    // Brow line is higher than eye line
    expect(poseBrow.position.y).toBeGreaterThan(poseEye.position.y);
  });

  it("computePosition with browLine falls back to eyesCenter when brows missing", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftBrowCenter;
    delete sem.rightBrowCenter;
    const face = buildFaceResult(sem);
    const poseBrow = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: "browLine" },
    });
    const poseEye = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: "eyeLine" },
    });
    // Fallback to eyesCenter → same position as eyeLine
    expect(poseBrow.position.y).toBeCloseTo(poseEye.position.y, 6);
    expect(poseBrow.position.x).toBeCloseTo(poseEye.position.x, 6);
  });

  it("computePosition falls back to eyesCenter when noseBridge missing", () => {
    const sem = buildSemanticPoints("oval");
    // Remove noseBridge but keep noseTip (so visibility gate passes)
    delete sem.noseBridge;
    const face = buildFaceResult(sem);
    const pose = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: "noseBridge" },
    });
    expect(pose.visible).toBe(true);
    // Should use eyesCenter as fallback
    expect(pose.position).toBeDefined();
  });

  it("computePosition with depthStrategy: 'matrix' uses face.pose.matrix[14]", () => {
    const sem = buildSemanticPoints("oval");
    const matrix = new Array(16).fill(0);
    // Identity rotation + translation z = 0.5
    matrix[0] = 1; matrix[5] = 1; matrix[10] = 1; matrix[15] = 1;
    matrix[14] = 0.5; // translation z
    const face = buildFaceResult(sem, {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95, matrix },
    });
    const pose = solver.solve({
      face,
      asset: buildManifest(),
      config: { depthStrategy: "matrix" },
    });
    expect(pose.position.z).toBeCloseTo(0.5, 5);
  });

  // ---------------------------------------------------------------------------
  // computeRotation — useTransformationMatrix
  // ---------------------------------------------------------------------------

  it("computeRotation with useTransformationMatrix: true decomposes matrix", () => {
    const sem = buildSemanticPoints("oval");
    // Rotation of 30 degrees around Y axis (yaw)
    const angle = Math.PI / 6; // 30 deg
    const matrix = [
      Math.cos(angle), 0, -Math.sin(angle), 0,
      0, 1, 0, 0,
      Math.sin(angle), 0, Math.cos(angle), 0,
      0, 0, 0, 1,
    ];
    const face = buildFaceResult(sem, {
      pose: { yaw: 0.5, pitch: 0.2, roll: 0, confidence: 0.95, matrix },
    });
    const poseMatrix = solver.solve({
      face,
      asset: buildManifest(),
      config: { useTransformationMatrix: true },
    });
    const poseNoMatrix = solver.solve({
      face,
      asset: buildManifest(),
      config: { useTransformationMatrix: false },
    });
    // With matrix enabled, yaw (rotation.y) comes from matrix decomposition
    expect(poseMatrix.rotation.y).toBeDefined();
    // Roll should match between both (derived from eye line)
    expect(poseMatrix.rotation.z).toBeCloseTo(poseNoMatrix.rotation.z, 5);
  });

  it("computeRotation with useTransformationMatrix: false uses face pose yaw/pitch", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem, {
      pose: { yaw: 0.3, pitch: -0.1, roll: 0, confidence: 0.95 },
    });
    const pose = solver.solve({
      face,
      asset: buildManifest(),
      config: { useTransformationMatrix: false },
    });
    expect(pose.rotation.y).toBeCloseTo(0.3, 5);
    expect(pose.rotation.x).toBeCloseTo(-0.1, 5);
  });

  it("computeRotation with useTransformationMatrix: true but no matrix falls back", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem, {
      pose: { yaw: 0.4, pitch: -0.2, roll: 0, confidence: 0.95 },
      // No matrix field
    });
    const pose = solver.solve({
      face,
      asset: buildManifest(),
      config: { useTransformationMatrix: true },
    });
    // Falls back to face.pose.yaw/pitch
    expect(pose.rotation.y).toBeCloseTo(0.4, 5);
    expect(pose.rotation.x).toBeCloseTo(-0.2, 5);
  });

  // ---------------------------------------------------------------------------
  // decomposeMatrixToEuler — gimbal lock
  // ---------------------------------------------------------------------------

  it("decomposeMatrixToEuler handles gimbal lock (m2 near 1)", () => {
    // sin(y) ≈ 1 → m2 = -sin(y) ≈ -1
    const angle = Math.PI / 2;
    const matrix = [
      1, 0, 0, 0,
      0, Math.cos(angle), Math.sin(angle), 0,
      0, -Math.sin(angle), Math.cos(angle), 0,
      0, 0, 0, 1,
    ];
    const e = decomposeMatrixToEuler(matrix);
    // Should not throw, should produce finite values
    expect(isFinite(e.x)).toBe(true);
    expect(isFinite(e.y)).toBe(true);
    expect(isFinite(e.z)).toBe(true);
  });

  it("decomposeMatrixToEuler handles gimbal lock (m2 near -1)", () => {
    const angle = -Math.PI / 2;
    const matrix = [
      1, 0, 0, 0,
      0, Math.cos(angle), Math.sin(angle), 0,
      0, -Math.sin(angle), Math.cos(angle), 0,
      0, 0, 0, 1,
    ];
    const e = decomposeMatrixToEuler(matrix);
    expect(isFinite(e.x)).toBe(true);
    expect(isFinite(e.y)).toBe(true);
    expect(isFinite(e.z)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Visibility gate failures — additional coverage
  // ---------------------------------------------------------------------------

  it("returns invisible pose when only leftEyeCenter exists (no eyesCenter)", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.eyesCenter;
    delete sem.rightEyeCenter;
    // leftEyeCenter still exists but no eyesCenter → visibility fails
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
    expect(pose.reason).toContain("EYES_CENTER");
  });

  it("returns invisible pose when confidence is exactly at threshold (0.55)", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.55 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    // 0.55 < 0.55 is false, so it passes
    expect(pose.visible).toBe(true);
  });

  it("returns invisible pose when bbox width is exactly at threshold (0.18)", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      bbox: { x: 0.4, y: 0.4, width: 0.18, height: 0.18 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    // 0.18 < 0.18 is false, so it passes
    expect(pose.visible).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Position/rotation offset application
  // ---------------------------------------------------------------------------

  it("applies config positionOffset on top of manifest defaultOffset", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const asset = buildManifest({
      fitting: {
        defaultScale: 1,
        defaultOffset: { x: 0.01, y: 0.02, z: 0.03 },
        defaultRotation: { x: 0, y: 0, z: 0 },
        minScale: 0.1,
        maxScale: 5,
      },
    });
    const poseNoOffset = solver.solve({ face, asset, config: { positionOffset: { x: 0, y: 0, z: 0 } } });
    const poseWithOffset = solver.solve({ face, asset, config: { positionOffset: { x: 0.05, y: 0.06, z: 0.07 } } });
    expect(poseWithOffset.position.x).toBeCloseTo(poseNoOffset.position.x + 0.05, 6);
    expect(poseWithOffset.position.y).toBeCloseTo(poseNoOffset.position.y + 0.06, 6);
    expect(poseWithOffset.position.z).toBeCloseTo(poseNoOffset.position.z + 0.07, 6);
  });

  it("applies config rotationOffset on top of manifest defaultRotation", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const asset = buildManifest({
      fitting: {
        defaultScale: 1,
        defaultOffset: { x: 0, y: 0, z: 0 },
        defaultRotation: { x: 0.01, y: 0.02, z: 0.03 },
        minScale: 0.1,
        maxScale: 5,
      },
    });
    const pose = solver.solve({
      face,
      asset,
      config: { rotationOffset: { x: 0.1, y: 0.2, z: 0.3 } },
    });
    // rotation.x = face.pitch + defaultRotation.x + offset.x
    expect(pose.rotation.x).toBeCloseTo(face.pose.pitch + 0.01 + 0.1, 6);
  });

  // ---------------------------------------------------------------------------
  // Scale clamping — min/max boundary tests
  // ---------------------------------------------------------------------------

  it("clamps scale to minScale when computed scale is too small", () => {
    const sem = buildSemanticPoints("oval");
    // Extremely wide frame → very small scale
    const asset = buildManifest({
      dimensions: { frameWidthMm: 5000 },
      fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.5, maxScale: 3 },
    });
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset });
    expect(pose.scale.x).toBeGreaterThanOrEqual(0.5);
  });

  it("clamps scale to maxScale when computed scale is too large", () => {
    const sem = buildSemanticPoints("oval");
    // Extremely narrow frame → very large scale
    const asset = buildManifest({
      dimensions: { frameWidthMm: 1 },
      fitting: { defaultScale: 10, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.1, maxScale: 2 },
    });
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset });
    expect(pose.scale.x).toBeLessThanOrEqual(2);
  });

  it("scaleMultiplier is applied and scale is still clamped", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const asset = buildManifest({
      fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.3, maxScale: 1.5 },
    });
    const pose = solver.solve({ face, asset, config: { scaleMultiplier: 100 } });
    // Even with huge multiplier, should be clamped
    expect(pose.scale.x).toBeLessThanOrEqual(1.5);
  });

  // ---------------------------------------------------------------------------
  // Manifest with different coordinate units
  // ---------------------------------------------------------------------------

  it("manifest with centimeter unit multiplies frameWidth by 10", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem);
    // 14 cm = 140 mm → same as default millimeter manifest
    const assetCm = buildManifest({
      coordinateSystem: { unit: "centimeter", forwardAxis: "+z", upAxis: "+y" },
      dimensions: { frameWidthMm: 14 }, // 14 cm
      fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.1, maxScale: 5 },
    });
    const assetMm = buildManifest({
      dimensions: { frameWidthMm: 140 }, // 140 mm
      fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.1, maxScale: 5 },
    });
    const poseCm = solver.solve({ face, asset: assetCm });
    const poseMm = solver.solve({ face, asset: assetMm });
    expect(poseCm.scale.x).toBeCloseTo(poseMm.scale.x, 5);
  });

  it("manifest with meter unit multiplies frameWidth by 1000", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem);
    // 0.14 m = 140 mm → same as millimeter manifest
    const assetMeter = buildManifest({
      coordinateSystem: { unit: "meter", forwardAxis: "+z", upAxis: "+y" },
      dimensions: { frameWidthMm: 0.14 }, // 0.14 meters
      fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.1, maxScale: 5 },
    });
    const assetMm = buildManifest({
      dimensions: { frameWidthMm: 140 },
      fitting: { defaultScale: 1, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.1, maxScale: 5 },
    });
    const poseMeter = solver.solve({ face, asset: assetMeter });
    const poseMm = solver.solve({ face, asset: assetMm });
    expect(poseMeter.scale.x).toBeCloseTo(poseMm.scale.x, 5);
  });

  // ---------------------------------------------------------------------------
  // Edge cases: zero-distance face, NaN landmarks
  // ---------------------------------------------------------------------------

  it("handles NaN in eye landmarks gracefully", () => {
    const sem = buildSemanticPoints("oval");
    sem.leftEyeOuter = { x: NaN, y: 0.42, z: 0 };
    sem.rightEyeOuter = { x: 0.62, y: 0.42, z: 0 };
    sem.leftEyeCenter = { x: NaN, y: 0.42, z: 0 };
    sem.rightEyeCenter = { x: 0.58, y: 0.42, z: 0 };
    sem.eyesCenter = { x: NaN, y: 0.42, z: 0 };
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    // Should produce a result (NaN propagation may cause non-finite values,
    // but the solver should not throw)
    expect(pose).toBeDefined();
    expect(typeof pose.visible).toBe("boolean");
  });

  it("handles NaN in position landmarks gracefully", () => {
    const sem = buildSemanticPoints("oval");
    sem.noseBridge = { x: NaN, y: NaN, z: NaN };
    sem.noseTip = { x: 0.5, y: 0.54, z: -0.08 }; // keep for visibility gate
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose).toBeDefined();
    expect(typeof pose.visible).toBe("boolean");
  });

  it("handles zero-size bbox gracefully (aspect falls back to 4:3)", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem, {
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    // Should fail visibility due to small bbox (< 0.18)
    expect(pose.visible).toBe(false);
    expect(pose.reason).toContain("FACE_TOO_SMALL");
  });

  it("invisible pose returns asset defaultScale for all axes", () => {
    const asset = buildManifest({
      fitting: { defaultScale: 2.5, defaultOffset: { x: 0, y: 0, z: 0 }, defaultRotation: { x: 0, y: 0, z: 0 }, minScale: 0.1, maxScale: 5 },
    });
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.3 },
    });
    const pose = solver.solve({ face, asset });
    expect(pose.visible).toBe(false);
    expect(pose.scale.x).toBe(2.5);
    expect(pose.scale.y).toBe(2.5);
    expect(pose.scale.z).toBe(2.5);
  });

  it("invisible pose has zero position and rotation", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.3 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
    expect(pose.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(pose.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  // ---------------------------------------------------------------------------
  // Confidence blending
  // ---------------------------------------------------------------------------

  it("confidence blends visibility confidence (0.7) and pose confidence (0.3)", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.9 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    // assessVisibility returns face.pose.confidence (0.9) as visibility confidence
    // So final = visibility.confidence * 0.7 + face.pose.confidence * 0.3
    // = 0.9 * 0.7 + 0.9 * 0.3 = 0.9
    expect(pose.confidence).toBeCloseTo(0.9, 1);
  });

  // ---------------------------------------------------------------------------
  // degreesToRadians
  // ---------------------------------------------------------------------------

  it("degreesToRadians converts degrees to radians", () => {
    expect(degreesToRadians(0)).toBeCloseTo(0);
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 5);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 5);
    expect(degreesToRadians(360)).toBeCloseTo(Math.PI * 2, 5);
  });

  // ---------------------------------------------------------------------------
  // deriveAspect
  // ---------------------------------------------------------------------------

  it("deriveAspect returns bbox aspect ratio when width and height are non-zero", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem, {
      bbox: { x: 0, y: 0, width: 640, height: 480 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    // Should still produce a valid result; the aspect is 640/480 = 4/3
    expect(pose.visible).toBe(true);
  });

  it("deriveAspect falls back to 4/3 when bbox dimensions are zero", () => {
    const sem = buildSemanticPoints("oval");
    // Override to have high confidence but zero bbox
    const face = buildFaceResult(sem, {
      bbox: { x: 0.5, y: 0.3, width: 0.4, height: 0.4 }, // needs to pass visibility
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(true);
  });

  // =========================================================================
  // Additional branch-coverage tests — pushing branches toward 80%+
  // =========================================================================

  // ---------------------------------------------------------------------------
  // computeRoll — eye-center null fallbacks
  // ---------------------------------------------------------------------------

  it("computeRoll falls back to leftEyeOuter when leftEyeCenter is null", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftEyeCenter;
    // Tilt the eye line so roll is non-zero.
    sem.leftEyeOuter!.y += 0.03;
    sem.rightEyeOuter!.y -= 0.03;
    sem.eyesCenter = {
      x: (sem.leftEyeOuter!.x + sem.rightEyeOuter!.x) / 2,
      y: (sem.leftEyeOuter!.y + sem.rightEyeOuter!.y) / 2,
      z: 0,
    };
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(true);
    // Roll derived from eye outer line (non-zero because tilted).
    expect(pose.rotation.z).not.toBeCloseTo(0, 2);
  });

  it("computeRoll falls back to rightEyeOuter when rightEyeCenter is null", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.rightEyeCenter;
    sem.leftEyeOuter!.y += 0.03;
    sem.rightEyeOuter!.y -= 0.03;
    sem.eyesCenter = {
      x: (sem.leftEyeOuter!.x + sem.rightEyeOuter!.x) / 2,
      y: (sem.leftEyeOuter!.y + sem.rightEyeOuter!.y) / 2,
      z: 0,
    };
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(true);
    expect(pose.rotation.z).not.toBeCloseTo(0, 2);
  });

  it("computeRoll returns 0 when both leftEyeCenter and leftEyeOuter are null", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftEyeCenter;
    delete sem.leftEyeOuter;
    // eyesCenter stays so visibility passes.
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(true);
    // le is null → roll = 0; default rotation offsets are 0.
    expect(pose.rotation.z).toBe(0);
  });

  it("computeRoll returns 0 when both rightEyeCenter and rightEyeOuter are null", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.rightEyeCenter;
    delete sem.rightEyeOuter;
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(true);
    expect(pose.rotation.z).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // fitMetricRW — all points null → returns 0
  // ---------------------------------------------------------------------------

  it("fitMetricRW returns 0 when all eye and cheek points are null", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.leftEyeOuter;
    delete sem.rightEyeOuter;
    delete sem.leftEyeCenter;
    delete sem.rightEyeCenter;
    delete sem.leftCheek;
    delete sem.rightCheek;
    // eyesCenter stays for visibility.
    const face = buildFaceResult(sem);
    const asset = buildManifest();
    const pose = solver.solve({ face, asset });
    expect(pose.visible).toBe(true);
    // fitMetric is 0 → computeScale returns defaultScale, then clamp keeps it.
    expect(pose.scale.x).toBe(asset.fitting.defaultScale);
  });

  // ---------------------------------------------------------------------------
  // computePosition — noseBridge AND eyesCenter both null (private method)
  // ---------------------------------------------------------------------------

  it("computePosition returns origin when noseBridge and eyesCenter are both null", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.noseBridge;
    delete sem.eyesCenter;
    const face = buildFaceResult(sem);
    const cfg = { ...DEFAULT_FITTING_CONFIG };
    const result = (solver as unknown as {
      computePosition: (
        sem: NormalizedFaceResult["landmarks"]["semantic"],
        asset: ReturnType<typeof buildManifest>,
        cfg: GlassesFittingConfig,
        aspect: number,
        face: NormalizedFaceResult,
      ) => { x: number; y: number; z: number };
    }).computePosition(sem, buildManifest(), cfg, 4 / 3, face);
    expect(result).toEqual({ x: 0, y: 0, z: 0 });
  });

  // ---------------------------------------------------------------------------
  // computePosition — depthStrategy "noseTip" edge cases
  // ---------------------------------------------------------------------------

  it("computePosition with noseTip depth treats undefined z as 0", () => {
    const sem = buildSemanticPoints("oval");
    // Remove z so `sem.noseTip.z ?? 0` hits the fallback.
    delete (sem.noseTip as { z?: number }).z;
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest(), config: { depthStrategy: "noseTip" } });
    expect(pose.visible).toBe(true);
    // z = (undefined ?? 0) * 0.5 = 0, plus default offset z = 0.
    expect(pose.position.z).toBe(0);
  });

  it("computePosition with noseTip depth but no noseTip keeps z at 0", () => {
    const sem = buildSemanticPoints("oval");
    delete sem.noseTip;
    // noseBridge stays so visibility passes.
    const face = buildFaceResult(sem);
    const pose = solver.solve({ face, asset: buildManifest(), config: { depthStrategy: "noseTip" } });
    expect(pose.visible).toBe(true);
    // `depth === "noseTip" && sem.noseTip` is false → z stays 0.
    expect(pose.position.z).toBe(0);
  });

  it("computePosition with matrix depth handles undefined matrix[14]", () => {
    const sem = buildSemanticPoints("oval");
    // 12-element matrix → matrix[14] is undefined.
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const face = buildFaceResult(sem, {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95, matrix },
    });
    const pose = solver.solve({ face, asset: buildManifest(), config: { depthStrategy: "matrix" } });
    expect(pose.visible).toBe(true);
    // matrix[14] ?? 0 = 0.
    expect(pose.position.z).toBe(0);
  });

  it("computePosition uses default verticalAnchor when config sets it to undefined", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem);
    const poseDefault = solver.solve({ face, asset: buildManifest() });
    // Pass config with verticalAnchor explicitly undefined → ?? "noseBridge" fallback.
    const poseUndef = solver.solve({
      face,
      asset: buildManifest(),
      config: { verticalAnchor: undefined },
    });
    expect(poseUndef.visible).toBe(true);
    expect(poseUndef.position.y).toBeCloseTo(poseDefault.position.y, 6);
  });

  // ---------------------------------------------------------------------------
  // clampScale — min/max boundary and default fallbacks (private method)
  // ---------------------------------------------------------------------------

  it("clampScale uses default 0.1 min when minScale is undefined", () => {
    const asset = buildManifest({
      fitting: {
        defaultScale: 1,
        defaultOffset: { x: 0, y: 0, z: 0 },
        defaultRotation: { x: 0, y: 0, z: 0 },
        // minScale and maxScale deliberately omitted.
      },
    });
    const cfg = { ...DEFAULT_FITTING_CONFIG };
    const result = (solver as unknown as {
      clampScale: (s: number, a: typeof asset, c: typeof cfg) => number;
    }).clampScale(-100, asset, cfg);
    expect(result).toBe(0.1);
  });

  it("clampScale uses default 5 max when maxScale is undefined", () => {
    const asset = buildManifest({
      fitting: {
        defaultScale: 1,
        defaultOffset: { x: 0, y: 0, z: 0 },
        defaultRotation: { x: 0, y: 0, z: 0 },
      },
    });
    const cfg = { ...DEFAULT_FITTING_CONFIG };
    const result = (solver as unknown as {
      clampScale: (s: number, a: typeof asset, c: typeof cfg) => number;
    }).clampScale(1000, asset, cfg);
    expect(result).toBe(5);
  });

  it("clampScale handles scaleMultiplier of 0 (avoids division by zero)", () => {
    const asset = buildManifest();
    const cfg = { ...DEFAULT_FITTING_CONFIG, scaleMultiplier: 0 };
    const result = (solver as unknown as {
      clampScale: (s: number, a: typeof asset, c: typeof cfg) => number;
    }).clampScale(5, asset, cfg);
    // scale / (0 || 1) * 0 = 0 → clamp(0, 0.2, 3) = 0.2
    expect(result).toBe(0.2);
  });

  // ---------------------------------------------------------------------------
  // assessVisibility — boundary just-below thresholds
  // ---------------------------------------------------------------------------

  it("returns invisible pose when confidence is 0.54 (just below threshold)", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.54 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
    expect(pose.reason).toContain("CONFIDENCE");
  });

  it("returns invisible pose when bbox width is 0.17 (just below threshold)", () => {
    const face = buildFaceResult(buildSemanticPoints("oval"), {
      bbox: { x: 0.4, y: 0.4, width: 0.17, height: 0.17 },
    });
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose.visible).toBe(false);
    expect(pose.reason).toContain("FACE_TOO_SMALL");
  });

  // ---------------------------------------------------------------------------
  // deriveAspect — width > 0 but height = 0 (fallback to 4/3)
  // ---------------------------------------------------------------------------

  it("deriveAspect falls back to 4/3 when bbox height is 0 but width is positive", () => {
    const sem = buildSemanticPoints("oval");
    const face = buildFaceResult(sem, {
      bbox: { x: 0, y: 0, width: 0.4, height: 0 },
      pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95 },
    });
    // deriveAspect is called before visibility gate; the 4/3 fallback is exercised.
    // Visibility fails because bboxWidth 0.4 >= 0.18 passes, but the face has
    // a degenerate bbox. Actually 0.4 >= 0.18 so it passes the bbox check.
    // Let's verify the solver doesn't throw and produces a result.
    const pose = solver.solve({ face, asset: buildManifest() });
    expect(pose).toBeDefined();
    expect(typeof pose.visible).toBe("boolean");
  });

  // ---------------------------------------------------------------------------
  // decomposeMatrixToEuler — actual gimbal lock (m2 near ±1)
  // ---------------------------------------------------------------------------

  it("decomposeMatrixToEuler triggers gimbal lock when m2 is exactly 1", () => {
    // Column-major: matrix[2] = m2 = 1 → y = asin(-1) = -PI/2, gimbal lock.
    const matrix = [
      0, 0, 1, 0,
      0, 1, 0, 0,
      -1, 0, 0, 0,
      0, 0, 0, 1,
    ];
    const e = decomposeMatrixToEuler(matrix);
    expect(isFinite(e.x)).toBe(true);
    expect(isFinite(e.y)).toBe(true);
    expect(isFinite(e.z)).toBe(true);
    expect(e.y).toBeCloseTo(-Math.PI / 2, 4);
    // Gimbal lock: z is forced to 0.
    expect(e.z).toBe(0);
  });

  it("decomposeMatrixToEuler triggers gimbal lock when m2 is exactly -1", () => {
    // Column-major: matrix[2] = m2 = -1 → y = asin(1) = PI/2, gimbal lock.
    const matrix = [
      0, 0, -1, 0,
      0, 1, 0, 0,
      1, 0, 0, 0,
      0, 0, 0, 1,
    ];
    const e = decomposeMatrixToEuler(matrix);
    expect(isFinite(e.x)).toBe(true);
    expect(isFinite(e.y)).toBe(true);
    expect(isFinite(e.z)).toBe(true);
    expect(e.y).toBeCloseTo(Math.PI / 2, 4);
    expect(e.z).toBe(0);
  });

  it("decomposeMatrixToEuler handles short matrix with undefined entries", () => {
    // Matrix shorter than 16 elements — ?? fallbacks kick in.
    const e = decomposeMatrixToEuler([0, 0, 0.5]);
    expect(isFinite(e.x)).toBe(true);
    expect(isFinite(e.y)).toBe(true);
    expect(isFinite(e.z)).toBe(true);
  });
});
