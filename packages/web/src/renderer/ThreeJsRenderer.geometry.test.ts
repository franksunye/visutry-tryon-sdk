import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GlassesPoseSolver } from "@visutry/tryon-core";
import { buildFaceResult, buildManifest, buildSemanticPoints } from "../../../core/src/__fixtures__/faceFixtures.js";
import { ThreeJsRenderer } from "./ThreeJsRenderer.js";

const loadAsync = vi.hoisted(() => vi.fn());
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: vi.fn(() => ({
      setPixelRatio: vi.fn(), setSize: vi.fn(), setClearColor: vi.fn(),
      render: vi.fn(), dispose: vi.fn(),
    })),
  };
});
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: vi.fn(() => ({ loadAsync })),
}));

describe("ThreeJsRenderer geometry and solver coordinates", () => {
  let renderer: ThreeJsRenderer;
  afterEach(() => { renderer?.dispose(); vi.clearAllMocks(); });

  it.each([{ width: 640, height: 480 }, { width: 720, height: 1280 }])(
    "projects a 140 mm model onto the same eye span in a $width x $height frame",
    async (frameSize) => {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(new THREE.BoxGeometry(140, 35, 1), new THREE.MeshBasicMaterial()));
      loadAsync.mockResolvedValueOnce({ scene: root });
      renderer = new ThreeJsRenderer();
      await renderer.initialize(document.createElement("canvas"), frameSize);
      const asset = buildManifest();
      await renderer.loadGlasses(asset);

      const sem = buildSemanticPoints("oval");
      sem.leftEyeOuter = { x: 0.35, y: 0.4, z: 0 };
      sem.rightEyeOuter = { x: 0.65, y: 0.4, z: 0 };
      sem.noseBridge = { x: 0.6, y: 0.5, z: 0 };
      const face = buildFaceResult(sem);
      const pose = new GlassesPoseSolver().solve({ face, asset, frameSize });
      expect(pose.visible).toBe(true);
      renderer.applyPose(pose);
      root.updateWorldMatrix(true, true);
      const camera = (renderer as any).camera as THREE.OrthographicCamera;
      camera.updateMatrixWorld();
      const left = new THREE.Vector3(-70, 0, 0).applyMatrix4(root.matrixWorld).project(camera);
      const right = new THREE.Vector3(70, 0, 0).applyMatrix4(root.matrixWorld).project(camera);
      const projectedWidth = (right.x - left.x) * frameSize.width / 2;
      const projectedCenter = ((left.x + right.x) / 2 + 1) * frameSize.width / 2;

      // Observable geometry, not just an assertion on a scaling-method call:
      // the original missing mm→world conversion made this width 200x larger.
      expect(projectedWidth).toBeCloseTo(0.3 * frameSize.width);
      expect(projectedCenter).toBeCloseTo(0.6 * frameSize.width);
    },
  );

  it("applies fitting rotation once and preserves authored GLTF transforms", async () => {
    const root = new THREE.Group();
    root.rotation.x = 0.1;
    root.scale.setScalar(2);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(70, 20, 1), new THREE.MeshBasicMaterial()));
    const authoredRotation = root.quaternion.clone();
    loadAsync.mockResolvedValueOnce({ scene: root });
    renderer = new ThreeJsRenderer();
    await renderer.initialize(document.createElement("canvas"), { width: 640, height: 480 });
    const asset = buildManifest();
    asset.fitting.defaultRotation = { x: 0, y: 0, z: 0.3 };
    await renderer.loadGlasses(asset);
    const face = buildFaceResult(buildSemanticPoints("oval"));
    const pose = new GlassesPoseSolver().solve({ face, asset, frameSize: { width: 640, height: 480 } });
    renderer.applyPose(pose);
    const expected = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(pose.rotation.x, pose.rotation.y, pose.rotation.z))
      .multiply(authoredRotation);
    expect(root.getWorldQuaternion(new THREE.Quaternion()).angleTo(expected)).toBeCloseTo(0);
    expect(root.scale.x).toBeCloseTo(0.01);
    expect(root.quaternion.angleTo(authoredRotation)).toBeCloseTo(0);
  });
});
