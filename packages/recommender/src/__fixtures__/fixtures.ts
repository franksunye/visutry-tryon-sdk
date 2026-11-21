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
 * Distances scale together to model a face at different image magnifications.
 * They have no physical units and must never determine physical frame size.
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
    geometryValid: true,
    geometryWarnings: [],
    faceSpanX: faceWidthNorm,
    faceSpanY: faceWidthNorm * 1.25,
  };
  return { ...base, ...overrides };
}

/** Build a minimal `FaceShapeResult` for a given primary shape + metrics. */
export function buildFaceShapeResult(primary: FaceShape, metrics: FaceMetrics): FaceShapeResult {
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
 * Build catalog metadata. These dimensions do not establish the user's size.
 * With explicit 140mm face measurements, they satisfy the medium-tier rules.
 */
export function buildGlassesItem(id: string, overrides: Partial<GlassesItem> = {}): GlassesItem {
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
