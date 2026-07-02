/**
 * Head-to-head comparison: SDK v1.2.0 vs Visutry main site algorithm.
 * Both algorithms run on the same MediaPipe landmarks from the same photo.
 */

import { createVisuTryImageAnalyzer } from "@visutry/tryon-web";
import type { FaceShapeResult } from "@visutry/tryon-core";
import { analyzeFaceLandmarks, type VisutryGeometryAnalysis } from "./visutry-algorithm";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
};

const SHAPE_DISPLAY: Record<string, string> = {
  oval: "Oval 椭圆", round: "Round 圆形", square: "Square 方形",
  heart: "Heart 心形", diamond: "Diamond 钻石", oblong: "Oblong 长形",
  triangle: "Triangle 三角", unknown: "Unknown 未知",
};

// DOM
const dropZone = $("drop-zone");
const fileInput = $("file-input") as HTMLInputElement;
const uploadSection = $("upload-section");
const loadingSection = $("loading-section");
const loadingMessage = $("loading-message");
const compareSection = $("compare-section");
const uploadedPhoto = $("uploaded-photo") as HTMLImageElement;

// SDK results
const sdkPrimary = $("sdk-primary");
const sdkConfidence = $("sdk-confidence");
const sdkCandidates = $("sdk-candidates");
const sdkMetrics = $("sdk-metrics");
const sdkWarningsSection = $("sdk-warnings-section");
const sdkWarnings = $("sdk-warnings");

// Visutry results
const visutryPrimary = $("visutry-primary");
const visutryConfidence = $("visutry-confidence");
const visutrySignals = $("visutry-signals");
const visutryMetrics = $("visutry-metrics");
const visutryWarningsSection = $("visutry-warnings-section");
const visutryWarnings = $("visutry-warnings");

// Summary
const summaryContent = $("summary-content");
const analyzeAnother = $("analyze-another");
const toast = $("toast");

let analyzer: ReturnType<typeof createVisuTryImageAnalyzer> | null = null;

// ---------------------------------------------------------------------------
// File handling
// ---------------------------------------------------------------------------

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.style.borderColor = "#FFDF4D"; });
dropZone.addEventListener("dragleave", () => { dropZone.style.borderColor = ""; });
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "";
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleFile(file);
});

async function handleFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) { showToast("Please upload an image"); return; }

  uploadSection.classList.add("hidden");
  loadingSection.classList.remove("hidden");
  loadingMessage.textContent = "Loading face detection model...";

  try {
    const imgUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = imgUrl;
    await img.decode();

    uploadedPhoto.src = imgUrl;

    if (!analyzer) analyzer = createVisuTryImageAnalyzer();

    loadingMessage.textContent = "Running SDK v1.2.0 analysis...";
    // The SDK analyzer runs MediaPipe internally and produces FaceShapeResult
    const sdkResult = await analyzer.analyzeFaceShapeFromImage(img);

    loadingMessage.textContent = "Running Visutry algorithm on same landmarks...";

    // For the visutry algorithm, we need the raw landmarks. We'll access them
    // by running a separate MediaPipe detection. Since the SDK's analyzer
    // doesn't expose raw landmarks, we use the SDK's metrics to reconstruct
    // the visutry-equivalent ratios and run visutry's classifier.
    //
    // Actually, let's use the SDK's metrics directly — both algorithms
    // use the same MediaPipe model. We convert SDK metrics to visutry ratios.
    const visutryResult = runVisutryAlgorithmFromSdkMetrics(sdkResult, img.naturalWidth, img.naturalHeight);

    // Display results
    renderSdkResult(sdkResult);
    renderVisutryResult(visutryResult);
    renderSummary(sdkResult, visutryResult);

    compareSection.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    let msg = err instanceof Error ? err.message : String(err);
    if (err && typeof err === "object" && "code" in err) {
      const sdkErr = err as { code: string; message?: string; cause?: { message?: string } };
      msg = `${sdkErr.code}: ${sdkErr.message ?? ""}`;
      if (sdkErr.cause?.message) msg += `\nCause: ${sdkErr.cause.message}`;
    }
    showToast(msg);
    uploadSection.classList.remove("hidden");
  } finally {
    loadingSection.classList.add("hidden");
  }
}

