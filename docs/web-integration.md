# Web (H5) Integration

The web adapter combines browser camera access, MediaPipe landmarks, core geometry and a Three.js overlay. `createVisuTryWebSDK()` returns the `VisuTrySDK` interface. There is no exported `VisuTryWebSDK` constructor.

Use a browser with camera permission, WebAssembly and WebGL in an appropriate secure context. Validate the browsers and devices your product supports; the automated reference gate is Chromium with a recorded camera fixture.

## Minimal camera integration

Mount both elements in the same box. Use the source video aspect ratio; do not independently crop, stretch or mirror either layer.

```html
<div id="tryon-stage">
  <video id="tryon-video" autoplay muted playsinline></video>
  <canvas id="tryon-canvas"></canvas>
</div>
<style>
  #tryon-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
  }
  #tryon-video,
  #tryon-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  #tryon-canvas {
    pointer-events: none;
  }
</style>
```

Call this helper from the host's Start action after mounting the elements. Supply a manifest checked by your asset pipeline; the helper also runs the SDK's available validation.

```ts
import { createVisuTryWebSDK } from "@visutry/tryon-web";
import { ManifestValidator, type GlassesAssetManifest } from "@visutry/tryon-core";

export async function startTryOn(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  manifest: GlassesAssetManifest,
) {
  const validator: ManifestValidator = new ManifestValidator();
  validator.validateOrThrow(manifest);

  const updateAspect = () => {
    if (video.parentElement && video.videoWidth && video.videoHeight) {
      video.parentElement.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    }
  };
  video.addEventListener("resize", updateAspect);

  const sdk = createVisuTryWebSDK({
    canvas,
    video,
    snapshotMode: "camera",
    camera: { facingMode: "user", width: 640, height: 480, mirror: true },
    tracker: { mode: "balanced", maxFaces: 1 },
    renderer: {
      width: 640,
      height: 480,
      background: "transparent",
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    },
    privacy: {
      processOnDeviceOnly: true,
      allowSnapshotExport: true,
      allowAnalytics: false,
    },
  });

  const destroy = () => {
    video.removeEventListener("resize", updateAspect);
    sdk.destroy();
  };
  try {
    await sdk.initialize();
    await sdk.loadGlasses(manifest);
    await sdk.startCamera();
    updateAspect();
    await sdk.startTryOn();
    return { sdk, destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
```

The `video` option makes the preview and tracker use the same stream. The SDK mirrors the supplied video and canvas together using `camera.mirror`; do not add another CSS mirror. Without a video target the camera uses an internal video element, so the canvas alone does not show the camera image.

Call the returned cleanup function when leaving the view. To change facing mode through the public facade, destroy the old instance and create another with a different `camera.facingMode`, as the reference demo does.

## Factory options

| Option             | Behavior                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `canvas`           | Required canvas target or selector                                         |
| `video`            | Optional live preview element or selector                                  |
| `snapshotMode`     | `"camera"` combines preview and glasses; `"overlay"` captures glasses only |
| `camera`           | Requested direction, dimensions, frame rate and mirroring                  |
| `tracker`          | Live MediaPipe mode and confidence settings                                |
| `renderer`         | Render dimensions, pixel ratio and antialiasing                            |
| `mediaPipeOptions` | WASM/model locations and optional semantic mapping                         |
| `privacy`          | Web facade snapshot policy                                                 |
| `smoothing`        | Partial core smoothing configuration                                       |
| `fitting`          | Runtime pose-fitting options                                               |

`trackerConfig` and `rendererOptions` are also accepted. Prefer `tracker` and `renderer`; they take precedence when both forms exist.

Internal camera, tracker, renderer and privacy fields are not public facade APIs. There is no facade `resize()`, `setMode()` or `switchCamera()`. Use exported component classes for a custom composition.

With a video target, the facade synchronizes render dimensions to actual video dimensions. Keep the host box at the same aspect ratio. A standalone `ThreeJsRenderer` exposes `resize(width, height)`; resizing that composition is the host's responsibility.

## Lifecycle and errors

| Method                    | Effect                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `initialize()`            | Loads the tracker and creates the renderer                 |
| `loadGlasses(manifest)`   | Loads a model after initialization                         |
| `switchGlasses(manifest)` | Loads a replacement; retains the previous model on failure |
| `startCamera()`           | Initializes if needed and requests a stream                |
| `startTryOn()`            | Starts the camera if needed and begins the loop            |
| `stopTryOn()`             | Stops the loop and hides glasses; capture may continue     |
| `stopCamera()`            | Stops try-on and releases the stream                       |
| `destroy()`               | Releases capture, renderer/tracker resources and listeners |

