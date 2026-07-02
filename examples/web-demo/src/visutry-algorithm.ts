/**
 * Port of visutry main site's classifyFaceGeometry algorithm.
 * This is the exact same algorithm from /Users/yesun/Code/visutry/src/lib/face-landmark-metrics.ts
 * Used for head-to-head comparison with the SDK's FaceShapeScorer.
 */

export interface VisutryFaceGeometryRatios {
  faceAspectRatio: number;
  cheekToFaceWidth: number;
  jawToCheekWidth: number;
  foreheadToCheekWidth: number;
  eyeLineTiltDeg: number;
  symmetryOffset: number;
  noseBridgeToFaceWidth: number;
}

export interface VisutryGeometryAnalysis {
  version: "landmark-v1";
  status: "measured" | "unavailable";
  source: string;
  faceDetected: boolean;
  faceCount: number;
  qualityScore: number;
  primaryShape: string;
  confidence: number;
  ratios: VisutryFaceGeometryRatios;
  signals: string[];
  warnings: string[];
}

const FACE_MESH_INDEX = {
  top: 10, chin: 152,
  leftFace: 234, rightFace: 454,
  leftCheek: 123, rightCheek: 352,
  leftJaw: 172, rightJaw: 397,
  leftForehead: 103, rightForehead: 332,
  leftEyeOuter: 33, rightEyeOuter: 263,
  noseLeft: 98, noseRight: 327,
  noseBridge: 168,
} as const;

const MIN_FACE_MESH_POINTS = 455;
const MIN_FACE_SPAN = 0.16;
const MAX_EYE_LINE_TILT_DEG = 15;
const MAX_SYMMETRY_OFFSET = 0.14;

type Landmark = { x: number; y: number; z?: number };

function dist2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function analyzeFaceLandmarks(
  landmarks: Landmark[],
  imageWidth: number,
  imageHeight: number,
): VisutryGeometryAnalysis | null {
  if (!landmarks || landmarks.length < MIN_FACE_MESH_POINTS) return null;

  const pt = (idx: number) => landmarks[idx];
  const top = pt(FACE_MESH_INDEX.top);
  const chin = pt(FACE_MESH_INDEX.chin);
  const leftFace = pt(FACE_MESH_INDEX.leftFace);
  const rightFace = pt(FACE_MESH_INDEX.rightFace);
  const leftCheek = pt(FACE_MESH_INDEX.leftCheek);
  const rightCheek = pt(FACE_MESH_INDEX.rightCheek);
  const leftJaw = pt(FACE_MESH_INDEX.leftJaw);
  const rightJaw = pt(FACE_MESH_INDEX.rightJaw);
  const leftForehead = pt(FACE_MESH_INDEX.leftForehead);
  const rightForehead = pt(FACE_MESH_INDEX.rightForehead);
  const leftEyeOuter = pt(FACE_MESH_INDEX.leftEyeOuter);
  const rightEyeOuter = pt(FACE_MESH_INDEX.rightEyeOuter);
  const noseLeft = pt(FACE_MESH_INDEX.noseLeft);
  const noseRight = pt(FACE_MESH_INDEX.noseRight);
  const noseBridge = pt(FACE_MESH_INDEX.noseBridge);

  // Scale to pixel coords for distance calculations
  const sx = imageWidth;
  const sy = imageHeight;

  const faceWidth = dist2D(leftFace, rightFace) * sx;
  const faceHeight = dist2D(top, chin) * sy;
  const cheekWidth = dist2D(leftCheek, rightCheek) * sx;
  const jawWidth = dist2D(leftJaw, rightJaw) * sx;
  const foreheadWidth = dist2D(leftForehead, rightForehead) * sx;
  const noseBridgeWidth = dist2D(noseLeft, noseRight) * sx;

  if (faceWidth < 1e-6 || faceHeight < 1e-6) return null;

  const faceAspectRatio = faceHeight / faceWidth;
  const cheekToFaceWidth = cheekWidth / faceWidth;
  const jawToCheekWidth = cheekWidth > 1e-6 ? jawWidth / cheekWidth : 0;
  const foreheadToCheekWidth = cheekWidth > 1e-6 ? foreheadWidth / cheekWidth : 0;

  // Eye line tilt
  const dx = (rightEyeOuter.x - leftEyeOuter.x) * sx;
  const dy = (rightEyeOuter.y - leftEyeOuter.y) * sy;
  const eyeLineTiltDeg = Math.abs(dx) > 1e-6
    ? Math.atan2(dy, dx) * (180 / Math.PI)
    : 0;

  // Symmetry offset
  const faceCenterX = (leftFace.x + rightFace.x) / 2;
  const symmetryOffset = faceWidth > 1e-6
    ? Math.abs(noseBridge.x - faceCenterX) * sx / faceWidth
    : 0;

  const noseBridgeToFaceWidth = faceWidth > 1e-6 ? noseBridgeWidth / faceWidth : 0;

  const ratios: VisutryFaceGeometryRatios = {
    faceAspectRatio,
    cheekToFaceWidth,
    jawToCheekWidth,
    foreheadToCheekWidth,
    eyeLineTiltDeg,
    symmetryOffset,
    noseBridgeToFaceWidth,
  };

  // Face span check
  const span = Math.max(faceWidth / sx, faceHeight / sy);
  if (span < MIN_FACE_SPAN) {
    return {
      version: "landmark-v1",
      status: "unavailable",
      source: "mediapipe-face-landmarker",
      faceDetected: true,
      faceCount: 1,
      qualityScore: 0,
      primaryShape: "unknown",
      confidence: 0,
      ratios,
      signals: [],
      warnings: ["Face too small in image"],
    };
  }

  // Tilt check
  if (Math.abs(eyeLineTiltDeg) > MAX_EYE_LINE_TILT_DEG) {
    return {
      version: "landmark-v1",
      status: "unavailable",
      source: "mediapipe-face-landmarker",
      faceDetected: true,
      faceCount: 1,
      qualityScore: 0,
      primaryShape: "unknown",
      confidence: 0,
      ratios,
      signals: [],
      warnings: [`Head tilted ${Math.abs(eyeLineTiltDeg).toFixed(1)}° (max ${MAX_EYE_LINE_TILT_DEG}°)`],
    };
  }

  // Symmetry check
  if (symmetryOffset > MAX_SYMMETRY_OFFSET) {
    return {
      version: "landmark-v1",
      status: "unavailable",
      source: "mediapipe-face-landmarker",
      faceDetected: true,
      faceCount: 1,
      qualityScore: 0,
      primaryShape: "unknown",
      confidence: 0,
      ratios,
      signals: [],
      warnings: [`Face asymmetry ${symmetryOffset.toFixed(2)} (max ${MAX_SYMMETRY_OFFSET})`],
    };
  }

  // Quality score
  const qualityScore = clamp(
    96 - Math.abs(eyeLineTiltDeg) * 2.2 - symmetryOffset * 180,
    45,
    96,
  );

  // Classify
  const result = classifyFaceGeometry(ratios);

  return {
    version: "landmark-v1",
    status: "measured",
    source: "mediapipe-face-landmarker",
    faceDetected: true,
    faceCount: 1,
    qualityScore: Math.round(qualityScore),
    primaryShape: result.primary,
    confidence: result.confidence,
    ratios,
    signals: result.signals,
    warnings: [],
  };
}

