# @visutry/tryon-wechat

WeChat Mini Program adapter (**experimental**) for the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) AR glasses try-on SDK.

It adapts the platform-agnostic core to the WeChat Mini Program runtime using:

- **Camera** — `wx.createCameraContext()` frame stream via `WechatCameraProvider`.
- **Face tracking** — WeChat VisionKit `VKSession` face geometry via `WechatFaceTracker`.
- **Rendering** — `wx.createOffscreenCanvas` based renderer (`WechatRenderer`).
- **Facade** — `createWechatSDK` composes the adapters behind the shared
  `VisuTrySDK` interface.

Because the Mini Program runtime has no DOM and `wx` is not available in
Node/jsdom, every adapter depends on a `WechatEnvironment` interface (the
default implementation reads the global `wx`); tests inject a mock.

> This package is experimental and the API may change between minor versions.

## Install

```bash
pnpm add @visutry/tryon-wechat @visutry/tryon-core
# or
npm install @visutry/tryon-wechat @visutry/tryon-core
```

> Requires Node.js >= 20 and the WeChat Mini Program base library that supports
> VisionKit face geometry + offscreen canvas.

## Basic usage

```ts
import { createWechatSDK } from "@visutry/tryon-wechat";
import { setLocale } from "@visutry/tryon-core";
import glassesManifest from "./glasses/aviator-classic.json";

setLocale("zh-CN");

const sdk = createWechatSDK({
  canvasId: "tryon-canvas",
  camera: { facingMode: "user", width: 640, height: 480, frameRate: 30 },
  tracker: { maxFaces: 1, enableTransformationMatrix: true },
  renderer: { width: 640, height: 480, mirror: true },
  privacy: { processOnDeviceOnly: true, allowSnapshotExport: true, allowAnalytics: false },
});

sdk.on("error", (e) => console.error(e));

await sdk.initialize();
await sdk.startCamera();
await sdk.startTryOn();
await sdk.loadGlasses(glassesManifest);

// const result = await sdk.analyzeFaceShape();
// await sdk.destroy();
```

## Exports

`createWechatSDK`, the `WechatSDK` facade, the platform adapters
(`WechatCameraProvider`, `WechatFaceTracker`, `WechatRenderer`) and the
`WechatEnvironment` abstraction.

## Full documentation

See the monorepo docs: <https://github.com/franksunye/visutry-tryon-sdk#readme>
