// Test-only IMAGE-mode path: real MediaPipe, no camera, Three.js, GLB or UI facade.
import { createVisuTryImageAnalyzer } from "../../../packages/web/src/ImageAnalyzer";
import type { FaceShapeResult } from "@visutry/tryon-core";

export type PhotoCase = "landscape" | "portrait" | "two-faces" | "blank";
export interface PhotoVerification {
  status: "accepted" | "rejected";
  result: FaceShapeResult;
  imageSize: { width: number; height: number } | undefined;
  faceCount: number | undefined;
  pixelAspectRatio: number | null;
}
export interface AnalysisQa {
  analyze(kind: PhotoCase): Promise<PhotoVerification | { error: string }>;
  destroy(): void;
}
declare global {
  interface Window { __analysisQa: AnalysisQa }
}

const analyzer = createVisuTryImageAnalyzer({
  wasmPath: "/mediapipe/0.10.35/wasm",
  modelAssetPath: "/mediapipe/0.10.35/models/face_landmarker.task",
});
const canvas = document.querySelector<HTMLCanvasElement>("#source")!;
const resultElement = document.querySelector<HTMLPreElement>("#analysis-result")!;
const fixture = new Image();
fixture.src = "/e2e/fixtures/astronaut.png";

window.__analysisQa = {
  async analyze(kind) {
    await fixture.decode();
    canvas.width = kind === "portrait" ? 480 : 640;
    canvas.height = kind === "two-faces" ? 320 : kind === "portrait" ? 640 : 480;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (kind === "two-faces") {
      context.drawImage(fixture, 60, 0, 320, 320, 0, 0, 320, 320);
      context.drawImage(fixture, 60, 0, 320, 320, 320, 0, 320, 320);
    } else if (kind !== "blank") {
      context.drawImage(fixture, 60, 0, 320, 320,
        kind === "landscape" ? 80 : 0, kind === "portrait" ? 80 : 0, 480, 480);
    }
    try {
      const output = await analyzer.analyzeImage(canvas);
      const { foreheadCenter, chin, leftFace, rightFace } = output.face.landmarks.semantic;
      const pixelDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot((a.x - b.x) * canvas.width, (a.y - b.y) * canvas.height);
      const pixelAspectRatio = foreheadCenter && chin && leftFace && rightFace
        ? pixelDistance(foreheadCenter, chin) / pixelDistance(leftFace, rightFace) : null;
      const result = {
        status: output.status, result: output.result,
        imageSize: output.face.imageSize, faceCount: output.face.faceCount, pixelAspectRatio,
      };
      resultElement.textContent = JSON.stringify(result, null, 2);
      return result;
    } catch (error) {
      const result = { error: (error as { code?: string }).code ?? String(error) };
      resultElement.textContent = JSON.stringify(result);
      return result;
    }
  },
  destroy() { analyzer.destroy(); },
};
