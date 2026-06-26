# Getting Started

This guide gets you up and running with the **VisuTry Face Geometry & AR Glasses Try-On SDK** on the web (H5) in minutes. It covers installation, the core concepts you need to understand, the SDK lifecycle, and a minimal working example.

---

## Table of Contents

- [What is VisuTry?](#what-is-visutry)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Package Overview](#package-overview)
- [Core Concepts](#core-concepts)
  - [Coordinate Systems](#coordinate-systems)
  - [On-Device Privacy](#on-device-privacy)
  - [The Tracking / Render Loop](#the-tracking--render-loop)
- [SDK Lifecycle](#sdk-lifecycle)
- [Minimal Example](#minimal-example)
- [Next Steps](#next-steps)

---

## What is VisuTry?

VisuTry is a privacy-first, on-device face geometry and AR glasses try-on SDK. It runs entirely in the browser (or WeChat Mini Program) — no face images or landmarks ever leave the device. The SDK uses MediaPipe's 478-point Face Landmarker to track the face in real time, solves a 6-DOF glasses pose, and renders a 3D glasses model on top of the camera feed with Three.js.

Key capabilities:

- Real-time AR glasses try-on with sub-frame pose smoothing
- Geometric face shape analysis (6 shapes) with confidence scoring
- Glasses recommendation engine (shape + size + brand/color/material)
- Quality gating for analysis, try-on, and snapshot use cases
- Snapshot export for sharing

---

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0 (the SDK is a pnpm monorepo)
- A modern browser with WebAssembly and WebGL support
- Camera access (HTTPS or `localhost` for `getUserMedia`)

> **Why pnpm?** The SDK is organized as a pnpm workspace monorepo. pnpm's symlinked `node_modules` keeps the shared `@visutry/tryon-core` dependency deduplicated across all adapter packages.

---

## Installation

### Install the web adapter

The `@visutry/tryon-web` package is the primary entry point for H5 applications. It bundles the core library, the MediaPipe tracker, and the Three.js renderer.

```bash
pnpm add @visutry/tryon-web
```

This transitively installs `@visutry/tryon-core`, `@mediapipe/tasks-vision`, and `three`.

### Install individual packages

If you only need platform-agnostic algorithms (for example, in a Node.js service that scores face shapes from pre-collected landmarks), you can install the core alone:

```bash
pnpm add @visutry/tryon-core
```

For glasses recommendations without a camera:

```bash
pnpm add @visutry/recommender
```

### From source (monorepo)

To work with the full monorepo:

```bash
git clone <repository-url>
cd visutry-tryon-sdk
pnpm install
pnpm build
```

This builds all packages (`core`, `web`, `wechat`, `recommender`, `demo-assets`) in dependency order.

---

## Package Overview

| Package | Description |
|---|---|
| `@visutry/tryon-core` | Platform-agnostic core: types, coordinate system, face semantic mapping, face metrics, face shape scoring, glasses pose solver, pose smoothing, quality gate, privacy guard, manifest validator. No DOM/MediaPipe/Three.js/WeChat dependencies. |
| `@visutry/tryon-web` | H5 adapter: `WebCameraProvider` (getUserMedia), `MediaPipeFaceTracker` (478-point FaceLandmarker), `ThreeJsRenderer` (orthographic camera, GLTFLoader), `createVisuTryWebSDK` facade. |
| `@visutry/tryon-wechat` | WeChat Mini Program adapter (experimental): `WechatCameraProvider`, `WechatFaceTracker` (VK), `WechatRenderer`, `createWechatSDK`. |
| `@visutry/recommender` | Glasses recommendation engine: face shape + size + brand/color/material scoring. |
| `@visutry/demo-assets` | Demo glasses manifests (5 frames: aviator, round, square, cat-eye, sport). |

---

## Core Concepts

### Coordinate Systems

The SDK uses four coordinate systems. Understanding how data flows between them is essential:

| System | Origin | Axes | Used For |
|---|---|---|---|
| `pixel-image` | Top-left | x right, y down | Raw video/image frames from the camera |
| `normalized-image` | Top-left | x in [0,1] right, y in [0,1] down | SDK-internal face results |
| `render-world` | Scene center | x right, y up, x scaled by aspect | Glasses model rendering (1.0 unit = frame height) |
| `glasses-local` | Model origin | x right, y up, z temple | Single glasses model space |

Adapters always emit `NormalizedFaceResult`. The core operates exclusively in normalized-image space. The renderer only ever receives `GlassesPose` — never raw landmarks. This separation keeps the core tracker-agnostic and the renderer pose-agnostic.

A calibration constant bridges physical millimetres to render-world units:

```
MM_TO_RENDER_WORLD = 1 / 200
```

A representative adult face height of ~200 mm maps to 1.0 render-world unit. The manifest's `defaultScale` and `GlassesFittingConfig` fine-tune this per model.

### On-Device Privacy

VisuTry enforces a hard on-device-only contract. Face images, video frames, landmarks, and face geometry **never** leave the device. The `PrivacyGuard` is the single source of truth:

- `canUploadFrames()` → always `false`
- `canUploadLandmarks()` → always `false`
- `canUploadFaceGeometry()` → always `false`
- `canExportSnapshot()` → configurable (default `true`)
- `canEmitAnalytics()` → configurable (default `false`)

See [Privacy](./privacy.md) for the full model.

### The Tracking / Render Loop

When you call `startTryOn()`, the SDK runs a `requestAnimationFrame` loop. Each frame:

1. **Detect** — The camera provider supplies the current video frame; the MediaPipe tracker returns a `NormalizedFaceResult`.
2. **Quality gate** — The result is evaluated against the `tryon` mode thresholds.
3. **Solve pose** — `GlassesPoseSolver` converts the face result into a `GlassesPose` (position, rotation, scale, visibility).
4. **Smooth** — `PoseSmoother` applies Lerp interpolation and jitter suppression, with a 250 ms lost-tracking delay and fade-out.
5. **Render** — `ThreeJsRenderer` applies the smoothed pose to the glasses model and draws a frame.

Events are emitted for face detection, loss, pose updates, performance stats, and errors.

---

## SDK Lifecycle

The SDK follows a strict lifecycle. Each step must complete before the next:

```
createVisuTryWebSDK()   →  construct the SDK instance (no I/O)
        │
        ▼
   initialize()          →  load MediaPipe WASM + model, create WebGL context
        │
        ▼
   startCamera()         →  request getUserMedia, start the <video> stream
        │
        ▼
   startTryOn()          →  begin the RAF tracking/render loop
        │
        ▼
   loadGlasses(manifest) →  fetch + parse the GLB model, add to scene
        │
        ▼
   ... try-on runs ...
        │
        ▼
   stopTryOn() / stopCamera() / destroy()
```

| Method | What it does | Idempotent? |
|---|---|---|
| `createVisuTryWebSDK(options)` | Constructs the facade and all internal components. No I/O. | Returns a new instance each call |
| `initialize()` | Loads MediaPipe WASM and model; creates the WebGL renderer. Emits `ready`. | Yes (no-op if already initialized) |
| `startCamera()` | Calls `getUserMedia`; starts the hidden `<video>`. Calls `initialize()` if needed. | Yes |
| `startTryOn()` | Starts the `requestAnimationFrame` loop. Calls `startCamera()` if needed. Resets the smoother. | Yes |
| `loadGlasses(asset)` | Loads and validates a glasses manifest/model. Emits `glassesLoaded` or `glassesLoadFailed`. | Replaces the current model |
| `stopTryOn()` | Cancels the RAF loop; hides the glasses. | Yes |
| `stopCamera()` | Stops all media tracks. | Yes |
| `destroy()` | Stops everything, releases GPU resources, clears listeners. | Yes (no-op if already destroyed) |

---

## Minimal Example

Here is a complete, minimal H5 try-on page. It overlays a transparent WebGL canvas on top of a camera `<video>` element and renders the demo aviator glasses.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>VisuTry Minimal Try-On</title>
  <style>
    html, body { margin: 0; padding: 0; background: #000; }
    #stage {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    #canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="stage">
    <canvas id="canvas"></canvas>
  </div>

  <script type="module">
    import { createVisuTryWebSDK } from "@visutry/tryon-web";
    import aviatorManifest from "@visutry/demo-assets/glasses/aviator-classic.json";

    // 1. Create the SDK instance.
    const sdk = createVisuTryWebSDK({
      canvas: document.getElementById("canvas"),
      camera: { facingMode: "user", width: 1280, height: 720, frameRate: 30, mirror: true },
      tracker: { mode: "balanced" },
      renderer: { width: 1280, height: 720, mirror: true, background: "transparent" },
    });

    // 2. Listen for events.
    sdk.on("error", (err) => console.error("[VisuTry]", err));
    sdk.on("ready", () => console.log("SDK ready"));
    sdk.on("glassesLoaded", (asset) => console.log("Loaded:", asset.name));
    sdk.on("performanceUpdated", (stats) =>
      console.log(`FPS: ${stats.fps} | detect: ${stats.detectLatencyMs}ms | render: ${stats.renderLatencyMs}ms`)
    );

    // 3. Initialize → start camera → start try-on → load glasses.
    async function start() {
      await sdk.initialize();
      await sdk.startCamera();
      await sdk.startTryOn();
      await sdk.loadGlasses(aviatorManifest);
    }

    start().catch((err) => console.error("Startup failed:", err));

    // 4. Clean up when the page unloads.
    window.addEventListener("beforeunload", () => sdk.destroy());
  </script>
</body>
</html>
```

### Using ESM / bundler

If you are using Vite, Webpack, or another bundler, the structure is identical — just import from the package and mount the canvas in your component:

```ts
import { createVisuTryWebSDK } from "@visutry/tryon-web";

const sdk = createVisuTryWebSDK({
  canvas: canvasRef.current,      // an HTMLCanvasElement
  camera: { mirror: true },
  tracker: { mode: "balanced" },
});

await sdk.initialize();
await sdk.startCamera();
await sdk.startTryOn();
await sdk.loadGlasses(manifest);
```

---

## Next Steps

- [Web Integration Guide](./web-integration.md) — Full H5 integration with camera setup, tracker modes, events, snapshots, and face shape analysis.
- [WeChat Mini Program Integration](./wechat-integration.md) — Experimental adapter for WeChat.
- [Glasses Asset Standard](./glasses-asset-standard.md) — How to author and validate glasses manifests and GLB models.
- [Face Shape Algorithm](./face-shape-algorithm.md) — Deep dive into the 6-shape scoring algorithm.
- [Privacy Model](./privacy.md) — The on-device-only contract and `PrivacyGuard` API.
- [Performance Guide](./performance.md) — Tracker modes, expected FPS, and low-end device strategies.
