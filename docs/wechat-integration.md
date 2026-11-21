# WeChat Mini Program Integration

**Status: experimental scaffold.** The package contains camera and VisionKit bridges, a small facade and a placeholder renderer. It is not a complete production try-on pipeline. Tests with injected environments do not establish real-device or base-library compatibility.

## Implementation boundary

| Component              | Implemented                                          | Still required                                                |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `WechatCameraProvider` | Reads RGBA frames through an environment interface   | Verify native frame-listener API and lifecycle                |
| `WechatFaceTracker`    | Converts expected VK results to normalized face data | Verify schema, landmarks, coordinates and pose on devices     |
| `WechatRenderer`       | Creates/reuses canvas; stores asset and pose state   | glTF loading, materials, draw calls and on-screen composition |
| `createWechatSDK()`    | Starts/stops the stack and exposes components        | Host tracking/scoring/render loop                             |
| Core algorithms        | Consume normalized face data                         | Verify adapter normalization before trusting results          |

`loadGlasses()` stores a manifest; it does not fetch or render the model. `applyPose()` stores a pose without draw calls. Successful initialization does not prove visible try-on.

## Environment and installation

```bash
pnpm add @visutry/tryon-wechat @visutry/tryon-core
```

Node.js >=20 is a tooling requirement, not the runtime inside WeChat. The host owns camera authorization and the visible camera component.

The injectable `WechatEnvironment` covers camera contexts, VK sessions, canvas creation and snapshot export. Its default implementation reads global `wx`. Presence checks do not establish that native objects match every expected method or result. Supply a verified bridge when needed.

In particular, the camera abstraction expects `onCameraFrame(callback)`, `start(callback)` and `stop(callback)` on its context. Check the platform's actual frame-listener lifecycle. Do not infer a supported minimum base-library version from those names.

## Actual facade API

`createWechatSDK(config)` returns `WechatSDK`, a different interface from the web `VisuTrySDK`.

| Option         | Meaning                                 |
| -------------- | --------------------------------------- |
| `environment`  | Optional custom bridge                  |
| `camera`       | Camera configuration                    |
| `tracker`      | Tracker configuration, including `mode` |
| `renderer`     | Canvas dimensions and rendering options |
| `canvasTarget` | Optional existing target                |
| `canvasType`   | `"webgl"` or `"2d"`                     |

Methods are `start()`, `stop()`, `isStarted()`, `loadGlasses()`, `snapshot()` and `destroy()`. The composed `camera`, `tracker` and `renderer` are exposed.

There is no facade `initialize()`, `startCamera()`, `startTryOn()`, `on()`, `analyzeFaceShape()`, `canvasId` option or `privacy` option.

## Initialize the scaffold

This helper accepts a host-verified environment and checks degraded components. It does not claim to display glasses.

```ts
import { createWechatSDK, type WechatEnvironment } from "@visutry/tryon-wechat";

export async function startWechatScaffold(environment: WechatEnvironment) {
  const sdk = createWechatSDK({
    environment,
    camera: { facingMode: "user", mirror: true },
    tracker: { mode: "balanced" },
    renderer: { width: 375, height: 500 },
    canvasType: "webgl",
  });
  try {
    await sdk.start();
    if (sdk.tracker.isDegraded()) {
      throw new Error(sdk.tracker.getDegradeReason() ?? "Tracking unavailable");
    }
    if (!sdk.renderer.getActiveContext()) {
      throw new Error("No rendering context is available");
    }
    return sdk;
  } catch (error) {
    sdk.destroy();
    throw error;
  }
}
```

Call `stop()` when capture should end and `destroy()` on teardown. Clean up partial start failures; avoid repeatedly starting an active scaffold.

The host owns the camera component's `device-position` binding. Changing adapter facing-mode state does not itself change that binding. Camera and rendered output also need consistent host-managed mirroring.

## Use core analysis

The facade does not run a tracking loop. The host can invoke tracking and scoring directly:

```ts
import { FaceShapeScorer } from "@visutry/tryon-core";
import type { WechatSDK } from "@visutry/tryon-wechat";

export async function analyzeCurrentWechatFrame(sdk: WechatSDK) {
  const frame = sdk.camera.getCurrentFrame();
  if (!frame) return null;
  const face = await sdk.tracker.detect(frame);
  if (!face) return null;
  return new FaceShapeScorer().score(face);
}
```

For repeated work, reuse the scorer, serialize calls and stop the loop on page hide. Compose core pose solving, smoothing and quality gates with a renderer that actually draws. The adapter assumes a MediaPipe-like semantic mapping; validate it against real VK output.

## Snapshots and privacy

If the canvas exposes `toDataURL()`, the renderer returns an image data URL. Otherwise it calls `canvasToTempFilePath()` and places the local file path in `SnapshotResult.dataUrl`. Do not assume this field always starts with `data:`.

Only content actually drawn to the canvas can be captured. The scaffold does not automatically composite camera and glasses. Its snapshot path does not consult `PrivacyGuard`; export and sharing policy belong to the host. No SDK upload or telemetry transport is implemented.

## Release acceptance

Verify native camera access, permissions, VK fields, landmark mapping, orientation and mirroring on target iOS/Android devices. Implement and verify rendering, tracking loss/recovery, cleanup, snapshot semantics and sustained performance. Record the actual WeChat/base-library versions and limitations.

See [Architecture](./architecture.md), [Asset Standard](./glasses-asset-standard.md) and [Privacy](./privacy.md).
