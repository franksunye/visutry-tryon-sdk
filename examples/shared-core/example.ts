import {
  FaceShapeScorer,
  type FaceSemanticPoints,
  type GlassesItem,
  type NormalizedFaceResult,
} from "@visutry/tryon-core";
import { Recommender } from "@visutry/recommender";

// Synthetic geometry for an API-contract example, not a person or an accuracy
// benchmark. A real host maps its detector's points after image orientation.
const imageSize = { width: 640, height: 480 };
const point = (x: number, y: number) => ({
  x: x / imageSize.width,
  y: y / imageSize.height,
});
const semantic = {
  leftEyeOuter: point(243, 190),
  leftEyeInner: point(294, 190),
  rightEyeInner: point(346, 190),
  rightEyeOuter: point(397, 190),
  leftEyeCenter: point(268.5, 190),
  rightEyeCenter: point(371.5, 190),
  eyesCenter: point(320, 190),
  noseBridge: point(320, 230),
  noseTip: point(320, 270),
  leftBrowCenter: point(275, 170),
  rightBrowCenter: point(365, 170),
  foreheadCenter: point(320, 125),
  chin: point(320, 365),
  leftCheek: point(224, 250),
  rightCheek: point(416, 250),
  leftJaw: point(243, 323),
  rightJaw: point(397, 323),
  leftFace: point(220, 240),
  rightFace: point(420, 240),
  leftForehead: point(234, 165),
  rightForehead: point(406, 165),
  noseLeft: point(291, 240),
  noseRight: point(349, 240),
} satisfies FaceSemanticPoints;

export const syntheticFaceInput: NormalizedFaceResult = {
  source: "custom",
  timestamp: 0,
  imageSize,
  faceCount: 1,
  landmarks: {
    raw: [], // No detector-specific index array is needed for this semantic path.
    normalized: Object.values(semantic),
    semantic,
  },
  pose: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95 },
  bbox: { x: 220 / 640, y: 125 / 480, width: 200 / 640, height: 240 / 480 },
  quality: {
    confidence: 0.95,
    faceVisible: true,
    frontalScore: 0.95,
    stabilityScore: 0.95,
    warnings: [],
  },
};

// Host-owned sample catalog; these are not commercial SKUs.
export const ownInventory: GlassesItem[] = [
  {
    id: "sample-rectangle",
    name: "Sample Rectangle",
    thumbnailUrl: "/frames/rectangle.svg",
    shapeCategory: "rectangle",
    brand: "Example",
    dimensions: { frameWidthMm: 140, lensWidthMm: 50 },
    price: 120,
  },
  {
    id: "sample-round",
    name: "Sample Round",
    thumbnailUrl: "/frames/round.svg",
    shapeCategory: "round",
    price: 150,
  },
  {
    id: "sample-over-budget",
    name: "Sample Premium",
    thumbnailUrl: "/frames/premium.svg",
    shapeCategory: "aviator",
    price: 400,
  },
];

export function runSharedCoreExample() {
  const faceShape = new FaceShapeScorer().score(syntheticFaceInput);
  const ranked = new Recommender().recommend({
    faceShape,
    inventory: ownInventory,
    preferences: { brands: ["Example"], maxPrice: 200 },
    // No physical measurement was supplied. Size must remain unavailable.
  });
  return { faceShape, ranked };
}
