import { createVisuTryWebSDK } from "@visutry/tryon-web";
import type { GlassesAssetManifest, SDKError, VisuTrySDK } from "@visutry/tryon-core";
import referenceManifest from "../../../packages/demo-assets/reference/v1/manifest.json";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing demo element: ${id}`);
  return node as T;
}
const stage = element<HTMLElement>("stage");
const surface = element<HTMLElement>("camera-surface");
const video = element<HTMLVideoElement>("camera-video");
const canvas = element<HTMLCanvasElement>("tryon-canvas");
const welcome = element<HTMLElement>("welcome");
const loading = element<HTMLElement>("loading");
const loadingText = element<HTMLElement>("loading-text");
const errorPanel = element<HTMLElement>("error-panel");
const errorMessage = element<HTMLElement>("error-message");
const liveStatus = element<HTMLElement>("live-status");
const tracking = element<HTMLElement>("tracking-status");
const trackingDot = element<HTMLElement>("tracking-dot");
const fps = element<HTMLElement>("fps");
const faceHint = element<HTMLElement>("face-hint");
const startButton = element<HTMLButtonElement>("btn-start");
const snapshotButton = element<HTMLButtonElement>("btn-snapshot");
const switchButton = element<HTMLButtonElement>("btn-switch-camera");
const stopButton = element<HTMLButtonElement>("btn-stop");
const toast = element<HTMLElement>("toast");
const assetOrigin = import.meta.env.VITE_SDK_ASSET_ORIGIN?.replace(/\/$/, "") ?? "";
const manifest = {
  ...referenceManifest,
  modelUrl: `${assetOrigin}${referenceManifest.modelUrl}`,
} as GlassesAssetManifest;
const runtime = "/mediapipe/0.10.35";
let sdk: VisuTrySDK | null = null;
let facingMode: "user" | "environment" = "user";
let generation = 0;
let poseCount = 0;
let hasFace = false;
let hasPose = false;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function resizeSurface(): void {
  const aspect =
    video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
  const width = Math.min(stage.clientWidth, stage.clientHeight * aspect);
  surface.style.width = `${width}px`;
  surface.style.height = `${width / aspect}px`;
}
function setState(state: "idle" | "loading" | "ready" | "error"): void {
  stage.dataset.state = state;
  welcome.hidden = state !== "idle";
  loading.hidden = state !== "loading";
  errorPanel.hidden = state !== "error";
  liveStatus.hidden = state !== "ready";
  faceHint.hidden = state !== "ready" || hasPose;
  startButton.disabled = state !== "idle";
  snapshotButton.disabled = state !== "ready" || !hasFace || !hasPose;
  switchButton.disabled = state !== "ready";
  stopButton.disabled = state === "idle" || state === "error";
}
function stop(): void {
  generation++;
  const previous = sdk;
  sdk = null;
  previous?.destroy();
  hasFace = false;
  hasPose = false;
  poseCount = 0;
  stage.dataset.poseCount = "0";
  stage.dataset.glassesLoaded = "false";
  stage.dataset.poseVisible = "false";
  trackingDot.classList.remove("tracked");
  fps.textContent = "— fps";
  setState("idle");
}
function friendlyError(error: unknown): string {
  const code = (error as SDKError)?.code;
  if (code === "CAMERA_PERMISSION_DENIED")
    return "Allow camera access in your browser, then try again.";
  if (code === "CAMERA_NOT_AVAILABLE")
    return "No camera is available. Connect a camera or open this demo on your phone.";
  if (code === "GLASSES_LOAD_FAILED")
    return "The reference frame could not be loaded. Check your connection and try again.";
  if (code === "TRACKER_INIT_FAILED")
    return "The face tracker could not start. Try a recent browser with WebGL enabled.";
  return "The try-on could not start. Check camera access and your connection, then try again.";
}
async function start(): Promise<void> {
  stop();
  const current = generation;
  setState("loading");
  loadingText.textContent = "Loading the local face tracker…";
  const instance = createVisuTryWebSDK({
    canvas,
    video,
    snapshotMode: "camera",
    camera: { width: 640, height: 480, frameRate: 30, facingMode, mirror: facingMode === "user" },
    tracker: { mode: "balanced", maxFaces: 1, enableTransformationMatrix: true },
    renderer: {
      width: 640,
      height: 480,
      background: "transparent",
      antialias: true,
      mirror: facingMode === "user",
    },
    mediaPipeOptions: {
      wasmPath: `${runtime}/wasm`,
      modelAssetPath: `${runtime}/models/face_landmarker.task`,
    },
    privacy: { processOnDeviceOnly: true, allowSnapshotExport: true, allowAnalytics: false },
  });
  sdk = instance;
  const active = () => current === generation && sdk === instance;
  instance.on("glassesLoaded", () => {
    if (active()) stage.dataset.glassesLoaded = "true";
  });
  instance.on("poseUpdated", (pose) => {
    if (!active()) return;
    stage.dataset.poseCount = String(++poseCount);
    stage.dataset.poseVisible = String(pose.visible);
    hasPose = pose.visible;
    tracking.textContent = hasPose ? "Live · Face tracked" : "Move closer in good light";
    trackingDot.classList.toggle("tracked", hasPose);
    if (stage.dataset.state === "ready") setState("ready");
  });
  instance.on("faceDetected", () => {
    if (!active()) return;
    hasFace = true;
    tracking.textContent = "Live · Face tracked";
    trackingDot.classList.add("tracked");
    if (stage.dataset.state === "ready") setState("ready");
  });
  instance.on("faceLost", () => {
    if (!active()) return;
    hasFace = false;
    hasPose = false;
    tracking.textContent = "Finding your face";
    trackingDot.classList.remove("tracked");
    if (stage.dataset.state === "ready") setState("ready");
  });
  instance.on("performanceUpdated", (value) => {
    if (active()) fps.textContent = `${Math.round(value.fps)} fps`;
  });
  instance.on("error", (error) => {
    console.error(`[VisuTry] ${error.code}: ${error.message}`);
    if (active() && stage.dataset.state === "ready") {
      stop();
      errorMessage.textContent = friendlyError(error);
      setState("error");
    }
  });
  try {
    await instance.initialize();
    if (!active()) return;
    loadingText.textContent = "Loading the reference frame…";
    await instance.loadGlasses(manifest);
    if (!active()) return;
    loadingText.textContent = "Waiting for camera access…";
    await instance.startCamera();
    if (!active()) return;
    resizeSurface();
    await instance.startTryOn();
    if (!active()) return;
    tracking.textContent = hasFace ? "Live · Face tracked" : "Finding your face";
    setState("ready");
  } catch (error) {
    if (active()) {
      stop();
      errorMessage.textContent = friendlyError(error);
      setState("error");
    }
  } finally {
    if (!active()) instance.destroy();
  }
}
startButton.addEventListener("click", () => void start());
element<HTMLButtonElement>("btn-retry").addEventListener("click", () => void start());
stopButton.addEventListener("click", stop);
switchButton.addEventListener("click", () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  void start();
});
snapshotButton.addEventListener("click", async () => {
  const instance = sdk;
  if (!instance || !hasFace || !hasPose) return;
  snapshotButton.disabled = true;
  try {
    const photo = await instance.snapshot({ format: "image/png", mirror: facingMode === "user" });
    if (sdk !== instance) return;
    const link = document.createElement("a");
    link.href = photo.dataUrl;
    link.download = `visutry-reference-${Date.now()}.png`;
    link.click();
    toast.textContent = "Your photo is ready to save.";
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3000);
  } catch {
    toast.textContent = "The photo could not be saved. Please try again.";
    toast.hidden = false;
  } finally {
    snapshotButton.disabled = stage.dataset.state !== "ready" || !hasFace || !hasPose;
  }
});
video.addEventListener("loadedmetadata", resizeSurface);
video.addEventListener("resize", resizeSurface);
new ResizeObserver(resizeSurface).observe(stage);
window.addEventListener("pagehide", stop);
setState("idle");
resizeSurface();