An initialization failure destroys the instance; create a new one for retry. Catch promise rejections as well as handling events. Permission rejection, missing camera, runtime download failures and failed assets need distinct host UI handling. Inspect `SDKError.code` when present; caught values are `unknown` in TypeScript.

An active try-on loop releases the camera while the document is hidden and attempts to resume when visible. Handle resume failures and still clean up explicitly when the view is removed.

## Events and statistics

Use the same handler reference with `on()` and `off()`.

| Event                        | Payload                |
| ---------------------------- | ---------------------- |
| `ready`, `faceLost`          | No payload             |
| `faceDetected`               | `NormalizedFaceResult` |
| `poseUpdated`                | `GlassesPose`          |
| `glassesLoaded`              | `GlassesAssetManifest` |
| `glassesLoadFailed`, `error` | `SDKError`             |
| `faceShapeAnalyzed`          | `FaceShapeResult`      |
| `performanceUpdated`         | `PerformanceStats`     |

Performance callbacks are emitted roughly once per second while the loop runs. `getPerformanceStats()` returns rolling statistics. These local callbacks remain available with `allowAnalytics: false`; external reporting belongs to the host.

## Face analysis

`analyzeFaceShape()` samples the live camera, temporarily pauses try-on and scores the collected geometry. Defaults request five usable samples at 250 ms intervals with frontal filtering. It rejects on timeout if enough qualifying frames cannot be collected; do not present a sampling request as a guaranteed successful analysis.

Pass `{ frames }` to score pre-collected normalized results. For photo-only analysis, use lightweight subpaths:

```ts
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web/analyzer";
import { LandmarkOverlay } from "@visutry/tryon-web/overlay";

export async function analyzeAndDraw(image: HTMLImageElement, canvas: HTMLCanvasElement) {
  await image.decode();
  const analyzer = createVisuTryImageAnalyzer();
  try {
    const { result, face } = await analyzer.analyzeImage(image);
    new LandmarkOverlay(canvas).renderFromFace(face, image.naturalWidth, image.naturalHeight);
    return result;
  } finally {
    analyzer.destroy();
  }
}
```

Give the overlay a CSS size. Its mapper uses cover-fit coordinates; display the photo with a matching crop. Handle quality warnings and `primary: "unknown"`. See [Face Shape Algorithm](./face-shape-algorithm.md) for score semantics and parity limits.

`analyzeImage` also returns `status: "accepted" | "rejected"`. Rejected observations
retain landmarks but have an unknown classification, zero confidence and no candidates.
No face produces `FACE_NOT_DETECTED`; overlapping analysis produces `ANALYSIS_IN_PROGRESS`.
Both are recoverable. Serialize calls and destroy the analyzer on teardown.
Supply intrinsic `imageSize` when passing pre-collected frames; see the
[0.3.0 migration guide](migration-0.3.md).

## Snapshots

The default mode is `"camera"` with a video target, otherwise `"overlay"`. A camera snapshot needs a running frame. It returns image data to the caller without uploading it.

```ts
import type { VisuTrySDK } from "@visutry/tryon-core";

export async function capturePreview(sdk: VisuTrySDK<Blob>) {
  return sdk.snapshot({ format: "image/png", mirror: true });
}
```

`allowSnapshotExport` defaults to `true`; setting it to `false` blocks the web facade's snapshot operation. It does not disable direct renderer calls or host capture. The renderer uses `preserveDrawingBuffer: false` and re-renders snapshots on demand.

## MediaPipe assets

Default locations:

- WASM: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`
- Model: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`

The reference demo serves prepared files under `/mediapipe/0.10.35/` on its own origin. A host can configure the same layout:

```ts
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web/analyzer";

export function createLocalAssetAnalyzer() {
  return createVisuTryImageAnalyzer({
    wasmPath: "/mediapipe/0.10.35/wasm",
    modelAssetPath: "/mediapipe/0.10.35/models/face_landmarker.task",
  });
}
```

The host must actually serve those files. For the camera factory, put the options inside `mediaPipeOptions`. Align JavaScript and WASM versions, preserve notices, and validate hashes, MIME types and CORS. The SDK does not install a universal offline cache.

glTF can reference extra textures/buffers. Verify the whole asset graph on the deployed origin. See [Reference Release](./SDK_REFERENCE_RELEASE.md) for the current same-origin baseline and pending external-origin work.
