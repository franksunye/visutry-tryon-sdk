# @visutry/tryon-web

Web (H5) adapter for the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) AR glasses try-on SDK.

It wires the platform-agnostic core to the browser using:

- **Camera** — `getUserMedia` via `WebCameraProvider` (with facing-mode, track
  loss and disposal handling).
- **Face tracking** — MediaPipe `FaceLandmarker` (`@mediapipe/tasks-vision`)
  via `MediaPipeFaceTracker`.
- **Rendering** — Three.js orthographic overlay renderer (`ThreeJsRenderer`)
  that draws glasses over a CSS-positioned `<video>`.
- **Facade** — `VisuTryWebSDK` ties camera + tracker + renderer + the core
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

> Requires Node.js >= 18. The browser must support WebGL2 and `getUserMedia`.

## Basic usage

```ts
import { createVisuTryWebSDK } from "@visutry/tryon-web";
import { setLocale } from "@visutry/tryon-core";
import glassesManifest from "./glasses/aviator-classic.json";

setLocale("en");

const sdk = createVisuTryWebSDK({
  canvas: document.getElementById("tryon-canvas") as HTMLCanvasElement,
  camera: { facingMode: "user", width: 640, height: 480, frameRate: 30 },
  tracker: { mode: "balanced", maxFaces: 1, enableTransformationMatrix: true },
  renderer: { width: 640, height: 480, mirror: true, background: "transparent" },
  privacy: { processOnDeviceOnly: true, allowSnapshotExport: true, allowAnalytics: false },
});

sdk.on("error", (e) => console.error(e));
sdk.on("faceDetected", () => console.log("face!"));

await sdk.initialize();
await sdk.startCamera();
await sdk.startTryOn();
await sdk.loadGlasses(glassesManifest);

// later: analyse face shape, take a snapshot, then dispose
// const result = await sdk.analyzeFaceShape();
// const snap = await sdk.snapshot({ format: "image/png" });
// await sdk.destroy();
```

## Exports

`createVisuTryWebSDK`, the `VisuTryWebSDK` class, the platform components
(`WebCameraProvider`, `MediaPipeFaceTracker`, `ThreeJsRenderer`), and a
re-export of the core API.

## Full documentation

See the monorepo docs: <https://github.com/franksunye/visutry-tryon-sdk#readme>
