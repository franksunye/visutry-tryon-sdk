# @visutry/tryon-wechat

WeChat Mini Program adapter (**experimental**) for the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) AR glasses try-on SDK.

It adapts the platform-agnostic core to the WeChat Mini Program runtime using:

- **Camera** — `wx.createCameraContext()` frame stream via `WechatCameraProvider`.
- **Face tracking** — WeChat VisionKit `VKSession` face geometry via `WechatFaceTracker`.
- **Rendering scaffold** — `wx.createOffscreenCanvas` through `WechatRenderer`.
- **Facade** — `createWechatSDK` initializes adapters behind the smaller
  `WechatSDK` interface. It does not implement the Web `VisuTrySDK` interface.

**Current scope:** the facade does not run a complete
camera-to-tracker-to-pose-to-render loop. The renderer stores a manifest and pose;
GLB loading and drawing are still placeholders. This package is not an accepted,
complete Mini Program try-on implementation.

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

The package declares Node.js >= 20 for tooling. Runtime integration requires
native Mini Program camera permissions and device support for the VisionKit and
offscreen-canvas APIs used by the adapters. Mock tests do not establish
real-device compatibility.
These examples describe repository source. Check the installed npm version's
exports; this documentation update does not publish packages.

## Initialize the experimental adapters

Run after the host Mini Program page has prepared its native camera component
and permissions. This example starts the adapters; it does not display glasses.

```ts
import { createWechatSDK, type WechatSDK } from "@visutry/tryon-wechat";

export async function startAdapters(): Promise<WechatSDK> {
  const sdk = createWechatSDK({
    camera: { facingMode: "user", width: 640, height: 480, frameRate: 30 },
    tracker: { mode: "balanced", maxFaces: 1, enableTransformationMatrix: true },
    renderer: { width: 640, height: 480, mirror: true },
    canvasType: "webgl",
  });
  try {
    await sdk.start();
    return sdk;
  } catch (error) {
    sdk.destroy();
    throw error;
  }
}
```

Call `sdk.destroy()` at page teardown. Configuration fields are `environment`,
`camera`, `tracker`, `renderer`, `canvasTarget` and `canvasType`; there is no
`canvasId` or Web-style `privacy` field. Supply an existing compatible canvas
as `canvasTarget: { canvas }`; a string canvas ID is not resolved by the current
offscreen renderer.

## Actual facade API

| Member                                        | Current behavior                                                |
| --------------------------------------------- | --------------------------------------------------------------- |
| `camera`, `tracker`, `renderer`               | Expose adapters for host-controlled integration                 |
| `start(): Promise<void>`                      | Initialize/start camera, then initialize tracker and renderer   |
| `stop(): void`                                | Stop the camera stream; retain initialized tracker and renderer |
| `isStarted(): boolean`                        | Report facade started state                                     |
| `loadGlasses(manifest): Promise<void>`        | Store the manifest in the renderer scaffold                     |
| `snapshot(options?): Promise<SnapshotResult>` | Export the renderer canvas where supported                      |
| `destroy(): void`                             | Release all three adapters                                      |

The facade has no `initialize`, `startCamera`, `startTryOn`, `on` or
`analyzeFaceShape` methods. A host that needs classification must explicitly
normalize tracker results and call the shared core scorer.

The WebGL snapshot fallback currently stores a temporary file path in
`SnapshotResult.dataUrl`; do not assume every result is a base64 data URL.
Production adoption still requires frame-loop orchestration, a working model
renderer, validated semantic mapping, a consistent snapshot contract and
real-device acceptance.

## Exports

`createWechatSDK`, the `WechatSDK` / `WechatSDKConfig` types, the platform
adapters (`WechatCameraProvider`, `WechatFaceTracker`, `WechatRenderer`),
environment abstractions, frame types and their type guard. The package does
not re-export the whole core API.

## Full documentation

- [WeChat integration guide](../../docs/wechat-integration.md)
- [Architecture and integration requirements](../../docs/architecture.md)
- [API reference](../../docs/api-reference.md)
