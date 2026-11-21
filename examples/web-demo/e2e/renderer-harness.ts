import { Box3, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MM_TO_RENDER_WORLD, type GlassesAssetManifest, type GlassesPose, type RenderTarget } from "@visutry/tryon-core";
import { ThreeJsRenderer } from "@visutry/tryon-web";

interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount: number;
}

interface RendererCapture {
  dataUrl: string;
  width: number;
  height: number;
  bounds: PixelBounds | null;
}

export interface RendererQa {
  calibration: number;
  nativeSize: number[];
  meshNames: string[];
  transparentLensCount: number;
  capture: (overrides?: Partial<GlassesPose>) => Promise<RendererCapture>;
}

declare global {
  interface Window { __rendererQa?: RendererQa }
}

const status = document.querySelector<HTMLPreElement>("#renderer-result")!;
const canvas = document.querySelector<HTMLCanvasElement>("#renderer-canvas")!;

async function initialize(): Promise<void> {
  const response = await fetch("/reference/v1/manifest.json");
  if (!response.ok) throw new Error(`Reference manifest HTTP ${response.status}`);
  const manifest: GlassesAssetManifest = await response.json();

  // A separate real GLTFLoader verifies the native asset before the SDK
  // renderer applies its unit conversion. No renderer internals are read.
  const inspected = await new GLTFLoader().loadAsync(manifest.modelUrl);
  const nativeSize = new Box3().setFromObject(inspected.scene).getSize(new Vector3()).toArray();
  const meshNames: string[] = [];
  let transparentLensCount = 0;
  inspected.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    meshNames.push(node.name);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (node.name.startsWith("lens_") && materials.every((material) => material.transparent)) transparentLensCount++;
    node.geometry.dispose();
    for (const material of materials) material.dispose();
  });

  const renderer = new ThreeJsRenderer();
  await renderer.initialize(canvas as unknown as RenderTarget, {
    width: 800, height: 600, pixelRatio: 1, mirror: false,
    background: "transparent", antialias: false,
  });
  await renderer.loadGlasses(manifest);

  const capture: RendererQa["capture"] = async (overrides = {}) => {
    renderer.applyPose({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      confidence: 1, visible: true, ...overrides,
    });
    const snapshot = await renderer.snapshot({ format: "image/png" });
    const image = new Image();
    image.src = snapshot.dataUrl;
    await image.decode();
    const output = document.createElement("canvas");
    output.width = snapshot.width;
    output.height = snapshot.height;
    const context = output.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, output.width, output.height);
    let minX = output.width;
    let minY = output.height;
    let maxX = -1;
    let maxY = -1;
    let pixelCount = 0;
    for (let y = 0; y < output.height; y++) {
      for (let x = 0; x < output.width; x++) {
        // Ignore nearly transparent lenses. The opaque frame defines width.
        if (data[(y * output.width + x) * 4 + 3]! < 64) continue;
        pixelCount++;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    return {
      dataUrl: snapshot.dataUrl, width: output.width, height: output.height,
      bounds: pixelCount ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixelCount } : null,
    };
  };

  window.__rendererQa = { calibration: MM_TO_RENDER_WORLD, nativeSize, meshNames, transparentLensCount, capture };
  const first = await capture();
  status.dataset.state = "ready";
  status.textContent = JSON.stringify({ nativeSize, calibration: MM_TO_RENDER_WORLD, bounds: first.bounds }, null, 2);
  const animate = () => { renderer.renderFrame(); requestAnimationFrame(animate); };
  requestAnimationFrame(animate);
}

initialize().catch((error: unknown) => {
  status.dataset.state = "error";
  status.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
