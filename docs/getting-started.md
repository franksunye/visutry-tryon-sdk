# Getting Started

The SDK is VisuTry's reusable local face geometry, recommendation and AR capability layer. Accounts, paid reports, image generation and commerce remain in the host application. See [Product Positioning](./product-positioning.md) and [Architecture](./architecture.md).

## Run the reference demo

Use Node.js 22 and pnpm 10.31.0, matching the repository tooling baseline. Package manifests require Node.js >=20; this is a tooling requirement, not a browser support guarantee.

```bash
git clone https://github.com/franksunye/visutry-tryon-sdk.git
cd visutry-tryon-sdk
pnpm --version
pnpm install --frozen-lockfile
pnpm build
pnpm demo:web
```

Use the local URL printed by Vite. `demo:web` prepares the pinned MediaPipe runtime and verifies the committed reference geometry. Initial preparation downloads the face model and checks its expected hash.

The [public reference demo](https://visutry-sdk-demo.vercel.app) uses the real renderer and MediaPipe runtime. Its [source](../examples/web-demo) includes original demonstration geometry, not a purchasable product or a calibrated physical fitting model. See [Reference Release](./SDK_REFERENCE_RELEASE.md) for reproducible gates and provenance.

The source demo also contains `/face-analysis.html` and `/compare.html`. The comparison page is a development aid; it does not verify parity with the current production website.

## Choose an entry point

| Need                      | Entry point                   | Host supplies                                               |
| ------------------------- | ----------------------------- | ----------------------------------------------------------- |
| Score normalized geometry | `@visutry/tryon-core`         | Landmarks and their source image dimensions                                    |
| Analyze a photo           | `@visutry/tryon-web/analyzer` | A decoded image, canvas, bitmap or video frame              |
| Draw landmarks            | `@visutry/tryon-web/overlay`  | Canvas and normalized face result                           |
| Camera AR try-on          | `@visutry/tryon-web`          | Canvas, visible video, assets and lifecycle controls        |
| Rank an inventory         | `@visutry/recommender`        | Inventory, preferences, optional face result and physical measurements                      |
| Explore WeChat            | `@visutry/tryon-wechat`       | Verified platform bridge, tracking loop and custom renderer |

The analyzer subpath avoids the Three.js import graph. The full web entry point includes the renderer. WeChat remains an experimental scaffold; see [WeChat Integration](./wechat-integration.md).

## Install in a web application

Use a bundler with ES module support. The full web package declares MediaPipe and Three.js as peer dependencies:

```bash
pnpm add @visutry/tryon-core @visutry/tryon-web @mediapipe/tasks-vision@0.10.35 three@0.170.0
```

Pin the chosen SDK versions in the host lockfile. Source and published packages may differ; inspect the changelog and exports for the release you install. Keep MediaPipe JavaScript and WASM versions aligned.

In Next.js or another server-rendered application, construct browser adapters in client-side code after the DOM elements exist. Pure core calculations do not require a camera or DOM.

For a detector you already own, use the [shared-core example](../examples/shared-core/README.md).
For upgrades, review [0.3.0 compatibility changes](migration-0.3.md).

## Analyze a local photo

This complete TypeScript helper returns a result and releases the resources it creates:

```ts
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web/analyzer";

export async function analyzePhoto(file: File) {
  const image = await createImageBitmap(file);
  const analyzer = createVisuTryImageAnalyzer();
  try {
    const { result } = await analyzer.analyzeImage(image);
    return result;
  } finally {
    analyzer.destroy();
    image.close();
  }
}
```

The default tracker downloads WASM and a model from public hosts. Processing the photo locally still involves those asset downloads. To self-host them, pass `wasmPath` and `modelAssetPath` to the factory. See [Web Integration](./web-integration.md#mediapipe-assets) and [Privacy](./privacy.md).

A failed detection rejects the call. A detected face can still return `primary: "unknown"` or quality warnings. Confidence is an algorithm score, not a calibrated probability or a physical measurement.

## Start camera try-on

Follow the complete [Web Integration example](./web-integration.md#minimal-camera-integration):

1. Construct the SDK with a canvas and visible video target.
2. Call `initialize()` to load the tracker and initialize WebGL.
3. Validate and load a glasses manifest.
4. Start the camera from a user action, then call `startTryOn()`.
5. Handle detection, loading and permission failures in the host UI.
6. Call `destroy()` when leaving the experience.

The factory is synchronous; initialization, camera acquisition and loading return promises. `stopTryOn()` stops the loop but does not release the camera. Use `stopCamera()` or `destroy()` when capture should end.

## Validate an integration

Run the source gates with the pinned toolchain:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm demo:build
pnpm docs:api
```

The reference browser gate uses Chromium's fake camera with real MediaPipe and WebGL. It does not establish physical camera quality, optical fitting accuracy, Safari/Android performance or WeChat acceptance. Record those checks separately before claiming product support.

Continue with [Asset Standard](./glasses-asset-standard.md), [Performance](./performance.md), [Privacy](./privacy.md) and the [Roadmap](./roadmap.md).
