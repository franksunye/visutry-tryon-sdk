/**
 * ImageAnalyzer — lightweight face shape analysis without Three.js.
 *
 * Extracted from VisuTryWebSDK to enable subpath export
 * `@visutry/tryon-web/analyzer` that does NOT pull in Three.js or the
 * camera provider. Only requires MediaPipe for face landmark detection.
 */

import type {
  FaceShapeResult,
  NormalizedFaceResult,
} from "@visutry/tryon-core";
import {
  FaceShapeScorer,
  QualityGate,
  createSDKError,
} from "@visutry/tryon-core";
import type { MediaPipeTrackerOptions } from "./tracker/MediaPipeFaceTracker.js";
import { MediaPipeFaceTracker } from "./tracker/MediaPipeFaceTracker.js";

/**
 * Result of {@link ImageAnalyzer.analyzeImage} — includes both the face
 * shape analysis result and the raw normalized face result (useful for
 * landmark overlay rendering) in a single call.
 */
export interface ImageAnalysisResult {
  /** Face shape classification, confidence, metrics and candidates. */
  result: FaceShapeResult;
  /** Raw face landmark data — pass to `LandmarkOverlay.renderFromFace()`. */
  face: NormalizedFaceResult;
}

/**
 * Lightweight SDK instance for **image-only** face shape analysis.
 * Does NOT require a canvas or Three.js renderer — only loads MediaPipe.
 *
 * Usage:
 * ```ts
 * const analyzer = createVisuTryImageAnalyzer();
 * const img = new Image();
 * img.src = 'photo.jpg';
 * await img.decode();
 *
 * // Option 1: get face shape result only
 * const result = await analyzer.analyzeFaceShapeFromImage(img);
 *
 * // Option 2: get both result + face in one call (avoids getLastFaceResult)
 * const { result, face } = await analyzer.analyzeImage(img);
 *
 * // Backward-compatible: still available
 * const face2 = analyzer.getLastFaceResult();
 * ```
 */
export interface ImageAnalyzer {
  /**
   * Analyze face shape from a still image.
   * @param image HTMLImageElement, HTMLCanvasElement, ImageBitmap, or HTMLVideoElement.
   * @returns Face shape classification result.
   */
  analyzeFaceShapeFromImage(image: unknown): Promise<FaceShapeResult>;

  /**
   * Analyze face shape from a still image and return both the result and
   * the raw face landmark data in a single call.
   *
   * This is the recommended API for new code — it avoids the two-step
   * `analyzeFaceShapeFromImage` + `getLastFaceResult` pattern and makes
   * the data flow explicit.
   *
   * @param image HTMLImageElement, HTMLCanvasElement, ImageBitmap, or HTMLVideoElement.
   * @returns Object containing `result` (face shape) and `face` (landmarks).
   */
  analyzeImage(image: unknown): Promise<ImageAnalysisResult>;

  /** Returns the last detected face result (for landmark overlay rendering). */
  getLastFaceResult(): NormalizedFaceResult | null;

  /** Release MediaPipe resources. */
  destroy(): void;
}

/**
 * Create a lightweight SDK instance for **image-only** face shape analysis.
 * Does NOT require a canvas or Three.js renderer — only loads MediaPipe.
 */
export function createVisuTryImageAnalyzer(
  options?: MediaPipeTrackerOptions,
): ImageAnalyzer {
  const tracker = new MediaPipeFaceTracker(options ?? {}, { mode: "balanced" });
  const scorer = new FaceShapeScorer();
  const qualityGate = new QualityGate();
  let destroyed = false;
  let lastFace: NormalizedFaceResult | null = null;

  /** Core detection + scoring logic shared by both analyze methods. */
  async function detectAndScore(image: unknown): Promise<{
    result: FaceShapeResult;
    face: NormalizedFaceResult;
  }> {
    if (destroyed) {
      throw createSDKError("UNKNOWN", "Image analyzer has been destroyed");
    }
    const face = await tracker.detectImage(image);
    if (!face) {
      throw createSDKError("UNKNOWN", "No face detected in the provided image");
    }
    lastFace = face;
    const gate = qualityGate.evaluate({ face, mode: "analysis" });
    const result = scorer.scoreFrames([face]);
    if (gate.warnings.length > 0) {
      const merged = [...new Set([...result.warnings, ...gate.warnings])];
      return { result: { ...result, warnings: merged }, face };
    }
    return { result, face };
  }

  return {
    async analyzeFaceShapeFromImage(image: unknown): Promise<FaceShapeResult> {
      const { result } = await detectAndScore(image);
      return result;
    },

    async analyzeImage(image: unknown): Promise<ImageAnalysisResult> {
      return detectAndScore(image);
    },

    getLastFaceResult(): NormalizedFaceResult | null {
      return lastFace;
    },

    destroy(): void {
      destroyed = true;
      tracker.destroy();
    },
  };
}
