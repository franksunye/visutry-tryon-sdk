import { describe, it, expect } from "vitest";
import { FaceSemanticMapper, MEDIAPIPE_SEMANTIC_INDEX_MAP } from "./FaceSemanticMapper.js";

describe("FaceSemanticMapper", () => {
  it("maps raw landmarks using the default MediaPipe index map", () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[33] = { x: 0.1, y: 0.2, z: 0.3 }; // leftEyeOuter
    landmarks[263] = { x: 0.9, y: 0.2, z: 0.3 }; // rightEyeOuter
    landmarks[133] = { x: 0.4, y: 0.2, z: 0.3 }; // leftEyeInner
    landmarks[362] = { x: 0.6, y: 0.2, z: 0.3 }; // rightEyeInner
    landmarks[168] = { x: 0.5, y: 0.4, z: 0.1 }; // noseBridge
    landmarks[152] = { x: 0.5, y: 0.9, z: 0.1 }; // chin

    const mapper = new FaceSemanticMapper();
    const sem = mapper.map(landmarks);

    expect(sem.leftEyeOuter).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    expect(sem.rightEyeOuter).toEqual({ x: 0.9, y: 0.2, z: 0.3 });
    expect(sem.noseBridge).toEqual({ x: 0.5, y: 0.4, z: 0.1 });
    expect(sem.chin).toEqual({ x: 0.5, y: 0.9, z: 0.1 });
  });

  it("derives eye centers and eyesCenter from corners", () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[33] = { x: 0.2, y: 0.3, z: 0 };
    landmarks[133] = { x: 0.4, y: 0.3, z: 0 };
    landmarks[362] = { x: 0.6, y: 0.3, z: 0 };
    landmarks[263] = { x: 0.8, y: 0.3, z: 0 };

    const sem = new FaceSemanticMapper().map(landmarks);

    expect(sem.leftEyeCenter!.x).toBeCloseTo(0.3);
    expect(sem.leftEyeCenter!.y).toBeCloseTo(0.3);
    expect(sem.rightEyeCenter!.x).toBeCloseTo(0.7);
    expect(sem.eyesCenter!.x).toBeCloseTo(0.5);
    expect(sem.eyesCenter!.y).toBeCloseTo(0.3);
  });

  it("skips missing landmarks gracefully", () => {
    // Sparse array: only index 168 is set, every other index is undefined.
    const landmarks: { x: number; y: number; z: number }[] = [];
    landmarks[168] = { x: 0.5, y: 0.5, z: 0 };

    const sem = new FaceSemanticMapper().map(landmarks);

    expect(sem.noseBridge).toBeDefined();
    expect(sem.leftEyeOuter).toBeUndefined();
    expect(sem.eyesCenter).toBeUndefined();
  });

  it("respects a custom index map", () => {
    const landmarks = [{ x: 0.1, y: 0.2, z: 0.3 }];
    const mapper = new FaceSemanticMapper({
      indexMap: { noseBridge: 0 },
      deriveCenters: false,
    });
    const sem = mapper.map(landmarks);
    expect(sem.noseBridge).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
  });

  it("can disable center derivation", () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
    landmarks[33] = { x: 0.2, y: 0.3, z: 0 };
    landmarks[133] = { x: 0.4, y: 0.3, z: 0 };

    const sem = new FaceSemanticMapper({ deriveCenters: false }).map(landmarks);
    expect(sem.leftEyeCenter).toBeUndefined();
  });

  it("counts missing required semantic points", () => {
    const sem = { leftEyeCenter: { x: 0, y: 0, z: 0 } };
    const result = FaceSemanticMapper.countMissing(
      sem as never,
      ["leftEyeCenter", "noseBridge", "chin"],
    );
    expect(result.missing).toEqual(["noseBridge", "chin"]);
    expect(result.present).toBe(1);
    expect(result.total).toBe(3);
  });

  it("creates a mediapipe-bound mapper via forSource", () => {
    const mapper = FaceSemanticMapper.forSource("mediapipe");
    expect(mapper).toBeInstanceOf(FaceSemanticMapper);
    // The default map includes noseBridge at 168.
    expect(MEDIAPIPE_SEMANTIC_INDEX_MAP.noseBridge).toBe(168);
  });
});