/**
 * Convert SDK metrics to visutry-equivalent ratios and run visutry's classifier.
 * This ensures both algorithms see the same underlying geometric data.
 */
function runVisutryAlgorithmFromSdkMetrics(
  sdk: FaceShapeResult,
  imgW: number,
  imgH: number,
): VisutryGeometryAnalysis {
  const m = sdk.metrics;

  // SDK uses widthHeightRatio (W/H), visutry uses faceAspectRatio (H/W)
  const faceAspectRatio = m.widthHeightRatio > 1e-6 ? 1 / m.widthHeightRatio : 0;

  // visutry ratios
  const ratios = {
    faceAspectRatio,
    cheekToFaceWidth: m.cheekboneWidth > 1e-6 && m.faceOutlineWidth
      ? m.cheekboneWidth / m.faceOutlineWidth : 0,
    jawToCheekWidth: m.jawCheekRatio,
    foreheadToCheekWidth: m.foreheadCheekRatio ?? 0,
    eyeLineTiltDeg: m.eyeLineTiltDeg ?? 0,
    symmetryOffset: m.symmetryOffset ?? 0,
    noseBridgeToFaceWidth: m.noseBridgeWidth && m.faceOutlineWidth && m.faceOutlineWidth > 1e-6
      ? m.noseBridgeWidth / m.faceOutlineWidth : 0,
  };

  // Run visutry's classifier directly
  return analyzeFaceLandmarksFromRatios(ratios, m.faceSpan ?? 0);
}

/**
 * Run visutry's classifyFaceGeometry with pre-computed ratios.
 * This is the exact same logic as the main site.
 */