function classifyFaceGeometry(ratios: VisutryFaceGeometryRatios): {
  primary: string;
  confidence: number;
  signals: string[];
} {
  const { faceAspectRatio, jawToCheekWidth, foreheadToCheekWidth } = ratios;

  const scores: Record<string, number> = {
    round: 0, square: 0, oval: 0, heart: 0, diamond: 0, oblong: 0, triangle: 0,
  };
  const signals: string[] = [];

  // Aspect ratio scoring
  if (faceAspectRatio >= 1.42) {
    scores.oblong += 4;
    signals.push(`Long face (ratio ${faceAspectRatio.toFixed(2)})`);
  } else if (faceAspectRatio >= 1.27) {
    scores.oval += 3;
    signals.push(`Oval proportion (ratio ${faceAspectRatio.toFixed(2)})`);
  } else if (faceAspectRatio < 1.2) {
    scores.round += 2;
    signals.push(`Round proportion (ratio ${faceAspectRatio.toFixed(2)})`);
  }

  // Square detection
  if (faceAspectRatio < 1.18 && jawToCheekWidth >= 0.86) {
    scores.square += 3;
    signals.push(`Square jaw (jcr ${jawToCheekWidth.toFixed(2)})`);
  }
  if (jawToCheekWidth >= 0.92 && foreheadToCheekWidth >= 0.9) {
    scores.square += 3;
    signals.push(`Strong jaw + broad forehead`);
  }

  // Heart detection
  if (jawToCheekWidth < 0.76 && foreheadToCheekWidth >= 0.84) {
    scores.heart += 4;
    signals.push(`Heart: narrow jaw + broad forehead`);
  }

  // Diamond detection
  if (jawToCheekWidth < 0.78 && foreheadToCheekWidth < 0.84) {
    scores.diamond += 4;
    signals.push(`Diamond: narrow jaw + narrow forehead`);
  }

  // Triangle detection
  if (jawToCheekWidth > 0.98 && foreheadToCheekWidth < 0.88) {
    scores.triangle += 4;
    signals.push(`Triangle: wide jaw + narrow forehead`);
  }

  // Additional oval/round nuance
  if (jawToCheekWidth >= 0.78 && jawToCheekWidth <= 0.9 && faceAspectRatio >= 1.2) {
    scores.oval += 2;
  }
  if (jawToCheekWidth >= 0.82 && jawToCheekWidth <= 0.94 && faceAspectRatio < 1.22) {
    scores.round += 2;
  }

  // Pick winner
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  const second = sorted[1] ?? ["none", 0];
  const margin = best[1] - second[1];

  const confidence = clamp(
    0.56 + best[1] * 0.065 + margin * 0.035,
    0.58,
    0.93,
  );

  return { primary: best[0], confidence, signals };
}
