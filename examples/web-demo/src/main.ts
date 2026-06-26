/**
 * VisuTry H5 Demo — Main Application
 *
 * Wires the @visutry/tryon-web SDK to a camera video + canvas overlay,
 * provides glasses switching, face shape analysis, snapshot, and
 * performance monitoring.
 */

import { createVisuTryWebSDK } from "@visutry/tryon-web";
import type { VisuTrySDK, GlassesAssetManifest, FaceShapeResult, PerformanceStats, GlassesItem } from "@visutry/tryon-core";
import { Recommender } from "@visutry/recommender";

// Import demo glasses manifests
import aviatorClassic from "../../../packages/demo-assets/glasses/aviator-classic.json";
import roundRetro from "../../../packages/demo-assets/glasses/round-retro.json";
import squareModern from "../../../packages/demo-assets/glasses/square-modern.json";
import cateyeFashion from "../../../packages/demo-assets/glasses/cateye-fashion.json";
import sportWrap from "../../../packages/demo-assets/glasses/sport-wrap.json";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

const GLASSES_ICONS: Record<string, string> = {
  "aviator-classic": "🕶️",
  "round-retro": "👓",
  "square-modern": "🟫",
  "cateye-fashion": "🐱",
  "sport-wrap": "🏃",
};

const SHAPE_ICONS: Record<string, string> = {
  oval: "🥚",
  round: "⭕",
  square: "⬜",
  heart: "💜",
  diamond: "💎",
  oblong: "📐",
  unknown: "❓",
};

const ALL_GLASSES: GlassesAssetManifest[] = [
  aviatorClassic as GlassesAssetManifest,
  roundRetro as GlassesAssetManifest,
  squareModern as GlassesAssetManifest,
  cateyeFashion as GlassesAssetManifest,
  sportWrap as GlassesAssetManifest,
];

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
};

const loadingOverlay = $("loading-overlay");
const loadingText = $("loading-text");
const canvas = $("tryon-canvas") as HTMLCanvasElement;
const statFps = $("stat-fps");
const statDetect = $("stat-detect");
const statRender = $("stat-render");
const trackingDot = $("tracking-dot");
const trackingText = $("tracking-text");
const faceHint = $("face-hint");
const glassesList = $("glasses-list");
const glassesInfo = $("glasses-info");
const glassesName = $("glasses-name");
const glassesPrice = $("glasses-price");
const btnAnalyze = $("btn-analyze");
const btnSnapshot = $("btn-snapshot");
const btnSwitchCamera = $("btn-switch-camera");
const shapeModal = $("shape-modal");
const shapeIcon = $("shape-icon");
const shapeName = $("shape-name");
const shapeConfidence = $("shape-confidence");
const shapeCandidates = $("shape-candidates");
const metricsGrid = $("metrics-grid");
const shapeWarnings = $("shape-warnings");
const warningsList = $("warnings-list");
const toastContainer = $("toast-container");
const modalClose = $("modal-close") as HTMLButtonElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let sdk: VisuTrySDK | null = null;
let recommender: Recommender | null = null;
let selectedGlassesIndex = 0;
let isAnalyzing = false;
let currentFacingMode: "user" | "environment" = "user";

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------

function showToast(message: string, type: "info" | "error" | "success" | "warning" = "info"): void {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 300ms ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---------------------------------------------------------------------------
// Glasses Selector UI
// ---------------------------------------------------------------------------

function renderGlassesList(): void {
  glassesList.innerHTML = "";
  ALL_GLASSES.forEach((glasses, index) => {
    const isSelected = index === selectedGlassesIndex;
    const card = document.createElement("div");
    card.className = "glasses-card" + (isSelected ? " selected" : "");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", String(isSelected));

    const iconDiv = document.createElement("div");
    iconDiv.className = "glasses-card-icon";
    iconDiv.textContent = GLASSES_ICONS[glasses.id] ?? "👓";
    card.appendChild(iconDiv);

    const nameDiv = document.createElement("div");
    nameDiv.className = "glasses-card-name";
    nameDiv.textContent = glasses.name;
    card.appendChild(nameDiv);

    const handleActivate = () => switchGlasses(index);
    card.addEventListener("click", handleActivate);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleActivate();
      }
    });

    glassesList.appendChild(card);
  });
}