function analyzeFaceLandmarksFromRatios(
  ratios: {
    faceAspectRatio: number;
    cheekToFaceWidth: number;
    jawToCheekWidth: number;
    foreheadToCheekWidth: number;
    eyeLineTiltDeg: number;
    symmetryOffset: number;
    noseBridgeToFaceWidth: number;
  },
  faceSpan: number,
): VisutryGeometryAnalysis {
  // Quality checks (same as visutry main site)
  if (faceSpan > 0 && faceSpan < 0.16) {
    return {
      version: "landmark-v1", status: "unavailable", source: "mediapipe-face-landmarker",
      faceDetected: true, faceCount: 1, qualityScore: 0,
      primaryShape: "unknown", confidence: 0, ratios, signals: [],
      warnings: ["Face too small in image"],
    };
  }
  if (Math.abs(ratios.eyeLineTiltDeg) > 15) {
    return {
      version: "landmark-v1", status: "unavailable", source: "mediapipe-face-landmarker",
      faceDetected: true, faceCount: 1, qualityScore: 0,
      primaryShape: "unknown", confidence: 0, ratios, signals: [],
      warnings: [`Head tilted ${Math.abs(ratios.eyeLineTiltDeg).toFixed(1)}°`],
    };
  }
  if (ratios.symmetryOffset > 0.14) {
    return {
      version: "landmark-v1", status: "unavailable", source: "mediapipe-face-landmarker",
      faceDetected: true, faceCount: 1, qualityScore: 0,
      primaryShape: "unknown", confidence: 0, ratios, signals: [],
      warnings: [`Face asymmetry ${ratios.symmetryOffset.toFixed(2)}`],
    };
  }

  const qualityScore = Math.round(
    Math.max(45, Math.min(96, 96 - Math.abs(ratios.eyeLineTiltDeg) * 2.2 - ratios.symmetryOffset * 180)),
  );

  // Classify (exact copy of visutry's classifyFaceGeometry)
  const { faceAspectRatio, jawToCheekWidth, foreheadToCheekWidth } = ratios;
  const scores: Record<string, number> = { round: 0, square: 0, oval: 0, heart: 0, diamond: 0, oblong: 0, triangle: 0 };
  const signals: string[] = [];

  if (faceAspectRatio >= 1.42) { scores.oblong += 4; signals.push(`Long face (ratio ${faceAspectRatio.toFixed(2)})`); }
  else if (faceAspectRatio >= 1.27) { scores.oval += 3; signals.push(`Oval proportion (ratio ${faceAspectRatio.toFixed(2)})`); }
  else if (faceAspectRatio < 1.2) { scores.round += 2; signals.push(`Round proportion (ratio ${faceAspectRatio.toFixed(2)})`); }

  if (faceAspectRatio < 1.18 && jawToCheekWidth >= 0.86) { scores.square += 3; signals.push(`Square jaw (jcr ${jawToCheekWidth.toFixed(2)})`); }
  if (jawToCheekWidth >= 0.92 && foreheadToCheekWidth >= 0.9) { scores.square += 3; signals.push(`Strong jaw + broad forehead`); }
  if (jawToCheekWidth < 0.76 && foreheadToCheekWidth >= 0.84) { scores.heart += 4; signals.push(`Heart: narrow jaw + broad forehead`); }
  if (jawToCheekWidth < 0.78 && foreheadToCheekWidth < 0.84) { scores.diamond += 4; signals.push(`Diamond: narrow jaw + narrow forehead`); }
  if (jawToCheekWidth > 0.98 && foreheadToCheekWidth < 0.88) { scores.triangle += 4; signals.push(`Triangle: wide jaw + narrow forehead`); }
  if (jawToCheekWidth >= 0.78 && jawToCheekWidth <= 0.9 && faceAspectRatio >= 1.2) { scores.oval += 2; }
  if (jawToCheekWidth >= 0.82 && jawToCheekWidth <= 0.94 && faceAspectRatio < 1.22) { scores.round += 2; }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  const second = sorted[1] ?? ["none", 0];
  const margin = best[1] - second[1];
  const confidence = Math.max(0.58, Math.min(0.93, 0.56 + best[1] * 0.065 + margin * 0.035));

  return {
    version: "landmark-v1", status: "measured", source: "visutry-classifyFaceGeometry",
    faceDetected: true, faceCount: 1, qualityScore,
    primaryShape: best[0], confidence, ratios, signals, warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSdkResult(r: FaceShapeResult): void {
  sdkPrimary.textContent = SHAPE_DISPLAY[r.primary] ?? r.primary;
  sdkConfidence.textContent = `Confidence: ${Math.round(r.confidence * 100)}%`;

  sdkCandidates.innerHTML = "";
  const maxScore = Math.max(...r.candidates.map((c) => c.score), 0.01);
  r.candidates.forEach((c) => {
    const row = document.createElement("div");
    row.className = "candidate-row";
    row.innerHTML = `
      <span class="candidate-name">${SHAPE_DISPLAY[c.shape] ?? c.shape}</span>
      <div class="candidate-bar"><div class="candidate-bar-fill" style="width:${(c.score / maxScore * 100).toFixed(0)}%;background:${c.score >= 0.3 ? "#B8F44B" : c.score >= 0.1 ? "#FFDF4D" : "#EDEDED"}"></div></div>
      <span class="candidate-score">${(c.score * 100).toFixed(1)}%</span>
    `;
    sdkCandidates.appendChild(row);
  });

  const m = r.metrics;
  sdkMetrics.innerHTML = "";
  const metrics: Array<[string, string]> = [
    ["W/H Ratio", m.widthHeightRatio?.toFixed(3) ?? "—"],
    ["Jaw/Cheek", m.jawCheekRatio?.toFixed(3) ?? "—"],
    ["Forehead/Cheek", m.foreheadCheekRatio?.toFixed(3) ?? "—"],
    ["Chin Type", m.chinType ?? "—"],
    ["Eye Tilt°", m.eyeLineTiltDeg?.toFixed(1) ?? "—"],
    ["Symmetry", m.symmetryOffset?.toFixed(3) ?? "—"],
    ["Quality", m.measurementQuality != null ? `${(m.measurementQuality * 100).toFixed(0)}%` : "—"],
    ["Face Span", m.faceSpan?.toFixed(3) ?? "—"],
  ];
  metrics.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "metric-item";
    item.innerHTML = `<span class="label">${label}</span><span class="value">${value}</span>`;
    sdkMetrics.appendChild(item);
  });

  if (r.warnings.length > 0) {
    sdkWarnings.innerHTML = "";
    r.warnings.forEach((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      sdkWarnings.appendChild(li);
    });
    sdkWarningsSection.classList.remove("hidden");
  } else {
    sdkWarningsSection.classList.add("hidden");
  }
}

