import type {
  FaceSemanticPoints,
  NormalizedFaceResult,
  Point3D,
  GlassesAssetManifest,
} from "../types/index.js";
import { MEDIAPIPE_SEMANTIC_INDEX_MAP } from "../face/FaceSemanticMapper.js";

/**
 * Build a synthetic `FaceSemanticPoints` representing a specific face shape.
 * Coordinates are in normalized image space (origin top-left, y down).
 *
 * The geometry is constructed so each shape exhibits the discriminating
 * feature ratios the scorer relies on (width/height, jaw/cheek,
 * jaw/eye-outer, eye-outer/cheek, chin type).
 */
export function buildSemanticPoints(
  shape: "oval" | "round" | "square" | "heart" | "diamond" | "oblong",
): FaceSemanticPoints {
  const cx = 0.5;
  const cy = 0.5;

  // Eye geometry (symmetric, level by default).
  const eyeHalfSpan = 0.12; // outer corner half-span → eyeOuterDistance = 0.24
  const eyeInnerOffset = 0.04;
  const eyeY = cy - 0.08; // 0.42

  const leftEyeOuter: Point3D = { x: cx - eyeHalfSpan, y: eyeY, z: -0.02 };
  const leftEyeInner: Point3D = { x: cx - eyeInnerOffset, y: eyeY, z: -0.02 };
  const rightEyeInner: Point3D = { x: cx + eyeInnerOffset, y: eyeY, z: -0.02 };
  const rightEyeOuter: Point3D = { x: cx + eyeHalfSpan, y: eyeY, z: -0.02 };

  const leftEyeCenter = { x: (leftEyeOuter.x + leftEyeInner.x) / 2, y: eyeY, z: -0.02 };
  const rightEyeCenter = { x: (rightEyeInner.x + rightEyeOuter.x) / 2, y: eyeY, z: -0.02 };
  const eyesCenter = { x: cx, y: eyeY, z: -0.02 };

  const noseBridge: Point3D = { x: cx, y: cy - 0.02, z: -0.03 };
  const noseTip: Point3D = { x: cx, y: cy + 0.04, z: -0.08 };
  const foreheadCenter: Point3D = { x: cx, y: cy - 0.18, z: -0.02 }; // y = 0.32

  // Per-shape jaw / cheek geometry, tuned to hit target feature ratios.
  //   faceWidth = cheekboneWidth = 2 * cheekHalf
  //   jawWidth  = 2 * jawHalf
  //   faceHeight = chinY - 0.32
  //   whr = cheekboneWidth / faceHeight
  //   jcr = jawWidth / cheekboneWidth
  let cheekHalf = 0.15;
  let jawHalf = 0.12;
  let chinY = cy + 0.195; // 0.695
  let browHalf = 0.07;
  // visutry additions: face outline, forehead, nose wing half-widths
  let faceHalf = 0.16;   // leftFace/rightFace
  let foreheadHalf = 0.14; // leftForehead/rightForehead
  let noseHalf = 0.05;   // noseLeft/noseRight

  switch (shape) {
    case "oval": // whr~0.80, jcr~0.80, rounded chin
      cheekHalf = 0.15;
      jawHalf = 0.12;
      chinY = 0.695;
      faceHalf = 0.155;
      foreheadHalf = 0.135;
      noseHalf = 0.045;
      break;
    case "round": // whr~0.96, jcr~0.91, rounded chin
      cheekHalf = 0.16;
      jawHalf = 0.1455;
      chinY = 0.653;
      faceHalf = 0.165;
      foreheadHalf = 0.15;
      noseHalf = 0.05;
      break;
    case "square": // whr~0.85, jcr~0.93, square chin
      cheekHalf = 0.156;
      jawHalf = 0.145;
      chinY = 0.687;
      faceHalf = 0.158;
      foreheadHalf = 0.148; // broad forehead (fcr ~0.95, not triangle)
      noseHalf = 0.048;
      break;
    case "heart": // whr~0.80, jcr~0.58, pointed chin, upper wide
      cheekHalf = 0.12;
      jawHalf = 0.0695;
      chinY = 0.62;
      browHalf = 0.09;
      faceHalf = 0.125;
      foreheadHalf = 0.13; // broad forehead (fcr > 0.9)
      noseHalf = 0.04;
      break;
    case "diamond": // whr~0.75, jcr~0.64, pointed chin, cheek dominant
      cheekHalf = 0.171;
      jawHalf = 0.11;
      chinY = 0.777;
      faceHalf = 0.175;
      foreheadHalf = 0.12; // narrow forehead (fcr < 0.8)
      noseHalf = 0.042;
      break;
    case "oblong": // whr~0.66, jcr~0.82, rounded chin
      cheekHalf = 0.1395;
      jawHalf = 0.115;
      chinY = 0.743;
      faceHalf = 0.142;
      foreheadHalf = 0.13;
      noseHalf = 0.044;
      break;
  }

  const leftCheek: Point3D = { x: cx - cheekHalf, y: cy + 0.02, z: -0.03 };
  const rightCheek: Point3D = { x: cx + cheekHalf, y: cy + 0.02, z: -0.03 };
  const leftJaw: Point3D = { x: cx - jawHalf, y: cy + 0.13, z: -0.02 };
  const rightJaw: Point3D = { x: cx + jawHalf, y: cy + 0.13, z: -0.02 };
  const chin: Point3D = { x: cx, y: chinY, z: -0.04 };

  return {
    leftEyeOuter,
    leftEyeInner,
    rightEyeInner,
    rightEyeOuter,
    leftEyeCenter,
    rightEyeCenter,
    eyesCenter,
    noseBridge,
    noseTip,
    leftBrowCenter: { x: cx - browHalf, y: eyeY - 0.04, z: -0.02 },
    rightBrowCenter: { x: cx + browHalf, y: eyeY - 0.04, z: -0.02 },
    foreheadCenter,
    chin,
    leftCheek,
    rightCheek,
    leftJaw,
    rightJaw,
    // visutry additions
    leftFace: { x: cx - faceHalf, y: cy, z: -0.01 },
    rightFace: { x: cx + faceHalf, y: cy, z: -0.01 },
    leftForehead: { x: cx - foreheadHalf, y: cy - 0.14, z: -0.02 },
    rightForehead: { x: cx + foreheadHalf, y: cy - 0.14, z: -0.02 },
    noseLeft: { x: cx - noseHalf, y: cy, z: -0.03 },
    noseRight: { x: cx + noseHalf, y: cy, z: -0.03 },
  };
}

