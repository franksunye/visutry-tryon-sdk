# @visutry/tryon-web

Web (H5) adapter for the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) AR glasses try-on SDK.

It wires the platform-agnostic core to the browser using:

- **Camera** — `getUserMedia` via `WebCameraProvider` (with facing-mode, track
  loss and disposal handling).
- **Face tracking** — MediaPipe `FaceLandmarker` (`@mediapipe/tasks-vision`)
  via `MediaPipeFaceTracker`.
- **Rendering** — Three.js orthographic overlay renderer (`ThreeJsRenderer`)
  that draws glasses over a CSS-positioned `<video>`.
- **Facade** — `createVisuTryWebSDK` ties camera + tracker + renderer + the core
  pipeline (pose solving, smoothing, quality gate, face-shape analysis,
  privacy guard) together behind a single `VisuTrySDK` interface.

`three` and `@mediapipe/tasks-vision` are **required** peer dependencies —
install them alongside this package.

## Install

```bash
pnpm add @visutry/tryon-web three @mediapipe/tasks-vision
# or
npm install @visutry/tryon-web three @mediapipe/tasks-vision
```

The package declares Node.js >= 20 for tooling. Live try-on requires WebGL2,
`getUserMedia`, camera permission and HTTPS or a supported localhost origin.
These examples describe repository source. Published npm versions may lag this
source; verify the installed version before using newer options such as `video`
and `snapshotMode`. This documentation update does not publish packages.

## Image-only analysis

The analyzer subpath avoids importing Three.js and the camera provider. It still
loads the MediaPipe runtime and face model.

```ts
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web/analyzer";

export async function analyzePhoto(image: HTMLImageElement) {
  await image.decode();
  const analyzer = createVisuTryImageAnalyzer();
  try {
    return await analyzer.analyzeImage(image); // { status, result, face }
  } finally {
    analyzer.destroy();
  }
}
```

`analyzeFaceShapeFromImage(image)` returns only `FaceShapeResult`.
In 0.3.0, `analyzeImage` returns `status: "accepted" | "rejected"`. A rejected
observation retains landmarks and warnings for a retake UI, but its classification
is always `primary: "unknown"`, zero confidence and no candidates. IMAGE mode
observes at least two faces so it can reject a group photo.

No detected face rejects with `FACE_NOT_DETECTED`; overlapping calls on one
analyzer reject with `ANALYSIS_IN_PROGRESS`. Both can be retried. Failed attempts
clear the previous face result, and destruction prevents late results from being
returned. Wait for one analysis before starting another and destroy the instance
when its view is removed. Intrinsic image dimensions, not CSS dimensions, define
the geometry. Classification remains heuristic; see the
[0.3.0 migration guide](../../docs/migration-0.3.md).

## Live camera usage

Place a `<video autoplay muted playsinline>` and a canvas in the same positioned
container. Keep both layers aligned to the same dimensions and aspect ratio. The
SDK mirrors them together; do not independently mirror or crop either in CSS.

The example expects the [reference asset files](../demo-assets/README.md) at
your application's `/reference/v1/` path. It uses a reference model with design
dimensions, not a measured physical product.

```ts
import { createVisuTryWebSDK, ManifestValidator, type VisuTrySDK } from "@visutry/tryon-web";

export async function mountTryOn(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<VisuTrySDK> {
  const response = await fetch("/reference/v1/manifest.json");
  if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
  const manifest: unknown = await response.json();
  const validator: ManifestValidator = new ManifestValidator();
  validator.validateOrThrow(manifest);

  const sdk = createVisuTryWebSDK({
    video,
    canvas,
    camera: { facingMode: "user", width: 640, height: 480, mirror: true },
    tracker: { mode: "balanced", maxFaces: 1, enableTransformationMatrix: true },
    renderer: { width: 640, height: 480, background: "transparent" },
    snapshotMode: "camera",
    privacy: {
      processOnDeviceOnly: true,
      allowSnapshotExport: true,
      allowAnalytics: false,
    },
  });
  sdk.on("error", (error) => console.error(error));

  try {
    await sdk.initialize();
    await sdk.loadGlasses(manifest);
    await sdk.startCamera();
    await sdk.startTryOn();
    return sdk;
  } catch (error) {
    sdk.destroy();
    throw error;
  }
}
```

Call `sdk.destroy()` when the view is removed. Camera snapshots combine the
video and overlay and require a running stream; `snapshotMode: "overlay"`
exports only the glasses layer. Snapshot export is explicitly enabled above;
the current default also enables it. Set `allowSnapshotExport: false` to make
the Web facade reject snapshot requests.

For controlled runtime hosting, set `mediaPipeOptions.wasmPath` and
`mediaPipeOptions.modelAssetPath`. Keep the JavaScript, WASM and model versions
compatible. The [reference release](../../docs/SDK_REFERENCE_RELEASE.md) pins
and serves these files from the demo origin.

## Exports

Public exports include `createVisuTryWebSDK`, `VisuTryWebSDKFactoryOptions`,
`createVisuTryImageAnalyzer`, `ImageAnalyzer`, `ImageAnalysisResult`,
`WebCameraProvider`, `MediaPipeFaceTracker`, `ThreeJsRenderer`, `LandmarkOverlay`,
core types and selected core helpers. The `analyzer` and `overlay` subpaths
provide focused imports.

There is no exported `VisuTryWebSDK` class. The implementation is private;
applications use the factory and its returned `VisuTrySDK` interface.

## Full documentation

- [Web integration guide](../../docs/web-integration.md)
- [API reference](../../docs/api-reference.md)
- [Face-shape algorithm and compatibility limits](../../docs/face-shape-algorithm.md)
