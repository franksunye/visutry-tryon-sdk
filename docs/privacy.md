# Privacy Model

VisuTry is built on a hard **on-device-only** contract. This document describes the privacy model, the `PrivacyGuard` API, configuration options, the data flow (what stays on device), the snapshot export policy, the analytics opt-in model, and compliance notes.

---

## Table of Contents

- [The On-Device-Only Contract](#the-on-device-only-contract)
- [PrivacyGuard API](#privacyguard-api)
- [Configuration](#configuration)
- [Data Flow: What Stays On Device](#data-flow-what-stays-on-device)
- [Snapshot Export Policy](#snapshot-export-policy)
- [Analytics Opt-In](#analytics-opt-in)
- [Runtime Privacy Report](#runtime-privacy-report)
- [Compliance Notes](#compliance-notes)
- [Verifying the Contract](#verifying-the-contract)

---

## The On-Device-Only Contract

The VisuTry SDK is designed so that **face images, video frames, facial landmarks, and face geometry never leave the user's device**. All face tracking, pose solving, face shape analysis, and rendering happen locally in the browser or Mini Program runtime.

This is not a configurable "privacy mode" — it is an architectural invariant enforced by the `PrivacyGuard`, which is the single source of truth for every data-flow decision in the SDK.

The contract has three pillars:

1. **No frame uploads.** Raw camera frames are consumed by the on-device tracker and discarded. They are never transmitted.
2. **No landmark uploads.** The 478-point face mesh, semantic points, and derived geometry remain in memory only for the duration of a tracking session.
3. **Explicit opt-in for everything else.** The only two data flows that can leave the device — snapshot images and anonymous analytics — are both **opt-in** and gated by the `PrivacyGuard`.

### What the contract guarantees

| Data | Uploadable? | Default |
|---|---|---|
| Raw camera frames (pixels) | Never (`canUploadFrames()` always `false`) | — |
| Face landmarks (478 points) | Never (`canUploadLandmarks()` always `false`) | — |
| Face geometry (semantic points, metrics) | Never (`canUploadFaceGeometry()` always `false`) | — |
| Face shape result (shape label + confidence) | Never (stays on device) | — |
| Snapshot image | Configurable (`canExportSnapshot()`) | `true` (but only returned to the caller, not auto-uploaded) |
| Anonymous performance analytics | Configurable (`canEmitAnalytics()`) | `false` |

> **Critical:** Even when `canExportSnapshot()` is `true`, the snapshot is returned to the **caller** as a data URL. The SDK never uploads it anywhere. The host application is responsible for any upload and must obtain user consent for it.

---

## PrivacyGuard API

The `PrivacyGuard` is a small, deterministic class that centralizes every privacy decision. It is constructed from a `PrivacyConfig` and exposes boolean query methods.

```ts
import { PrivacyGuard } from "@visutry/tryon-core";

const guard = new PrivacyGuard({
  allowSnapshotExport: true,
  allowAnalytics: false,
});

guard.canUploadFrames();         // false  (always)
guard.canUploadLandmarks();      // false  (always)
guard.canUploadFaceGeometry();   // false  (always)
guard.canExportSnapshot();       // true
guard.canEmitAnalytics();        // false
```

### Methods

| Method | Return | Description |
|---|---|---|
| `canUploadFrames()` | `false` | Always `false`. Camera frames never leave the device. |
| `canUploadLandmarks()` | `false` | Always `false`. Face landmarks never leave the device. |
| `canUploadFaceGeometry()` | `false` | Always `false`. Semantic points and metrics never leave the device. |
| `canExportSnapshot()` | `boolean` | Returns the configured `allowSnapshotExport` value. |
| `canEmitAnalytics()` | `boolean` | Returns the configured `allowAnalytics` value. |
| `getConfig()` | `PrivacyConfig` | Returns a copy of the current configuration. |

The three upload methods are **hard-wired to `false`**. There is no configuration, no override, and no backdoor that can enable frame/landmark/geometry uploads. This is by design.

### How the SDK uses PrivacyGuard

The `PrivacyGuard` is consulted at every data-flow boundary:

| SDK Component | PrivacyGuard Check | Behavior when `false` |
|---|---|---|
| `MediaPipeFaceTracker` | `canUploadFrames()` | Frames stay in WASM memory; no network calls |
| `FaceShapeScorer` | `canUploadFaceGeometry()` | Metrics stay in memory; result returned to caller only |
| `ThreeJsRenderer.snapshot()` | `canExportSnapshot()` | Throws `SDKError` if `false` |
| `VisuTryWebSDK` (analytics) | `canEmitAnalytics()` | Performance stats emitted locally only; no beacon |

---

## Configuration

Configure privacy via the `privacy` option when creating the SDK:

```ts
const sdk = createVisuTryWebSDK({
  canvas,
  privacy: {
    allowSnapshotExport: true,   // user may capture snapshots
    allowAnalytics: false,       // no anonymous analytics
  },
});
```

```ts
interface PrivacyConfig {
  /** Allow the snapshot() API to capture and return an image. Default: true */
  allowSnapshotExport?: boolean;
  /** Allow anonymous performance analytics to be emitted. Default: false */
  allowAnalytics?: boolean;
}
```

### Defaults

| Option | Default | Rationale |
|---|---|---|
| `allowSnapshotExport` | `true` | Snapshot is returned to the caller (not uploaded); useful for sharing. Disable if your use case forbids any image capture. |
| `allowAnalytics` | `false` | Analytics are opt-in. The SDK never sends telemetry without explicit configuration. |

### Locking down privacy

For maximum privacy (e.g. a medical or regulated context):

```ts
const sdk = createVisuTryWebSDK({
  canvas,
  privacy: {
    allowSnapshotExport: false,
    allowAnalytics: false,
  },
});
```

In this configuration:
- `snapshot()` throws an `SDKError` with code `UNKNOWN` and message indicating snapshot export is disabled.
- No analytics beacons are emitted.
- Frames, landmarks, and geometry are (as always) never uploaded.

---

## Data Flow: What Stays On Device

The diagram below traces every data flow in the SDK. Green paths stay on device; the only paths that can leave the device are explicit user/caller actions (snapshot return, opt-in analytics).

```
┌─────────────────────────────────────────────────────────────┐
│                        USER DEVICE                           │
│                                                              │
│  Camera (getUserMedia / VK)                                  │
│     │  raw pixel frames                                      │
│     ▼                                                        │
│  MediaPipeFaceTracker (WASM, on-device)                      │
│     │  478-point landmarks                                   │
│     ▼                                                        │
│  FaceSemanticMapper                                          │
│     │  14 semantic points                                    │
│     ▼                                                        │
│  ┌─────────────┐    ┌──────────────────┐                    │
│  │ GlassesPose │    │ FaceMetricsCalc  │                    │
│  │   Solver    │    │ + FaceShapeScorer│                    │
│  └──────┬──────┘    └────────┬─────────┘                    │
│         │ GlassesPose        │ FaceShapeResult               │
│         ▼                    ▼                               │
│  PoseSmoother          (returned to caller only)             │
│         │                                                    │
│         ▼                                                    │
│  ThreeJsRenderer (WebGL, on-device GPU)                      │
│         │                                                    │
│         ├──► Canvas (pixels shown to user)  [STAYS ON DEVICE]│
│         │                                                    │
│         └──► snapshot() ──► dataUrl returned to CALLER       │
│                              (only if allowSnapshotExport)    │
│                                                              │
│  PerformanceStats ──► emitted via event [STAYS ON DEVICE]    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │                                  │
         │  NEVER uploaded                  │  Only if caller
         │  (frames, landmarks,             │  explicitly uploads
         │  geometry)                       │  (SDK does not)
         ▼                                  ▼
   [NO NETWORK TRAFFIC]              [CALLER'S RESPONSIBILITY]
```

### What never leaves the device

- Raw camera frames (RGBA pixel buffers)
- The 478-point face landmark mesh
- The 14 semantic points and their 3D coordinates
- The facial transformation matrix
- All face metrics (widths, heights, ratios)
- The face shape classification result (before the caller chooses to use it)
- The glasses pose (position, rotation, scale)
- Performance statistics (FPS, latency)

### What can leave the device (only via caller action)

- **Snapshot image**: returned as a data URL to the caller via `snapshot()`. The SDK does not upload it. The caller may save it, share it, or upload it — that is the caller's responsibility and requires the caller's own consent flow.
- **Anonymous analytics**: only if `allowAnalytics: true` is configured. Even then, the SDK only *enables* the host to emit stats; it does not itself transmit them to any endpoint. The host wires the emission target.

---

## Snapshot Export Policy

Snapshots are the only image data that can be produced from the try-on session. The policy is:

1. **Gated by `PrivacyGuard.canExportSnapshot()`.** If `allowSnapshotExport` is `false`, `snapshot()` throws.
2. **Returned to the caller, not uploaded.** The SDK returns a `SnapshotResult` containing a `dataUrl` (and optional `blob`). It makes zero network requests.
3. **Caller-owned consent.** If the caller intends to upload the snapshot, it must implement its own user consent flow. The SDK provides no upload mechanism.

```ts
try {
  const result = await sdk.snapshot({ format: "image/png" });
  // result.dataUrl is a base64 PNG. The SDK has NOT uploaded it.
  // If you want to upload it, you must ask the user for consent first:
  if (await askUserConsent("Share your try-on photo?")) {
    await uploadToYourServer(result.dataUrl);
  }
} catch (err) {
  // Thrown if allowSnapshotExport is false
  console.error("Snapshot disabled by privacy config");
}
```

### Disabling snapshots

```ts
privacy: { allowSnapshotExport: false }
```

This is appropriate for:
- Try-on experiences where image capture is not a feature
- Regulated contexts (medical, workplace) where capture is prohibited
- Kiosk/demo modes where users should not be able to save images

---

## Analytics Opt-In

The SDK can emit anonymous performance analytics (FPS, latency, tracking stability). This is **off by default** and must be explicitly enabled:

```ts
privacy: { allowAnalytics: true }
```

When enabled, the SDK emits `PerformanceStats` via the `performanceUpdated` event. **The SDK itself does not transmit these stats to any server.** Enabling analytics merely permits the host application to forward the stats to its own analytics endpoint.

```ts
sdk.on("performanceUpdated", (stats) => {
  if (sdk.privacy.canEmitAnalytics()) {
    // Forward to YOUR analytics endpoint (your responsibility)
    navigator.sendBeacon("/your-analytics-endpoint", JSON.stringify({
      fps: stats.fps,
      detectLatencyMs: stats.detectLatencyMs,
      // NO face data, NO landmarks, NO images — only performance numbers
    }));
  }
});
```

### What analytics contain

Analytics events contain **only** performance metadata:

| Field | Type | PII? |
|---|---|---|
| `fps` | number | No |
| `detectLatencyMs` | number | No |
| `renderLatencyMs` | number | No |
| `trackingLostCount` | number | No |
| `mode` | string | No |

They **never** contain face data, landmarks, images, or any user-identifiable information.

---

## Runtime Privacy Report

The `PrivacyGuard.getConfig()` method returns the active configuration. Use it to display a privacy summary to users:

```ts
import { PrivacyGuard } from "@visutry/tryon-core";

const guard = new PrivacyGuard({ allowSnapshotExport: true, allowAnalytics: false });
const config = guard.getConfig();

console.log(config);
// { allowSnapshotExport: true, allowAnalytics: false }
```

You can build a user-facing privacy panel:

```ts
function renderPrivacyPanel(guard: PrivacyGuard) {
  const config = guard.getConfig();
  return `
    <div class="privacy-panel">
      <h3>Privacy</h3>
      <ul>
        <li>Face data processed on-device: <strong>Always</strong></li>
        <li>Camera frames uploaded: <strong>Never</strong></li>
        <li>Face landmarks uploaded: <strong>Never</strong></li>
        <li>Snapshot capture: <strong>${config.allowSnapshotExport ? "Enabled" : "Disabled"}</strong></li>
        <li>Anonymous analytics: <strong>${config.allowAnalytics ? "Enabled" : "Disabled"}</strong></li>
      </ul>
    </div>
  `;
}
```

---

## Compliance Notes

### GDPR (EU)

- VisuTry processes biometric data (face geometry) on-device. Under GDPR, on-device processing that does not transmit personal data is generally outside the scope of data-controller obligations for that data, because no personal data is transmitted to a controller.
- The snapshot, if captured and uploaded by the host application, becomes personal data under GDPR. The host must obtain explicit consent and provide a lawful basis.
- Anonymous performance analytics (if enabled) contain no personal data and do not trigger GDPR data-subject obligations.

### PIPL (China)

- The on-device-only contract aligns with PIPL's principles of data minimization and localized processing.
- Face geometry is "sensitive personal information" under PIPL. Because VisuTry never transmits it, the host avoids the heightened consent and security obligations for sensitive personal information transfers.
- If the host uploads snapshots, separate PIPL consent for sensitive personal information (facial image) is required.

### CCPA / CPRA (California)

- On-device processing that does not transmit personal information does not constitute a "sale" or "share" under CCPA/CPRA.
- Snapshots uploaded by the host may constitute personal information; the host must handle disclosure and deletion requests.

### General recommendations

1. **Disclose camera use.** Always inform users that the camera is used for AR try-on, even though data stays on device. Browsers prompt for camera permission, but an in-app disclosure builds trust.
2. **Document the on-device contract.** Link to this privacy documentation from your privacy policy so users understand that face data is not transmitted.
3. **Handle snapshot consent separately.** If your app allows snapshot sharing, implement a distinct consent step for uploading the image.
4. **Audit your analytics.** If you enable analytics, ensure your endpoint only receives the performance metadata fields, never face data.

---

## Verifying the Contract

The on-device-only contract is verifiable:

1. **Source audit.** The `PrivacyGuard` source shows that `canUploadFrames()`, `canUploadLandmarks()`, and `canUploadFaceGeometry()` return literal `false` with no configuration path to change them.

```ts
canUploadFrames(): boolean { return false; }
canUploadLandmarks(): boolean { return false; }
canUploadFaceGeometry(): boolean { return false; }
```

2. **Network audit.** Run the SDK in a browser with the Network tab open. During a try-on session, the only network requests are:
   - MediaPipe WASM + model download (one-time, on `initialize()`)
   - GLB model download (on `loadGlasses()`)
   - No ongoing requests during tracking/rendering.

3. **Behavioral test.** Disable the network (e.g. DevTools "Offline") after initialization. The SDK continues to track, solve poses, render, and analyze face shapes normally — because none of these operations require network access.

```ts
// After initialize() + loadGlasses(), go offline:
navigator.serviceWorker && // ... simulate offline
// Tracking and rendering continue to work.
```

This offline-resilience is the strongest proof of the on-device-only contract: the SDK's core functionality has zero runtime network dependency.
