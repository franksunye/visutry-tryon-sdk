/**
 * VisuTry SDK — Face Shape Analysis Demo
 *
 * Upload a photo and get a detailed face shape analysis report using the SDK's
 * image-mode analysis pipeline. This demo mirrors the visutry main site's
 * report format for head-to-head comparison.
 */

import { createVisuTryImageAnalyzer, LandmarkOverlay } from "@visutry/tryon-web";
import type { FaceShapeResult, FaceShape } from "@visutry/tryon-core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHAPE_DISPLAY: Record<string, { en: string; zh: string; icon: string }> = {
  oval: { en: "Oval", zh: "椭圆形脸", icon: "🥚" },
  round: { en: "Round", zh: "圆形脸", icon: "⭕" },
  square: { en: "Square", zh: "方形脸", icon: "⬜" },
  heart: { en: "Heart", zh: "心形脸", icon: "💜" },
  diamond: { en: "Diamond", zh: "钻石形脸", icon: "💎" },
  oblong: { en: "Oblong", zh: "长形脸", icon: "📐" },
  triangle: { en: "Triangle", zh: "三角形脸", icon: "🔻" },
  unknown: { en: "Unknown", zh: "无法确定", icon: "❓" },
};

const FRAME_RECOMMENDATIONS: Record<string, Array<{ name: string; reason: string }>> = {
  oval: [
    { name: "Most frame styles", reason: "Oval suits almost any frame shape" },
    { name: "Walnut-shaped frames", reason: "Maintains natural balance" },
    { name: "Geometric frames", reason: "Adds visual interest" },
  ],
  round: [
    { name: "Rectangular frames", reason: "Adds angles to soften roundness" },
    { name: "Angular frames", reason: "Creates lengthening effect" },
    { name: "Cat-eye frames", reason: "Lifts and defines" },
  ],
  square: [
    { name: "Round frames", reason: "Softens angular features" },
    { name: "Oval frames", reason: "Balances strong jawline" },
    { name: "Rimless frames", reason: "Minimizes hardness" },
  ],
  heart: [
    { name: "Bottom-heavy frames", reason: "Balances narrow chin" },
    { name: "Round frames", reason: "Soften forehead width" },
    { name: "Low-set temples", reason: "Draw attention downward" },
  ],
  diamond: [
    { name: "Oval frames", reason: "Highlights cheekbones" },
    { name: "Cat-eye frames", reason: "Lifts and defines eyes" },
    { name: "Rimless frames", reason: "Minimizes facial width" },
  ],
  oblong: [
    { name: "Oversized frames", reason: "Adds width to long face" },
    { name: "Deep frames", reason: "Breaks up facial length" },
    { name: "Decorative temples", reason: "Adds width visually" },
  ],
  triangle: [
    { name: "Top-heavy frames", reason: "Balances wide jawline" },
    { name: "Cat-eye frames", reason: "Draws attention upward" },
    { name: "Bold upper rims", reason: "Adds forehead emphasis" },
  ],
  unknown: [
    { name: "Classic oval frames", reason: "A safe, versatile choice" },
    { name: "Rectangular frames", reason: "Works with most face shapes" },
    { name: "Round frames", reason: "Softens any angularity" },
  ],
};

const WARNING_DISPLAY: Record<string, string> = {
  LOW_CONFIDENCE: "Low detection confidence — results may be unreliable",
  NOT_FRONTAL: "Face is not fully frontal — please use a straight-on photo",
  FACE_TOO_SMALL: "Face is too small in the image — move closer",
  FACE_TOO_CLOSE: "Face is too close to the camera — move back slightly",
  LOW_LIGHT: "Lighting is too low — use a well-lit environment",
  OCCLUDED: "Face may be partially occluded — ensure full visibility",
  UNSTABLE: "Detection is unstable — try holding the camera steadier",
  MISSING_KEY_POINTS: "Some key facial points are missing — use a clearer photo",
  EXCESSIVE_TILT: "Head is tilted too much — keep your eyes level",
  ASYMMETRIC_FACE: "Face appears asymmetric — try centering your face",
  MULTIPLE_FACES: "Multiple faces detected — use a photo with only one person",
};

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
};