async function switchGlasses(index: number): Promise<void> {
  if (index === selectedGlassesIndex || !sdk) return;
  selectedGlassesIndex = index;
  renderGlassesList();

  const glasses = ALL_GLASSES[index];
  glassesName.textContent = glasses.name;
  glassesPrice.textContent = `¥${glasses.metadata?.price ?? "—"}`;
  glassesInfo.classList.remove("hidden");

  try {
    await sdk.switchGlasses(glasses);
    showToast(`Switched to ${glasses.name}`, "success");
  } catch (err) {
    showToast(`Failed to load ${glasses.name}`, "error");
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Performance Stats Update
// ---------------------------------------------------------------------------

function updatePerformanceStats(stats: PerformanceStats): void {
  statFps.textContent = String(stats.fps);
  statDetect.textContent = `${stats.detectLatencyMs}ms`;
  statRender.textContent = `${stats.renderLatencyMs}ms`;
}

function updateTrackingStatus(tracking: boolean): void {
  if (tracking) {
    trackingDot.className = "stat-dot tracking";
    trackingText.textContent = "Tracking";
    faceHint.classList.add("hidden");
  } else {
    trackingDot.className = "stat-dot lost";
    trackingText.textContent = "Lost";
    faceHint.classList.remove("hidden");
  }
}

// ---------------------------------------------------------------------------
// Face Shape Analysis
// ---------------------------------------------------------------------------

async function handleAnalyzeFaceShape(): Promise<void> {
  if (!sdk || isAnalyzing) return;
  isAnalyzing = true;
  btnAnalyze.style.opacity = "0.5";
  showToast("Analyzing face shape... Please look at the camera.", "info");

  try {
    const result = await sdk.analyzeFaceShape();
    showShapeResult(result);
    // Move focus into the modal so keyboard/screen-reader users land on a
    // dismissible control when the result dialog appears.
    modalClose.focus();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    showToast(message, "error");
    console.error(err);
  } finally {
    isAnalyzing = false;
    btnAnalyze.style.opacity = "1";
  }
}

function showShapeResult(result: FaceShapeResult): void {
  // Primary shape
  shapeIcon.textContent = SHAPE_ICONS[result.primary] ?? "❓";
  shapeName.textContent = result.primary;
  shapeConfidence.textContent = `Confidence: ${(result.confidence * 100).toFixed(1)}%`;

  // Candidates with bars
  shapeCandidates.innerHTML = "";
  result.candidates.forEach((candidate) => {
    const row = document.createElement("div");
    row.className = "candidate-row";
    const scorePercent = (candidate.score * 100).toFixed(1);

    const nameSpan = document.createElement("span");
    nameSpan.className = "candidate-name";
    nameSpan.textContent = candidate.shape;
    row.appendChild(nameSpan);

    const barDiv = document.createElement("div");
    barDiv.className = "candidate-bar";
    const barFill = document.createElement("div");
    barFill.className = "candidate-bar-fill";
    barFill.style.width = `${candidate.score * 100}%`;
    barDiv.appendChild(barFill);
    row.appendChild(barDiv);

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "candidate-score";
    scoreSpan.textContent = `${scorePercent}%`;
    row.appendChild(scoreSpan);

    shapeCandidates.appendChild(row);
  });

  // Metrics grid
  const m = result.metrics;
  metricsGrid.innerHTML = "";
  const metrics: Array<[string, string]> = [
    ["Face Width", m.faceWidth?.toFixed(1) ?? "—"],
    ["Cheekbone Width", m.cheekboneWidth?.toFixed(1) ?? "—"],
    ["Jaw Width", m.jawWidth?.toFixed(1) ?? "—"],
    ["Eye Distance", m.eyeOuterDistance?.toFixed(1) ?? "—"],
    ["W/H Ratio", m.widthHeightRatio?.toFixed(3) ?? "—"],
    ["Jaw/Cheek Ratio", m.jawCheekRatio?.toFixed(3) ?? "—"],
    ["Chin Type", m.chinType ?? "—"],
    ["Quality", m.measurementQuality != null ? `${(m.measurementQuality * 100).toFixed(0)}%` : "—"],
  ];

  metrics.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "metric-item";
    const labelSpan = document.createElement("span");
    labelSpan.className = "metric-label";
    labelSpan.textContent = label;
    item.appendChild(labelSpan);
    const valueSpan = document.createElement("span");
    valueSpan.className = "metric-value";
    valueSpan.textContent = value;
    item.appendChild(valueSpan);
    metricsGrid.appendChild(item);
  });

  // Warnings
  if (result.warnings && result.warnings.length > 0) {
    warningsList.innerHTML = "";
    result.warnings.forEach((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      warningsList.appendChild(li);
    });
    shapeWarnings.classList.remove("hidden");
  } else {
    shapeWarnings.classList.add("hidden");
  }

  // Show recommendations if recommender is available
  if (recommender) {
    try {
      const recommendations = recommender.recommend({
        faceShape: result,
        faceMetrics: result.metrics,
        inventory: ALL_GLASSES.map((g): GlassesItem => ({
          id: g.id,
          name: g.name,
          brand: g.metadata?.brand,
          thumbnailUrl: g.thumbnailUrl ?? "",
          modelUrl: g.modelUrl,
          manifest: g,
          shapeCategory: g.metadata?.shapeCategory ?? "rectangle",
          dimensions: {
            frameWidthMm: g.dimensions.frameWidthMm,
            lensWidthMm: g.dimensions.lensWidthMm,
            lensHeightMm: g.dimensions.lensHeightMm,
            bridgeWidthMm: g.dimensions.bridgeWidthMm,
          },
          material: g.material?.frameMaterial,
          colors: g.metadata?.colors,
          price: g.metadata?.price,
        })),
      });
      if (recommendations.length > 0) {
        showToast(`Recommended: ${recommendations[0].item.name}`, "success");
      }
    } catch {
      // Recommendation is optional, ignore errors
    }
  }

  shapeModal.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

async function handleSnapshot(): Promise<void> {
  if (!sdk) return;
  try {
    const result = await sdk.snapshot({ format: "image/png" });
    // Download the snapshot
    const link = document.createElement("a");
    link.download = `visutry-snapshot-${Date.now()}.png`;
    link.href = result.dataUrl;
    link.click();
    showToast("Snapshot saved!", "success");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot failed";
    showToast(message, "error");
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Camera Switch
// ---------------------------------------------------------------------------

async function handleSwitchCamera(): Promise<void> {
  if (!sdk) return;
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  try {
    sdk.stopCamera();
    // Recreate with new facing mode — the SDK facade doesn't expose a direct
    // switchCamera method, so we stop and start with new config. In a production
    // app you'd re-initialize or use the camera provider's switchCamera.
    showToast("Camera switched. Reloading...", "info");
    setTimeout(() => window.location.reload(), 500);
  } catch (err) {
    showToast("Failed to switch camera", "error");
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Modal Close
// ---------------------------------------------------------------------------

function closeModal(): void {
  shapeModal.classList.add("hidden");
  // Return focus to the control that opened the modal so keyboard users keep a
  // logical focus order after dismissing the dialog.
  btnAnalyze.focus();
}

// ---------------------------------------------------------------------------
// Main Initialization
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  try {
    loadingText.textContent = "Loading VisuTry SDK...";

    // Create SDK instance
    sdk = createVisuTryWebSDK({
      canvas: canvas,
      camera: {
        facingMode: currentFacingMode,
        width: 640,
        height: 480,
        frameRate: 30,
      },
      tracker: {
        mode: "balanced",
        maxFaces: 1,
        enableTransformationMatrix: true,
      },
      renderer: {
        width: 640,
        height: 480,
        mirror: true,
        background: "transparent",
      },
      privacy: {
        processOnDeviceOnly: true,
        allowSnapshotExport: true,
        allowAnalytics: false,
      },
    });

    // Initialize recommender
    recommender = new Recommender();

    // Set up event listeners
    sdk.on("error", (err) => {
      console.error("SDK Error:", err);
      showToast(err.message, "error");
    });

    sdk.on("faceDetected", () => {
      updateTrackingStatus(true);
    });

    sdk.on("faceLost", () => {
      updateTrackingStatus(false);
    });

    sdk.on("performanceUpdated", (stats) => {
      updatePerformanceStats(stats);
    });

    loadingText.textContent = "Initializing SDK (loading MediaPipe model)...";

    // Initialize SDK
    await sdk.initialize();

    loadingText.textContent = "Starting camera...";

    // Start camera and try-on
    await sdk.startCamera();
    await sdk.startTryOn();

    // Load default glasses
    await sdk.loadGlasses(ALL_GLASSES[0]);
    glassesName.textContent = ALL_GLASSES[0].name;
    glassesPrice.textContent = `¥${ALL_GLASSES[0].metadata?.price ?? "—"}`;
    glassesInfo.classList.remove("hidden");

    // Render glasses selector
    renderGlassesList();

    // Hide loading overlay
    loadingOverlay.classList.add("hidden");

    showToast("VisuTry SDK ready!", "success");
  } catch (err) {
    loadingText.textContent = "Failed to initialize";
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Init error:", err);
    setTimeout(() => {
      loadingOverlay.querySelector(".spinner")?.remove();
      loadingText.textContent = `Error: ${message}`;
      loadingText.style.color = "#ef4444";
    }, 100);
  }
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

btnAnalyze.addEventListener("click", handleAnalyzeFaceShape);
btnSnapshot.addEventListener("click", handleSnapshot);
btnSwitchCamera.addEventListener("click", handleSwitchCamera);
modalClose.addEventListener("click", closeModal);
$(".modal-backdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// Prevent body scroll on mobile
document.addEventListener("touchmove", (e) => {
  const target = e.target as Element | null;
  if (target?.closest(".modal-content") || target?.closest(".glasses-list")) return;
  e.preventDefault();
}, { passive: false });

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  sdk?.destroy();
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

init();