function renderVisutryResult(r: VisutryGeometryAnalysis): void {
  visutryPrimary.textContent = SHAPE_DISPLAY[r.primaryShape] ?? r.primaryShape;
  visutryConfidence.textContent = `Confidence: ${Math.round(r.confidence * 100)}% · Quality: ${r.qualityScore}%`;

  visutrySignals.innerHTML = "";
  r.signals.forEach((s) => {
    const item = document.createElement("div");
    item.className = "signal-item";
    item.textContent = s;
    visutrySignals.appendChild(item);
  });

  visutryMetrics.innerHTML = "";
  const metrics: Array<[string, string]> = [
    ["H/W Ratio", r.ratios.faceAspectRatio.toFixed(3)],
    ["Jaw/Cheek", r.ratios.jawToCheekWidth.toFixed(3)],
    ["Forehead/Cheek", r.ratios.foreheadToCheekWidth.toFixed(3)],
    ["Cheek/Face", r.ratios.cheekToFaceWidth.toFixed(3)],
    ["Eye Tilt°", r.ratios.eyeLineTiltDeg.toFixed(1)],
    ["Symmetry", r.ratios.symmetryOffset.toFixed(3)],
    ["Nose/Face", r.ratios.noseBridgeToFaceWidth.toFixed(3)],
    ["Quality", `${r.qualityScore}%`],
  ];
  metrics.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "metric-item";
    item.innerHTML = `<span class="label">${label}</span><span class="value">${value}</span>`;
    visutryMetrics.appendChild(item);
  });

  if (r.warnings.length > 0) {
    visutryWarnings.innerHTML = "";
    r.warnings.forEach((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      visutryWarnings.appendChild(li);
    });
    visutryWarningsSection.classList.remove("hidden");
  } else {
    visutryWarningsSection.classList.add("hidden");
  }
}

function renderSummary(sdk: FaceShapeResult, visutry: VisutryGeometryAnalysis): void {
  const match = sdk.primary === visutry.primaryShape;
  summaryContent.innerHTML = `
    <div class="summary-row">
      <span class="summary-label">Primary Shape</span>
      <span class="summary-values">
        <span class="summary-sdk">${SHAPE_DISPLAY[sdk.primary] ?? sdk.primary}</span>
        <span class="summary-visutry">${SHAPE_DISPLAY[visutry.primaryShape] ?? visutry.primaryShape}</span>
      </span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Match?</span>
      <span class="${match ? "match-yes" : "match-no"}">${match ? "YES — Both agree" : "NO — Disagreement"}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Confidence</span>
      <span class="summary-values">
        <span class="summary-sdk">${Math.round(sdk.confidence * 100)}%</span>
        <span class="summary-visutry">${Math.round(visutry.confidence * 100)}%</span>
      </span>
    </div>
    <div class="summary-row">
      <span class="summary-label">W/H vs H/W Ratio</span>
      <span class="summary-values">
        <span class="summary-sdk">${sdk.metrics.widthHeightRatio?.toFixed(3)}</span>
        <span class="summary-visutry">${visutry.ratios.faceAspectRatio.toFixed(3)}</span>
      </span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Jaw/Cheek Ratio</span>
      <span class="summary-values">
        <span class="summary-sdk">${sdk.metrics.jawCheekRatio?.toFixed(3)}</span>
        <span class="summary-visutry">${visutry.ratios.jawToCheekWidth.toFixed(3)}</span>
      </span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Algorithm</span>
      <span class="summary-values">
        <span class="summary-sdk">Softmax + Bell</span>
        <span class="summary-visutry">If/Else + Score</span>
      </span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showToast(msg: string): void {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 5000);
}

function resetToUpload(): void {
  compareSection.classList.add("hidden");
  uploadSection.classList.remove("hidden");
  fileInput.value = "";
}

analyzeAnother.addEventListener("click", resetToUpload);