const uploadSection = $("upload-section");
const dropZone = $("drop-zone");
const fileInput = $("file-input") as HTMLInputElement;
const loadingSection = $("loading-section");
const loadingMessage = $("loading-message");
const errorSection = $("error-section");
const errorMessage = $("error-message");
const reportSection = $("report-section");
const uploadedPhoto = $("uploaded-photo") as HTMLImageElement;
const primaryShape = $("primary-shape");
const confidenceBar = $("confidence-bar");
const confidenceText = $("confidence-text");
const candidatesList = $("candidates-list");
const metricsGrid = $("metrics-grid");
const qualityCard = $("quality-card");
const qualityList = $("quality-list");
const recommendationsList = $("recommendations-list");
const analyzeAnother = $("analyze-another");
const retryBtn = $("retry-btn");
const toast = $("toast");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let imageAnalyzer: ReturnType<typeof createVisuTryImageAnalyzer> | null = null;

// ---------------------------------------------------------------------------
// File handling
// ---------------------------------------------------------------------------

function setupFileHandlers(): void {
  dropZone.addEventListener("click", () => fileInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFile(file);
  });
}

async function handleFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    showToast("Please upload an image file (JPG or PNG)");
    return;
  }

  // Show loading
  uploadSection.classList.add("hidden");
  errorSection.classList.add("hidden");
  reportSection.classList.add("hidden");
  loadingSection.classList.remove("hidden");
  loadingMessage.textContent = "Loading face detection model...";

  try {
    // Load the image into an HTMLImageElement
    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgUrl;
    await img.decode();

    // Lazy-init the analyzer
    if (!imageAnalyzer) {
      imageAnalyzer = createVisuTryImageAnalyzer();
    }

    loadingMessage.textContent = "Analyzing face shape...";

    // Run analysis
    const result = await imageAnalyzer.analyzeFaceShapeFromImage(img);

    // Render landmark mesh overlay on the photo
    const face = imageAnalyzer.getLastFaceResult();
    const landmarkCanvas = document.getElementById("landmark-canvas") as HTMLCanvasElement;
    if (face && landmarkCanvas && face.landmarks.connections) {
      const overlay = new LandmarkOverlay(landmarkCanvas);
      // Use a small timeout to let the image render first
      requestAnimationFrame(() => {
        overlay.renderFromFace(face, img.naturalWidth, img.naturalHeight);
      });
    }

    // Display report
    uploadedPhoto.src = imgUrl;
    showReport(result);

  } catch (err) {
    console.error("Analysis error:", err);
    let msg: string;
    if (err && typeof err === "object" && "code" in err) {
      const sdkErr = err as { code: string; message?: string; cause?: { message?: string } };
      msg = `${sdkErr.code}: ${sdkErr.message ?? "Unknown error"}`;
      if (sdkErr.cause?.message) msg += `\nCause: ${sdkErr.cause.message}`;
    } else if (err instanceof Error) {
      msg = err.message;
    } else {
      msg = "Analysis failed — please check console for details";
    }
    showError(msg);
  } finally {
    loadingSection.classList.add("hidden");
  }
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function showReport(result: FaceShapeResult): void {
  reportSection.classList.remove("hidden");

  // Primary shape
  const display = SHAPE_DISPLAY[result.primary] ?? SHAPE_DISPLAY.unknown;
  primaryShape.textContent = `${display.zh} (${display.en})`;
  const confPct = Math.round(result.confidence * 100);
  confidenceBar.style.width = `${confPct}%`;
  confidenceText.textContent = `置信度: ${confPct}%`;

  // Candidates with bars
  candidatesList.innerHTML = "";
  const maxScore = Math.max(...result.candidates.map((c) => c.score), 0.01);
  result.candidates.forEach((candidate) => {
    const d = SHAPE_DISPLAY[candidate.shape] ?? SHAPE_DISPLAY.unknown;
    const pct = (candidate.score * 100).toFixed(1);
    const barPct = (candidate.score / maxScore * 100).toFixed(0);

    const row = document.createElement("div");
    row.className = "candidate-row";

    const name = document.createElement("span");
    name.className = "candidate-name";
    name.textContent = `${d.icon} ${d.zh}`;
    row.appendChild(name);

    const bar = document.createElement("div");
    bar.className = "candidate-bar";
    const fill = document.createElement("div");
    fill.className = "candidate-bar-fill";
    fill.style.width = `${barPct}%`;
    // Color: green for top, yellow for mid, gray for low
    if (candidate.score >= 0.3) fill.style.background = "#B8F44B";
    else if (candidate.score >= 0.1) fill.style.background = "#FFDF4D";
    else fill.style.background = "#EDEDED";
    bar.appendChild(fill);
    row.appendChild(bar);

    const score = document.createElement("span");
    score.className = "candidate-score";
    score.textContent = `${pct}%`;
    row.appendChild(score);

    candidatesList.appendChild(row);
  });

  // Geometric metrics
  const m = result.metrics;
  metricsGrid.innerHTML = "";
  const metrics: Array<[string, string]> = [
    ["脸宽 (Face Width)", m.faceWidth?.toFixed(3) ?? "—"],
    ["脸高 (Face Height)", m.faceHeight?.toFixed(3) ?? "—"],
    ["颧骨宽 (Cheekbone)", m.cheekboneWidth?.toFixed(3) ?? "—"],
    ["下颌宽 (Jaw Width)", m.jawWidth?.toFixed(3) ?? "—"],
    ["额头宽 (Forehead)", m.foreheadWidth?.toFixed(3) ?? "—"],
    ["脸最宽 (Face Outline)", m.faceOutlineWidth?.toFixed(3) ?? "—"],
    ["鼻梁宽 (Nose Bridge)", m.noseBridgeWidth?.toFixed(3) ?? "—"],
    ["外眼距 (Eye Outer)", m.eyeOuterDistance?.toFixed(3) ?? "—"],
    ["宽高比 (W/H Ratio)", m.widthHeightRatio?.toFixed(3) ?? "—"],
    ["下颌/颧骨 (Jaw/Cheek)", m.jawCheekRatio?.toFixed(3) ?? "—"],
    ["额头/颧骨 (Forehead/Cheek)", m.foreheadCheekRatio?.toFixed(3) ?? "—"],
    ["下巴类型 (Chin Type)", m.chinType ?? "—"],
    ["眼线倾斜 (Eye Tilt°)", m.eyeLineTiltDeg?.toFixed(1) ?? "—"],
    ["对称偏移 (Symmetry)", m.symmetryOffset?.toFixed(3) ?? "—"],
    ["人脸跨度 (Face Span)", m.faceSpan?.toFixed(3) ?? "—"],
    ["测量质量 (Quality)", m.measurementQuality != null ? `${(m.measurementQuality * 100).toFixed(0)}%` : "—"],
  ];

  metrics.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "metric-item";

    const labelEl = document.createElement("span");
    labelEl.className = "metric-label";
    labelEl.textContent = label;
    item.appendChild(labelEl);

    const valueEl = document.createElement("span");
    valueEl.className = "metric-value";
    valueEl.textContent = value;
    item.appendChild(valueEl);

    metricsGrid.appendChild(item);
  });

  // Quality warnings
  if (result.warnings && result.warnings.length > 0) {
    qualityList.innerHTML = "";
    result.warnings.forEach((w) => {
      const li = document.createElement("li");
      li.textContent = WARNING_DISPLAY[w] ?? w;
      qualityList.appendChild(li);
    });
    qualityCard.classList.remove("hidden");
  } else {
    qualityCard.classList.add("hidden");
  }

  // Frame recommendations
  const recs = FRAME_RECOMMENDATIONS[result.primary] ?? FRAME_RECOMMENDATIONS.unknown;
  recommendationsList.innerHTML = "";
  recs.forEach((rec, i) => {
    const item = document.createElement("div");
    item.className = "rec-item";

    const rank = document.createElement("div");
    rank.className = `rec-rank ${i === 0 ? "top" : i === 1 ? "mid" : "low"}`;
    rank.textContent = String(i + 1);
    item.appendChild(rank);

    const nameCol = document.createElement("div");
    nameCol.style.flex = "1";
    const nameEl = document.createElement("div");
    nameEl.className = "rec-name";
    nameEl.textContent = rec.name;
    nameCol.appendChild(nameEl);
    const reasonEl = document.createElement("div");
    reasonEl.className = "rec-reason";
    reasonEl.textContent = rec.reason;
    nameCol.appendChild(reasonEl);
    item.appendChild(nameCol);

    recommendationsList.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showError(msg: string): void {
  errorMessage.textContent = msg;
  errorSection.classList.remove("hidden");
  uploadSection.classList.add("hidden");
}

function showToast(msg: string): void {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}

function resetToUpload(): void {
  reportSection.classList.add("hidden");
  errorSection.classList.add("hidden");
  loadingSection.classList.add("hidden");
  uploadSection.classList.remove("hidden");
  fileInput.value = "";
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

setupFileHandlers();

analyzeAnother.addEventListener("click", resetToUpload);
retryBtn.addEventListener("click", resetToUpload);

window.addEventListener("beforeunload", () => {
  imageAnalyzer?.destroy();
});
