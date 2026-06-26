# WeChat Mini Program Integration (Experimental)

The `@visutry/tryon-wechat` package adapts the VisuTry SDK to the WeChat Mini Program runtime. It uses the WeChat camera component, the WeChat visionkit (VK) face tracking session, and an offscreen canvas for rendering.

> **Status: Experimental.** This adapter is a functional scaffold. The camera provider and face tracker are production-ready; the renderer is an experimental placeholder that requires a custom WebGL pipeline for production-quality try-on. See [Known Limitations](#known-limitations--known-issues).

---

## Table of Contents

- [Architecture](#architecture)
- [Environment Setup](#environment-setup)
- [Installation](#installation)
- [WeChat Environment Abstraction](#wechat-environment-abstraction)
- [Camera Component Setup](#camera-component-setup)
- [VKSession Face Tracking](#vksession-face-tracking)
- [Offscreen Canvas Rendering](#offscreen-canvas-rendering)
- [The createWechatSDK Facade](#the-createwechatsdk-facade)
- [Using Individual Adapters](#using-individual-adapters)
- [Snapshot](#snapshot)
- [Known Limitations & Known Issues](#known-limitations--known-issues)
- [Migration Path to Production](#migration-path-to-production)

---

## Architecture

The WeChat adapter mirrors the web adapter's structure but targets WeChat-native APIs instead of DOM APIs:

```
┌──────────────────────────────────────────────────────┐
│                   createWechatSDK                     │
│                                                       │
│  WechatCameraProvider  ──►  WechatFaceTracker         │
│  (wx.createCameraContext)   (wx.createVKSession)      │
│         │                          │                  │
│    onCameraFrame              detectFace              │
│    (ArrayBuffer)              (468-pt mesh)           │
│         │                          │                  │
│         └──────────┬───────────────┘                  │
│                    ▼                                  │
│            WechatRenderer                            │
│            (wx.createOffscreenCanvas)                │
│            WebGL or 2D context                        │
└──────────────────────────────────────────────────────┘
```

All three adapters share a single `WechatEnvironment` abstraction (the global `wx` object), which makes the entire stack mockable in tests.

---

## Environment Setup

### Prerequisites

- WeChat Developer Tools (latest stable)
- A WeChat Mini Program AppID with camera and visionkit permissions
- WeChat base library version that supports `wx.createVKSession` and `wx.createOffscreenCanvas`

### app.json configuration

Enable the required permissions and components in your Mini Program's `app.json`:

```json
{
  "permission": {
    "scope.camera": {
      "desc": "Used for AR glasses try-on"
    }
  },
  "requiredPrivateInfos": ["getLocation"],
  "lazyCodeLoading": "requiredComponents"
}
```

### page.json configuration

The page that hosts the try-on experience must register the `<camera>` component:

```json
{
  "usingComponents": {
    "camera": "weui-miniprogram/camera/camera"
  }
}
```

> Alternatively, use the built-in `<camera>` component without a custom component registration if your base library supports it.

### Installing the package

If your Mini Program uses npm (via WeChat's npm build):

```bash
pnpm add @visutry/tryon-wechat
```

Then run "Build npm" in WeChat Developer Tools to generate the `miniprogram_npm` directory.

---

## Installation

```bash
pnpm add @visutry/tryon-wechat @visutry/tryon-core
```

The WeChat adapter depends on `@visutry/tryon-core` for all platform-agnostic algorithms (coordinate conversion, semantic mapping, pose solving, smoothing, quality gate, privacy guard, manifest validation). It does **not** depend on MediaPipe or Three.js — those are web-only.

---

## WeChat Environment Abstraction

WeChat exposes its capabilities through the global `wx` object. None of these APIs exist in Node or jsdom test environments, so the adapter talks to a narrow `WechatEnvironment` interface instead:

```ts
interface WechatEnvironment {
  isAvailable(): boolean;            // global wx present?
  hasCamera(): boolean;              // wx.createCameraContext?
  hasVK(): boolean;                  // wx.createVKSession?
  hasOffscreenCanvas(): boolean;     // wx.createOffscreenCanvas?
  createCameraContext(): WechatCameraContextLike;
  createOffscreenCanvas(opts): WechatOffscreenCanvasLike;
  createVKSession(opts): WechatVKSessionLike;
  getSystemInfoSync(): WechatSystemInfoLike;
  canvasToTempFilePath(opts): Promise<{ tempFilePath: string }>;
}
```

The default implementation (`DefaultWechatEnvironment`) reads from the global `wx`. When `wx` is absent, every `has*()` probe returns `false` and the factories throw with a descriptive message. This makes the module safe to import and type-check outside a Mini Program.

### Injecting a mock environment

For testing, inject a mock `WechatEnvironment`:

```ts
import { createWechatSDK } from "@visutry/tryon-wechat";

const mockEnv = {
  isAvailable: () => true,
  hasCamera: () => true,
  hasVK: () => true,
  hasOffscreenCanvas: () => true,
  createCameraContext: () => ({ /* mock */ }),
  createVKSession: () => ({ /* mock */ }),
  createOffscreenCanvas: (opts) => ({ /* mock */ }),
  getSystemInfoSync: () => ({ pixelRatio: 2, windowWidth: 375, windowHeight: 667, platform: "devtools", SDKVersion: "3.0.0" }),
  canvasToTempFilePath: (opts) => Promise.resolve({ tempFilePath: "mock://path" }),
};

const sdk = createWechatSDK({ environment: mockEnv });
```

---

## Camera Component Setup

The WeChat camera is driven by a `<camera>` component in the WXML page. The adapter (`WechatCameraProvider`) only consumes the frame stream exposed by `CameraContext`.

### WXML

```xml
<view class="tryon-stage">
  <camera
    device-position="front"
    flash="off"
    binderror="onCameraError"
    style="width: 100%; height: 100%;"
  ></camera>
</view>
```

The `device-position` attribute selects the camera (`front` / `back`). The adapter toggles `facingMode` on `switchCamera()`, but the actual device switch is controlled by the component property — the host page must bind it.

### Camera frame stream

The provider registers a listener via `ctx.onCameraFrame()`. Each frame arrives as:

```ts
interface WechatCameraFrame {
  data: ArrayBuffer;   // RGBA pixel buffer, width * height * 4 bytes
  width: number;
  height: number;
}
```

The provider caches the latest frame so `getCurrentFrame()` can return it synchronously. The cached frame is wrapped as a `WechatFrameInput`:

```ts
type WechatFrameInput = {
  data: ArrayBuffer;
  width: number;
  height: number;
  mirror?: boolean;
};
```

### JS (page logic)

```ts
import { createWechatSDK } from "@visutry/tryon-wechat";

Page({
  async onLoad() {
    this.sdk = createWechatSDK({
      camera: { facingMode: "user", mirror: true },
      tracker: { mode: "balanced" },
      renderer: { width: 375, height: 500 },
      canvasType: "webgl",
    });

    try {
      await this.sdk.start();
      console.log("WeChat SDK started");
    } catch (err) {
      console.error("Start failed:", err);
    }
  },

  onUnload() {
    this.sdk?.destroy();
  },

  onCameraError(e) {
    console.error("Camera error:", e.detail);
  },
});
```

---

## VKSession Face Tracking

The `WechatFaceTracker` uses `wx.createVKSession({ track: { face: { mode: 1 } } })` for face tracking. VK face mode exposes a 468-point landmark topology that closely mirrors MediaPipe FaceMesh (same canonical mesh indices), so the adapter reuses the core `MEDIAPIPE_SEMANTIC_INDEX_MAP` to map raw landmarks onto the stable `FaceSemanticPoints` contract.

### Detection flow

1. The camera provider supplies a `WechatFrameInput` (ArrayBuffer + dimensions).
2. The tracker calls `session.detectFace({ frameBuffer, width, height })`.
3. The result's `faces[0]` contains the geometry:
   - `points` / `vertices`: flat `[x0, y0, z0, ...]` landmark array
   - `transform`: 4x4 column-major rigid transformation matrix
   - `confidence`: detection confidence in [0, 1]
   - `bbox`: normalized bounding box
4. The tracker converts this to a `NormalizedFaceResult` with semantic points, pose, bbox, and quality.

### Coordinate normalization

VK landmarks are normally already in normalized image space [0, 1]. As a defensive heuristic, if any coordinate exceeds 1.5, the batch is treated as pixel space and converted via `CoordinateSystem.pixelToNormalizedBatch()`. This keeps the tracker robust to SDK-version differences.

### Pose extraction

When the VK `transform` matrix is available (length >= 11), the tracker derives yaw/pitch/roll via the core `decomposeMatrixToEuler()` helper (YXZ order). When no matrix is available, it falls back to zeros with the reported confidence.

### Degradation strategy

VKSession is only available on relatively new WeChat baselines and only inside a real Mini Program. When it is absent (or fails to construct), the tracker records a reason and `detect()` returns `null` rather than throwing. The facade can then surface a "tracking unavailable" UI.

```ts
const tracker = sdk.tracker;
if (tracker.isDegraded()) {
  console.warn("VK unavailable:", tracker.getDegradeReason());
  showUnsupportedMessage();
}
```

---

## Offscreen Canvas Rendering

The `WechatRenderer` creates an offscreen canvas via `wx.createOffscreenCanvas({ type: 'webgl' | '2d' })` and acquires a rendering context, degrading from WebGL to 2D to none.

```ts
const renderer = sdk.renderer;
console.log("Active context type:", renderer.getActiveType()); // "webgl" | "2d" | null
const ctx = renderer.getActiveContext(); // WebGLRenderingContext | CanvasRenderingContext2D | null
```

The renderer stores the loaded glasses asset and the latest pose, and exposes `snapshot()` via `canvas.toDataURL` (2D) or `wx.canvasToTempFilePath` (WebGL).

> **Important:** The renderer in the current experimental build does **not** implement a full glTF rendering pipeline. It creates the canvas and context, stores state, but performs no actual draw calls. The host page is expected to drive its own rendering through the exposed canvas context. See [Known Limitations](#known-limitations--known-issues).

### Canvas type selection

```ts
const sdk = createWechatSDK({
  canvasType: "webgl",  // preferred; falls back to "2d" if WebGL unavailable
  // canvasType: "2d",  // force 2D context
});
```

---

## The createWechatSDK Facade

`createWechatSDK(config)` is a convenience facade that wires together the camera provider, face tracker, and renderer:

```ts
interface WechatSDKConfig {
  environment?: WechatEnvironment;   // inject mock; defaults to global wx
  camera?: CameraConfig;
  tracker?: TrackerConfig;
  renderer?: RenderOptions;
  canvasTarget?: RenderTarget;       // reuse an existing canvas; defaults to fresh offscreen
  canvasType?: "webgl" | "2d";       // default "webgl"
}

interface WechatSDK {
  camera: WechatCameraProvider;
  tracker: WechatFaceTracker;
  renderer: WechatRenderer;
  start(): Promise<void>;
  stop(): void;
  isStarted(): boolean;
  loadGlasses(asset: GlassesAssetManifest): Promise<void>;
  snapshot(options?: SnapshotOptions): Promise<SnapshotResult>;
  destroy(): void;
}
```

### Full usage example

```ts
import { createWechatSDK } from "@visutry/tryon-wechat";
import aviatorManifest from "./glasses/aviator-classic.json";

Page({
  async onLoad() {
    this.sdk = createWechatSDK({
      camera: { facingMode: "user", mirror: true },
      tracker: { mode: "balanced" },
      renderer: { width: 375, height: 500 },
      canvasType: "webgl",
    });

    // Check tracker availability
    await this.sdk.start();

    if (this.sdk.tracker.isDegraded()) {
      wx.showToast({
        title: "Face tracking not supported on this device",
        icon: "none",
      });
      return;
    }

    await this.sdk.loadGlasses(aviatorManifest);
  },

  async onSnapshot() {
    try {
      const result = await this.sdk.snapshot({ format: "image/png" });
      // result.dataUrl contains the temp file path (WebGL) or base64 (2D)
      wx.previewImage({ urls: [result.dataUrl] });
    } catch (e) {
      console.error("Snapshot failed:", e);
    }
  },

  onUnload() {
    this.sdk?.destroy();
  },
});
```

### start() lifecycle

`start()` initializes and starts all three adapters in order:

1. `camera.initialize(config)` + `camera.start()` — opens the camera frame stream.
2. `tracker.initialize(config)` — creates the VKSession (or enters degraded mode).
3. `renderer.initialize(canvasTarget, options)` — creates the offscreen canvas and context.

---

## Using Individual Adapters

For advanced use cases, you can use the adapters directly instead of the facade:

```ts
import { WechatCameraProvider } from "@visutry/tryon-wechat";
import { WechatFaceTracker } from "@visutry/tryon-wechat";
import { WechatRenderer } from "@visutry/tryon-wechat";

const camera = new WechatCameraProvider();
const tracker = new WechatFaceTracker();
const renderer = new WechatRenderer({ canvasType: "webgl" });

await camera.initialize({ facingMode: "user", mirror: true });
await camera.start();
await tracker.initialize({ mode: "balanced" });
await renderer.initialize({ type: "wechat" }, { width: 375, height: 500 });

// Manual tracking loop
setInterval(() => {
  const frame = camera.getCurrentFrame();
  if (!frame) return;
  tracker.detect(frame).then((face) => {
    if (face) {
      // Use GlassesPoseSolver from core to compute the pose
      // Then renderer.applyPose(pose)
    }
  });
}, 33);
```

This gives you full control over the tracking loop and lets you integrate the core's `GlassesPoseSolver`, `PoseSmoother`, `QualityGate`, and `FaceShapeScorer` directly.

---

## Snapshot

The renderer supports two snapshot paths depending on the active canvas type:

| Canvas Type | Method | Output |
|---|---|---|
| 2D | `canvas.toDataURL(mime, quality)` | Base64 data URL |
| WebGL | `wx.canvasToTempFilePath()` | Temp file path (stored in `dataUrl`) |

```ts
const result = await sdk.snapshot({
  format: "image/png",   // "image/png" or "image/jpeg"
  quality: 0.92,
  width: 375,
  height: 500,
});
```

> **Note:** For WebGL canvases, `result.dataUrl` contains a `tempFilePath` (a local file path), not a base64 data URL. A production build should read the temp file and base64-encode it (or upload it directly) if a data URL is needed downstream.

---

## Known Limitations & Known Issues

### 1. Renderer is a placeholder

The current `WechatRenderer` creates the canvas and context but does not implement a glTF rendering pipeline. WeChat's WebGL surface has several constraints that make a full glTF glasses pipeline non-trivial:

- Limited WebGL extensions (no standard `EXT_color_buffer_float`, restricted texture formats)
- No async shader compilation
- Synchronous GPU stalls on some Android WeChat versions
- Restricted max texture size on older devices

**Workaround:** The host page can drive its own rendering pipeline through the canvas context exposed via `renderer.getActiveContext()`.

### 2. VKSession availability

`wx.createVKSession` is only available on:
- WeChat base library >= 2.30.0 (check your `SDKVersion`)
- iOS and Android (not available in the devtools simulator on some versions)

When unavailable, the tracker enters degraded mode (`isDegraded() === true`) and `detect()` returns `null`. Always check this and show a fallback UI.

### 3. Camera frame format

WeChat camera frames arrive as RGBA `ArrayBuffer` via `onCameraFrame`. The frame rate and resolution depend on the device and may be lower than the configured camera resolution. The tracker handles any resolution gracefully.

### 4. No `requestAnimationFrame`

WeChat Mini Programs do not have `requestAnimationFrame`. The web facade's RAF-based loop does not apply here. You must drive the tracking loop manually (via `setInterval`, `setTimeout` recursion, or the VKSession's own `on('update')` event if available).

### 5. Offscreen canvas vs. on-screen canvas

`wx.createOffscreenCanvas` creates a canvas that is not attached to the DOM. To display it, you must draw its content onto an on-screen `<canvas>` component or save it as an image. The experimental adapter does not handle this compositing step.

### 6. Mirror handling

The camera `mirror` flag is propagated to the `WechatFrameInput` but the actual pixel mirroring must be handled by the renderer or the host page. The adapter does not flip the ArrayBuffer pixels.

### 7. Memory constraints

WeChat Mini Programs have stricter memory limits than browsers. Large GLB models or high-resolution frame buffers can trigger out-of-memory kills. Keep models under 2 MB and use modest canvas resolutions (375x500 is typical).

---

## Migration Path to Production

To move from the experimental adapter to production-quality try-on:

1. **Implement a custom WebGL renderer** that parses glTF/glb, builds GPU vertex/index buffers and materials, uploads textures, and issues draw calls with the model matrix derived from `GlassesPose`. The `WechatRenderer` is designed to expose the canvas context for exactly this purpose.

2. **Use the core algorithms directly.** The `GlassesPoseSolver`, `PoseSmoother`, `QualityGate`, and `FaceShapeScorer` are fully production-ready and platform-agnostic. Compose them with your custom renderer.

3. **Drive a manual tracking loop** using `camera.getCurrentFrame()` and `tracker.detect()`, applying the solved and smoothed pose to your renderer each iteration.

4. **Handle the VKSession `on('update')` event** (if available in your base library) for a more efficient event-driven loop instead of polling.

```ts
// Production skeleton
import {
  GlassesPoseSolver,
  PoseSmoother,
  QualityGate,
} from "@visutry/tryon-core";
import { WechatCameraProvider, WechatFaceTracker } from "@visutry/tryon-wechat";
// Your custom renderer
import { CustomWechatRenderer } from "./CustomWechatRenderer";

const camera = new WechatCameraProvider();
const tracker = new WechatFaceTracker();
const renderer = new CustomWechatRenderer();
const solver = new GlassesPoseSolver();
const smoother = new PoseSmoother();

await camera.initialize({ mirror: true });
await camera.start();
await tracker.initialize({ mode: "balanced" });
await renderer.initialize();

async function loop() {
  const frame = camera.getCurrentFrame();
  if (frame) {
    const face = await tracker.detect(frame);
    if (face && currentAsset) {
      const rawPose = solver.solve({ face, asset: currentAsset });
      const smoothed = smoother.smooth(rawPose, Date.now());
      renderer.applyPose(smoothed);
    }
  }
  setTimeout(loop, 33); // ~30fps
}
loop();
```