export function buildFaceResult(
  semantic: FaceSemanticPoints,
  overrides: Partial<NormalizedFaceResult> = {},
): NormalizedFaceResult {
  const raw: Point3D[] = [];
  const maxIndex = Math.max(
    ...Object.values(MEDIAPIPE_SEMANTIC_INDEX_MAP).filter((v): v is number => v !== undefined),
  );
  for (let i = 0; i <= maxIndex; i++) raw.push({ x: 0.5, y: 0.5, z: 0 });
  for (const [key, idx] of Object.entries(MEDIAPIPE_SEMANTIC_INDEX_MAP)) {
    const pt = semantic[key as keyof FaceSemanticPoints];
    if (pt && idx !== undefined) raw[idx] = { ...pt };
  }

  return {
    source: "mediapipe",
    timestamp: Date.now(),
    landmarks: {
      raw,
      normalized: raw,
      semantic,
    },
    pose: {
      yaw: 0,
      pitch: 0,
      roll: 0,
      confidence: 0.95,
      ...overrides.pose,
    },
    bbox: { x: 0.2, y: 0.15, width: 0.6, height: 0.7, ...overrides.bbox },
    quality: {
      confidence: 0.92,
      faceVisible: true,
      frontalScore: 0.9,
      stabilityScore: 0.85,
      warnings: [],
      ...overrides.quality,
    },
    ...overrides,
  };
}

export function buildManifest(overrides: Partial<GlassesAssetManifest> = {}): GlassesAssetManifest {
  return {
    id: "test-glasses",
    name: "Test Glasses",
    modelUrl: "https://example.com/glasses.glb",
    format: "glb",
    coordinateSystem: {
      unit: "millimeter",
      forwardAxis: "+z",
      upAxis: "+y",
    },
    dimensions: {
      frameWidthMm: 140,
      lensWidthMm: 50,
      lensHeightMm: 40,
      bridgeWidthMm: 20,
      templeLengthMm: 140,
    },
    anchors: {
      origin: { x: 0, y: 0, z: 0 },
      noseBridge: { x: 0, y: 0, z: 0 },
      leftHinge: { x: -70, y: 0, z: 0 },
      rightHinge: { x: 70, y: 0, z: 0 },
    },
    fitting: {
      defaultScale: 1,
      defaultOffset: { x: 0, y: 0, z: 0 },
      defaultRotation: { x: 0, y: 0, z: 0 },
      minScale: 0.2,
      maxScale: 3,
    },
    material: {
      lensOpacity: 0.5,
      frameRoughness: 0.4,
      supportsTransparency: true,
    },
    metadata: {
      brand: "VisuTry",
      shapeCategory: "rectangle",
      colors: ["black"],
      tags: ["demo"],
    },
    ...overrides,
  };
}
