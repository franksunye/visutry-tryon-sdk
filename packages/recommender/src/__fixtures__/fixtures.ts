import type {
  FaceMetrics,
  FaceShape,
  FaceShapeResult,
  GlassesItem,
  GlassesShape,
} from "@visutry/tryon-core";

/**
 * Build a synthetic `FaceMetrics` with a controlled normalized `faceWidth`.
 *
 * All distances stay internally consistent (ratios roughly oval-ish) so the
 * size pipeline has realistic inputs. `faceWidth` is the only value the
 * recommender's sizing reads for tiering; `eyeCenterDistance` is provided as a
 * plausible supplementary signal (~0.53 * faceWidth, matching the core fixture).
 */
export function buildMetrics(
  faceWidthNorm: number,
  overrides: Partial<FaceMetrics> = {},
): FaceMetrics {
  const base: FaceMetrics = {
    faceWidth: faceWidthNorm,
    faceHeight: faceWidthNorm * 1.25,
    cheekboneWidth: faceWidthNorm,
    jawWidth: faceWidthNorm * 0.8,
    eyeOuterDistance: faceWidthNorm * 0.8,
    eyeInnerDistance: faceWidthNorm * 0.4,
    eyeCenterDistance: faceWidthNorm * 0.53,
    noseBridgeToEyeLine: 0.05,
    widthHeightRatio: 0.8,
    jawCheekRatio: 0.8,
    chinType: "rounded",
    measurementQuality: 0.9,
  };
  return { ...base, ...overrides };
}

/** Build a minimal `FaceShapeResult` for a given primary shape + metrics. */
export function buildFaceShapeResult(
  primary: FaceShape,
  metrics: FaceMetrics,
): FaceShapeResult {
  return {
    primary,
    candidates: [{ shape: primary, score: 0.9, reasons: ["fixture"] }],
    confidence: 0.9,
    metrics,
    warnings: [],
    version: "1.0.0",
  };
}

/**
 * Build a `GlassesItem`. Defaults describe a medium face (140mm) frame that is a
 * perfect size fit: frameWidth 140mm, lensWidth 50mm (within the 46-52mm medium
 * range). Callers override `shapeCategory` / `dimensions` / prefs as needed.
 */
export function buildGlassesItem(
  id: string,
  overrides: Partial<GlassesItem> = {},
): GlassesItem {
  return {
    id,
    name: `Glasses ${id}`,
    thumbnailUrl: "https://example.com/thumb.png",
    shapeCategory: "rectangle",
    dimensions: { frameWidthMm: 140, lensWidthMm: 50 },
    price: 0, // default price so scoring tests get full price points
    ...overrides,
  };
}

/** Shorthand to build many items by shape, sharing the perfect-fit dimensions. */
export function buildItemsByShape(
  shapes: GlassesShape[],
  dims: { frameWidthMm?: number; lensWidthMm?: number } = {
    frameWidthMm: 140,
    lensWidthMm: 50,
  },
): GlassesItem[] {
  return shapes.map((shape, i) =>
    buildGlassesItem(`${shape}-${i}`, { shapeCategory: shape, dimensions: dims }),
  );
}
