# Web (H5) Integration Guide

This is the complete guide for integrating the VisuTry SDK into a web (H5) application. It covers camera setup, canvas overlay, tracker modes, renderer configuration, event handling, performance monitoring, snapshots, face shape analysis, error handling, and mobile considerations.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Factory Options](#factory-options)
- [Camera Setup](#camera-setup)
- [Canvas Overlay Layout](#canvas-overlay-layout)
- [Tracker Modes](#tracker-modes)
- [Renderer Options](#renderer-options)
- [Event Handling](#event-handling)
- [Performance Monitoring](#performance-monitoring)
- [Snapshot](#snapshot)
- [Face Shape Analysis](#face-shape-analysis)
- [Switching Glasses](#switching-glasses)
- [Smoothing Configuration](#smoothing-configuration)
- [Fitting Configuration](#fitting-configuration)
- [Error Handling](#error-handling)
- [Mobile Considerations](#mobile-considerations)
- [MediaPipe CDN Configuration](#mediapipe-cdn-configuration)
- [Complete Working Example](#complete-working-example)

---

## Architecture Overview

The `createVisuTryWebSDK()` factory wires together five components:

```
┌─────────────────────────────────────────────────────┐
│                  VisuTryWebSDK                       │
│                                                      │
│  WebCameraProvider  ──►  MediaPipeFaceTracker        │
│  (getUserMedia)           (478-pt FaceLandmarker)    │
│                                  │                   │
│                                  ▼                   │
│                          GlassesPoseSolver            │
│                                  │                   │
│                                  ▼                   │
│                            PoseSmoother               │
│                                  │                   │
│                                  ▼                   │
│  PrivacyGuard  ◄──►  QualityGate  │                  │
│                          │         ▼                 │
│                          │   ThreeJsRenderer          │
│                          │   (orthographic + GLTF)    │
│                          ▼                           │
│                    FaceShapeScorer                    │
└─────────────────────────────────────────────────────┘
```

The facade owns a `requestAnimationFrame` loop. On each frame it reads the camera, runs detection, solves and smooths the pose, applies it to the renderer, and renders. Performance stats are emitted roughly once per second.

---

## Factory Options

`createVisuTryWebSDK(options: VisuTryWebSDKFactoryOptions)` accepts:

```ts
interface VisuTryWebSDKFactoryOptions extends VisuTrySDKConfig {
  /** The canvas (or selector string) the Three.js renderer draws on. */
  canvas: RenderTarget;
  /** MediaPipe-specific options (wasm path, model path, custom index map). */
  mediaPipeOptions?: MediaPipeTrackerOptions;
  /** Render options passed through to the renderer. */
  rendererOptions?: RenderOptions;
  /** Tracker config override. */
  trackerConfig?: TrackerConfig;
}

interface VisuTrySDKConfig {
  camera?: CameraConfig;
  tracker?: TrackerConfig;
  renderer?: RenderOptions;
  privacy?: PrivacyConfig;
  smoothing?: Partial<PoseSmoothingConfig>;
  fitting?: GlassesFittingConfig;
}
```

The `canvas` field is required. It accepts an `HTMLCanvasElement`, a CSS selector string, or a branded wrapper. All other fields are optional with sensible defaults.

---

## Camera Setup

The `WebCameraProvider` wraps `navigator.mediaDevices.getUserMedia`. It owns a hidden `<video>` element that serves as the live frame source.

```ts
interface CameraConfig {
  facingMode?: "user" | "environment";
  width?: number;       // ideal width, default 1280
  height?: number;      // ideal height, default 720
  frameRate?: number;   // ideal fps, default 30
  mirror?: boolean;     // default true (front camera)
}
```

The provider requests `video: true, audio: false`. It does **not** create a visible `<video>` in the DOM — the renderer draws onto the transparent canvas while the camera video is sampled internally by MediaPipe.

### Camera permissions

`getUserMedia` requires a secure context (`https://` or `localhost`). If the user denies permission, the provider throws an `SDKError` with code `CAMERA_PERMISSION_DENIED`. Always handle this case in your UI:

```ts
try {
  await sdk.startCamera();
} catch (err) {
  if (err.code === "CAMERA_PERMISSION_DENIED") {
    showPermissionPrompt();
  } else if (err.code === "CAMERA_NOT_AVAILABLE") {
    showNoCameraMessage();
  }
}
```

### Switching cameras

```ts
await sdk.camera.switchCamera(); // toggles user <-> environment
```

> Note: `switchCamera` is on the `WebCameraProvider` instance (exposed via `sdk.camera` if you compose adapters manually; the facade exposes camera via the composed provider). For the facade, stop and restart with a new `facingMode`.

---

## Canvas Overlay Layout

The recommended layout overlays a transparent WebGL canvas on top of the camera feed. Because the renderer uses an orthographic camera with `alpha: true`, only the glasses are drawn — the rest is transparent.

```html
<div id="stage" style="position:relative; width:100vw; height:100vh;">
  <!-- The WebGL canvas sits on top; the camera is sampled internally -->
  <canvas id="tryon-canvas"
          style="position:absolute; inset:0; width:100%; height:100%;">
  </canvas>
</div>
```

Key CSS points:

- The canvas must have explicit dimensions (via CSS `width`/`height: 100%` or fixed pixel sizes). The renderer reads `canvas.clientWidth`/`clientHeight` as a fallback.
- `background: transparent` ensures the camera (rendered separately or via a video element behind the canvas) shows through.
- On resize, call `renderer.resize(width, height)` or, through the facade, the renderer auto-uses the configured dimensions. For responsive layouts, hook into `window.resize`.

### Responsive resize

```ts
function handleResize() {
  const canvas = document.getElementById("tryon-canvas");
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  // The facade does not expose renderer.resize directly; re-initialize or
  // create the SDK with the expected dimensions. For full control, use the
  // renderer instance directly via the composed adapters.
}

window.addEventListener("resize", handleResize);
```

---

## Tracker Modes

The MediaPipe tracker supports three modes that trade accuracy for battery life. Each mode configures the GPU/CPU delegate and detection confidence thresholds.

| Mode | Delegate | Min Detection | Min Presence | Min Tracking | Best For |
|---|---|---|---|---|---|
| `realtime` | GPU | 0.4 | 0.4 | 0.4 | High-end devices; lowest latency |
| `balanced` | GPU | 0.5 | 0.5 | 0.5 | Default; good quality / battery trade-off |
| `batterySaver` | CPU | 0.5 | 0.5 | 0.5 | Low-end devices; extends battery |

```ts
const sdk = createVisuTryWebSDK({
  canvas,
  tracker: { mode: "batterySaver", maxFaces: 1 },
});
```

You can override individual confidence thresholds:

```ts
tracker: {
  mode: "balanced",
  maxFaces: 1,
  minFaceDetectionConfidence: 0.6,
  minFacePresenceConfidence: 0.6,
  minTrackingConfidence: 0.6,
  enableTransformationMatrix: true, // default true; provides the 4x4 face matrix
}
```

When `enableTransformationMatrix` is `true` (default), the tracker receives MediaPipe's facial transformation matrix, which the pose solver can use for more accurate yaw/pitch via `useTransformationMatrix: true` in `GlassesFittingConfig`.

See [Performance Guide](./performance.md) for expected FPS by device class.

---

## Renderer Options

```ts
interface RenderOptions {
  width: number;
  height: number;
  mirror?: boolean;           // default false (set true for front camera)
  background?: "transparent" | "camera" | string; // default "transparent"
  pixelRatio?: number;        // default window.devicePixelRatio
  antialias?: boolean;        // default true
  maxTextureSize?: number;    // default 4096
}
```

The `ThreeJsRenderer` sets up an **orthographic camera** so that render-world units map 1:1 to normalized image space:

- `y` ranges from `-0.5` to `+0.5` (frame height = 1.0 unit)
- `x` ranges from `-aspect/2` to `+aspect/2` (scaled by aspect ratio)

This means `GlassesPose.position` (in render-world units) lands the glasses directly on the face. The glasses model is normalized to millimetres on load; `GlassesPose.scale` (produced by the solver, which folds in `MM_TO_RENDER_WORLD = 1/200`) converts millimetres to render-world units.

Lighting is set up with an ambient light (intensity 0.9) and a directional light (intensity 0.8, positioned at `(0, 0.5, 1)`).

```ts
const sdk = createVisuTryWebSDK({
  canvas,
  renderer: {
    width: 1280,
    height: 720,
    mirror: true,
    background: "transparent",
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2), // cap for performance
  },
});
```

> **Tip:** On high-DPI mobile devices, capping `pixelRatio` at 2 prevents the GPU from rendering at 3x or 4x resolution, which can halve FPS.

---

## Event Handling

The SDK emits typed events. Subscribe with `on()` and unsubscribe with `off()`.

| Event | Payload | When |
|---|---|---|
| `ready` | — | After `initialize()` completes |
| `faceDetected` | `NormalizedFaceResult` | Every frame a face is found |
| `faceLost` | — | When tracking is lost (after the smoother's delay) |
| `poseUpdated` | `GlassesPose` | Every frame the pose is solved and smoothed |
| `glassesLoaded` | `GlassesAssetManifest` | After a glasses model loads successfully |
| `glassesLoadFailed` | `SDKError` | When a glasses model fails to load |
| `faceShapeAnalyzed` | `FaceShapeResult` | After `analyzeFaceShape()` completes |
| `performanceUpdated` | `PerformanceStats` | Roughly once per second |
| `error` | `SDKError` | Any unrecoverable or notable error |

```ts
// Subscribe
const onPose = (pose: GlassesPose) => {
  if (!pose.visible) {
    hideGlasses();
  } else {
    showGlasses();
  }
  console.log(`confidence: ${pose.confidence.toFixed(2)}`);
};
sdk.on("poseUpdated", onPose);

// Unsubscribe
sdk.off("poseUpdated", onPose);
```

> **Note:** Handler exceptions are swallowed to protect the render loop. Always wrap side-effecting logic in try/catch if it could throw.

### React example

```tsx
import { useEffect, useRef } from "react";
import { createVisuTryWebSDK, type VisuTrySDK } from "@visutry/tryon-web";

function TryOnView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sdkRef = useRef<VisuTrySDK | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const sdk = createVisuTryWebSDK({ canvas: canvasRef.current, tracker: { mode: "balanced" } });
    sdkRef.current = sdk;

    sdk.on("poseUpdated", (pose) => {
      // update UI state
    });

    (async () => {
      await sdk.initialize();
      await sdk.startCamera();
      await sdk.startTryOn();
    })();

    return () => sdk.destroy();
  }, []);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
}
```

---

## Performance Monitoring

The SDK tracks frame times and latencies internally. Call `getPerformanceStats()` at any time, or listen to the `performanceUpdated` event (emitted roughly once per second).

```ts
interface PerformanceStats {
  fps: number;
  detectLatencyMs: number;   // average MediaPipe detect time
  renderLatencyMs: number;   // average Three.js render time
  trackingLostCount: number; // cumulative lost-tracking events
  mode: TrackingMode;
  memoryMB?: number;         // optional, when available
}
```

```ts
sdk.on("performanceUpdated", (stats) => {
  setFps(stats.fps);
  setLatency(stats.detectLatencyMs + stats.renderLatencyMs);

  // Adaptive degradation: switch to batterySaver if FPS drops
  if (stats.fps < 20 && stats.mode === "balanced") {
    console.warn("Low FPS detected; consider batterySaver mode.");
  }
});
```

The SDK keeps the last 60 samples for FPS and latency calculations. FPS is computed from the span between the first and last frame timestamps. Latencies are averaged over the rolling window.

See [Performance Guide](./performance.md) for benchmark expectations and degradation strategies.

---

## Snapshot

Capture the current try-on view as an image. The renderer uses `preserveDrawingBuffer: true` so `toDataURL` works reliably.

```ts
const result = await sdk.snapshot({
  format: "image/png",     // or "image/jpeg", "image/webp"
  quality: 0.92,           // for jpeg/webp
  mirror: true,
  width: 1280,             // optional; defaults to renderer size
  height: 720,
});

// result.dataUrl is a base64 data URL
downloadLink.href = result.dataUrl;
```

```ts
interface SnapshotResult {
  dataUrl: string;
  blob?: Blob;
  width: number;
  height: number;
  timestamp: number;
}
```

> **Privacy:** Snapshot export is gated by `PrivacyGuard.canExportSnapshot()`. It defaults to `true` but can be disabled via `privacy: { allowSnapshotExport: false }`. If disabled, `snapshot()` throws an `SDKError`. See [Privacy](./privacy.md).

---

## Face Shape Analysis

`analyzeFaceShape()` collects quality-gated frames from the camera, aggregates them, and scores 6 face shapes. It pauses the try-on loop during collection to avoid RAF conflicts.

```ts
const result = await sdk.analyzeFaceShape({
  config: {
    sampleFrames: 8,        // default 8
    sampleIntervalMs: 120,  // default 120ms between samples
    requireFrontal: true,   // default true; requires frontalScore >= 0.75
  },
});

console.log(result.primary);      // "oval" | "round" | "square" | "heart" | "diamond" | "oblong" | "unknown"
console.log(result.confidence);   // 0..1
console.log(result.candidates);   // ranked list of { shape, score, reasons }
console.log(result.metrics);      // FaceMetrics with all measurements
```

Each collected frame passes the `analysis` quality gate (the strictest mode: min confidence 0.75, min frontal 0.75, min bbox width 0.25, 8 required semantic points). If no quality frames arrive within a timeout (max of `sampleFrames * intervalMs + 2000` ms, minimum 5000 ms), the call rejects.

You can also score pre-collected frames directly (useful for server-side or batch processing):

```ts
const result = await sdk.analyzeFaceShape({
  frames: preCollectedFrames, // NormalizedFaceResult[]
});
```

The `faceShapeAnalyzed` event fires when analysis completes.

See [Face Shape Algorithm](./face-shape-algorithm.md) for the full algorithm details.

---

## Switching Glasses

`switchGlasses()` is semantically identical to `loadGlasses()` — the renderer disposes the previous model before loading the new one. Both emit `glassesLoaded` on success or `glassesLoadFailed` on error.

```ts
await sdk.switchGlasses(newManifest);
```

The old model's GPU resources (geometries, materials, textures) are disposed via `disposeObject()` to prevent memory leaks.

---

## Smoothing Configuration

The `PoseSmoother` suppresses tracker jitter and handles brief tracking loss. Configure it via the `smoothing` option:

```ts
interface PoseSmoothingConfig {
  enabled: boolean;            // default true
  positionLerp: number;        // default 0.35 (0=instant, 1=no smoothing)
  rotationLerp: number;        // default 0.30
  scaleLerp: number;           // default 0.25
  jitterThreshold: number;     // default 0.003 (sub-threshold deltas ignored)
  lostTrackingDelayMs: number; // default 250 (hold last pose before fade-out)
}
```

```ts
const sdk = createVisuTryWebSDK({
  canvas,
  smoothing: {
    positionLerp: 0.4,        // slightly snappier
    lostTrackingDelayMs: 300, // hold longer before fade
  },
});
```

**How it works:**

- When tracking is active, position/rotation/scale are lerped toward the new target. Sub-threshold deltas (below `jitterThreshold`) are ignored to kill micro-jitter.
- On brief loss (< `lostTrackingDelayMs`), the last pose is held so the glasses do not flicker.
- After the delay, the glasses fade out over 200 ms (`visible: false`).
- On recovery, the lerp resumes, preventing an instantaneous jump.

---

## Fitting Configuration

The `GlassesFittingConfig` controls how the pose solver fits glasses to the face. Pass it via the `fitting` option:

```ts
interface GlassesFittingConfig {
  scaleMultiplier?: number;
  positionOffset?: Vector3;
  rotationOffset?: Vector3;
  useTransformationMatrix?: boolean;  // use MediaPipe 4x4 matrix for yaw/pitch
  fitBy?: "eyeOuterDistance" | "eyeCenterDistance" | "faceWidth";
  verticalAnchor?: "noseBridge" | "eyeLine" | "browLine";
  depthStrategy?: "noseTip" | "matrix" | "fixed";
}
```

```ts
const sdk = createVisuTryWebSDK({
  canvas,
  fitting: {
    fitBy: "eyeOuterDistance",    // default; fits frame width to outer-eye span
    verticalAnchor: "noseBridge", // default; positions glasses at nose bridge
    depthStrategy: "noseTip",     // default; uses nose tip z for depth
    useTransformationMatrix: true,// use the 4x4 matrix for yaw/pitch
    scaleMultiplier: 1.0,
  },
});
```

The solver pipeline:
1. **Roll** from the eye centre line (atan2 of the eye vector in render-world).
2. **Scale** from the chosen fit metric divided by the model's frame width (in render-world units).
3. **Position** from the vertical anchor (noseBridge / eyeLine / browLine) converted to render-world, plus a depth strategy.
4. **Rotation** from yaw/pitch (either landmark-derived or matrix-decomposed) plus the eye-line roll.
5. **Offsets** from the manifest defaults and config offsets are applied; scale is clamped to `[minScale, maxScale]`.

---

## Error Handling

All SDK errors conform to the `SDKError` interface:

```ts
interface SDKError {
  code: SDKErrorCode;
  message: string;
  cause?: unknown;
  recoverable: boolean;
}
```

| Code | Recoverable | Cause |
|---|---|---|
| `CAMERA_PERMISSION_DENIED` | No | User denied camera access |
| `CAMERA_NOT_AVAILABLE` | Yes | No camera device or constraint failure |
| `TRACKER_INIT_FAILED` | No | MediaPipe WASM/model failed to load |
| `TRACKER_DETECT_FAILED` | Yes | Transient detection error |
| `RENDERER_INIT_FAILED` | No | WebGL context creation failed |
| `GLASSES_LOAD_FAILED` | Yes | GLB fetch or parse error |
| `UNSUPPORTED_PLATFORM` | No | `getUserMedia` unavailable |
| `LOW_PERFORMANCE` | Yes | Device below minimum spec |
| `SNAPSHOT_FAILED` | Yes | Snapshot capture error |
| `UNKNOWN` | Yes | Catch-all |

```ts
sdk.on("error", (err: SDKError) => {
  switch (err.code) {
    case "CAMERA_PERMISSION_DENIED":
      showPermissionUI();
      break;
    case "TRACKER_INIT_FAILED":
      showUnsupportedBrowserMessage();
      break;
    case "GLASSES_LOAD_FAILED":
      showGlassesLoadError(err.message);
      break;
    default:
      console.error("VisuTry error:", err.code, err.message);
  }
});
```

Lifecycle methods (`initialize`, `startCamera`, `loadGlasses`, `snapshot`) throw `SDKError` on failure. The `error` event is also emitted. Always use try/catch around awaited calls.

---

## Mobile Considerations

### iOS Safari

- **getUserMedia** requires HTTPS. On `localhost` it works for development.
- **WebGL**: iOS Safari supports WebGL2 but with a smaller max texture size. Keep `maxTextureSize` at 4096 or lower.
- **Video autoplay**: The provider sets `video.autoplay = true`, `playsInline = true`, and `muted = true` to satisfy iOS autoplay policies.
- **Memory**: iOS Safari is aggressive about killing tabs with high GPU memory. Dispose models when switching glasses and call `destroy()` when leaving the page.

### Android Chrome

- **Camera resolution**: Some Android devices ignore `ideal` constraints and return lower resolutions. The tracker handles any resolution gracefully.
- **GPU delegate**: The `realtime` and `balanced` modes use the GPU delegate, which requires WebGL. If WebGL is unavailable, fall back to `batterySaver` (CPU delegate).

### Performance tips

- Cap `pixelRatio` at 2 to avoid rendering at 3x+ resolution.
- Use 640x480 or 720p camera resolution on mid-range devices (1080p is rarely needed for face tracking and doubles the detection cost).
- Prefer `balanced` mode; switch to `batterySaver` only when FPS drops below 20.
- Avoid running `analyzeFaceShape()` concurrently with `startTryOn()` — the facade pauses try-on during analysis automatically.

---

## MediaPipe CDN Configuration

By default, the tracker loads MediaPipe WASM and the face landmarker model from public CDNs:

```ts
const DEFAULT_MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const DEFAULT_FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
```

To self-host (recommended for production, reliability, and China mainland access):

```ts
const sdk = createVisuTryWebSDK({
  canvas,
  mediaPipeOptions: {
    wasmPath: "https://your-cdn.com/mediapipe/wasm",
    modelAssetPath: "https://your-cdn.com/models/face_landmarker.task",
  },
});
```

You can also override the semantic index map (only needed for non-standard tracker topologies):

```ts
mediaPipeOptions: {
  indexMap: { leftEyeOuter: 33, rightEyeOuter: 263, /* ... */ },
}
```

---

## Complete Working Example

This example demonstrates a full try-on experience with glasses switching, face shape analysis, snapshot, and performance monitoring.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>VisuTry Full Demo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; color: #eee; font-family: system-ui, sans-serif; }
    #stage { position: relative; width: 100vw; height: 70vh; overflow: hidden; }
    #tryon-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    #controls { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
    button { padding: 10px 16px; border: none; border-radius: 8px; background: #4a90d9; color: #fff; cursor: pointer; font-size: 14px; }
    button:disabled { opacity: 0.5; }
    #stats { font-size: 12px; color: #aaa; font-family: monospace; }
    #shape-result { padding: 8px; background: #222; border-radius: 8px; font-size: 13px; }
  </style>
</head>
<body>
  <div id="stage">
    <canvas id="tryon-canvas"></canvas>
  </div>
  <div id="controls">
    <div class="btn-row" id="glasses-buttons"></div>
    <div class="btn-row">
      <button id="btn-analyze">Analyze Face Shape</button>
      <button id="btn-snapshot">Take Snapshot</button>
      <button id="btn-stop">Stop</button>
    </div>
    <div id="stats">Waiting for SDK...</div>
    <div id="shape-result"></div>
  </div>

  <script type="module">
    import { createVisuTryWebSDK } from "@visutry/tryon-web";
    import aviator from "@visutry/demo-assets/glasses/aviator-classic.json";
    import round from "@visutry/demo-assets/glasses/round-retro.json";
    import square from "@visutry/demo-assets/glasses/square-modern.json";
    import cateye from "@visutry/demo-assets/glasses/cateye-fashion.json";
    import sport from "@visutry/demo-assets/glasses/sport-wrap.json";

    const glassesList = [aviator, round, square, cateye, sport];

    const sdk = createVisuTryWebSDK({
      canvas: document.getElementById("tryon-canvas"),
      camera: { facingMode: "user", width: 1280, height: 720, frameRate: 30, mirror: true },
      tracker: { mode: "balanced", maxFaces: 1, enableTransformationMatrix: true },
      renderer: { width: 1280, height: 720, mirror: true, background: "transparent", antialias: true },
      smoothing: { positionLerp: 0.35, lostTrackingDelayMs: 250 },
      privacy: { allowSnapshotExport: true, allowAnalytics: false },
    });

    const statsEl = document.getElementById("stats");
    const shapeEl = document.getElementById("shape-result");

    sdk.on("ready", () => (statsEl.textContent = "SDK ready. Loading glasses..."));
    sdk.on("error", (err) => console.error("SDK error:", err.code, err.message));
    sdk.on("glassesLoaded", (asset) => (statsEl.textContent = `Loaded: ${asset.name}`));
    sdk.on("performanceUpdated", (s) => {
      statsEl.textContent = `FPS: ${s.fps} | detect: ${s.detectLatencyMs}ms | render: ${s.renderLatencyMs}ms | lost: ${s.trackingLostCount}`;
    });
    sdk.on("faceShapeAnalyzed", (result) => {
      const top = result.candidates.slice(0, 3)
        .map((c) => `${c.shape}: ${(c.score * 100).toFixed(0)}%`).join(" | ");
      shapeEl.innerHTML = `<strong>Primary: ${result.primary}</strong> (confidence: ${(result.confidence * 100).toFixed(0)}%)<br>${top}`;
    });

    async function start() {
      await sdk.initialize();
      await sdk.startCamera();
      await sdk.startTryOn();
      await sdk.loadGlasses(aviator);
    }

    // Glasses selector buttons
    const glassesButtons = document.getElementById("glasses-buttons");
    for (const g of glassesList) {
      const btn = document.createElement("button");
      btn.textContent = g.name;
      btn.onclick = () => sdk.switchGlasses(g);
      glassesButtons.appendChild(btn);
    }

    document.getElementById("btn-analyze").onclick = async () => {
      shapeEl.textContent = "Analyzing... (look at the camera, face the front)";
      try {
        await sdk.analyzeFaceShape({ config: { sampleFrames: 8, sampleIntervalMs: 120, requireFrontal: true } });
      } catch (e) {
        shapeEl.textContent = "Analysis failed: " + e.message;
      }
    };

    document.getElementById("btn-snapshot").onclick = async () => {
      try {
        const snap = await sdk.snapshot({ format: "image/png" });
        const link = document.createElement("a");
        link.href = snap.dataUrl;
        link.download = "visutry-snapshot.png";
        link.click();
      } catch (e) {
        console.error("Snapshot failed:", e);
      }
    };

    document.getElementById("btn-stop").onclick = () => {
      sdk.stopTryOn();
      sdk.stopCamera();
    };

    start().catch((err) => {
      statsEl.textContent = "Startup failed: " + err.message;
      console.error(err);
    });

    window.addEventListener("beforeunload", () => sdk.destroy());
  </script>
</body>
</html>
```
