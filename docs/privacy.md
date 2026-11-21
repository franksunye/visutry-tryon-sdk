# Privacy and Data Flow

Implemented face processing runs locally. The SDK contains no upload service or analytics transport. Runtime assets and models can still load over the network, and the host receives data it can store or transmit.

`PrivacyGuard` is a policy helper, not a sandbox or network interceptor. It cannot prevent host code or third-party scripts from accessing data. This guide describes implementation behavior, not a legal compliance certification.

## Data paths

| Data                    | SDK behavior                           | Host responsibility                                 |
| ----------------------- | -------------------------------------- | --------------------------------------------------- |
| Camera frames           | Read by local camera/tracker           | Explain capture, manage permissions, release stream |
| Selected photo          | Read by local image analysis           | Selection, retention and any later upload           |
| Landmarks/geometry      | Exposed in results and local callbacks | Minimize logging, storage and transmission          |
| Analysis/recommendation | Returned to caller                     | Product retention and disclosure                    |
| Web snapshot            | Image data URL returned to caller      | Capture UI, persistence and sharing                 |
| WeChat snapshot         | Data URL or local file path            | Platform semantics and export policy                |
| Performance statistics  | Local methods/events                   | Any external reporting                              |

The analyzer retains its last result for `getLastFaceResult()`; callers can retain results independently. Destroying SDK resources does not erase host-retained copies. Drop unneeded references and avoid face-data logging.

## Network activity

The default web tracker loads WASM from jsDelivr and a face model from Google storage. The reference demo uses same-origin prepared assets. `GLTFLoader` fetches glasses and any referenced textures/buffers.

Asset loading is separate from uploading a face. Self-hosting reduces third-party asset requests but does not create a network sandbox. The package does not install an offline cache or block arbitrary network APIs.

Local work can be tested after assets load, but new models, fresh trackers, missing caches or another analysis mode can require further downloads. Validate the actual flow before promising offline operation.

See [Web Integration](./web-integration.md#mediapipe-assets) and [Reference Release](./SDK_REFERENCE_RELEASE.md) for paths, version alignment and notices.

## PrivacyGuard defaults

| Setting               | Default  | Meaning                                                            |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `processOnDeviceOnly` | `true`   | Required policy value; helper resets a false runtime value to true |
| `allowSnapshotExport` | `true`   | Web facade permits snapshots unless disabled                       |
| `allowAnalytics`      | `false`  | Policy input for host-controlled reporting                         |
| `analyticsLevel`      | `"none"` | Performance/diagnostic reporting level                             |

Snapshots are enabled by default. A capture call is a host action, but the configuration is not opt-in by default.

| API                                                                    | Behavior                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `config_` getter                                                       | Returns a shallow configuration copy                             |
| `configure(partial)`                                                   | Merges settings and reapplies the on-device value                |
| `canUploadFrames()`, `canUploadLandmarks()`, `canUploadFaceGeometry()` | Always false                                                     |
| `canExportSnapshot()`                                                  | Reads snapshot policy                                            |
| `canEmitAnalytics()`                                                   | Requires `allowAnalytics === true` and level other than `"none"` |
| `canReportPerformance()`                                               | Enabled analytics at performance or diagnostic level             |
| `canReportDiagnostics()`                                               | Enabled analytics at diagnostic level                            |
| `guard(predicate, action)`                                             | Runs an action only if the supplied predicate passes             |
| `redactionSummary()`                                                   | Returns category booleans; does not redact payloads              |

There is no `getConfig()` method or general payload-redaction function.

## Enforcement boundary

The web facade checks `canExportSnapshot()` before capture. Its internal guard is private; `sdk.privacy` is not a public API.

Direct renderer snapshots and experimental WeChat snapshots do not perform that check. The host must enforce its policy on those paths. WeChat has no `privacy` factory option.

Local face/performance events remain available regardless of `allowAnalytics`. That flag neither suppresses callbacks nor creates a transport. The tracker does not consult the guard before every operation; its processing is local and has no image-upload path.

A host can apply a separate reporting policy:

```ts
import { PrivacyGuard, type PerformanceStats } from "@visutry/tryon-core";

export function createPerformancePolicy(
  consentGranted: boolean,
  report: (stats: PerformanceStats) => void,
) {
  const guard = new PrivacyGuard({
    processOnDeviceOnly: true,
    allowSnapshotExport: false,
    allowAnalytics: consentGranted,
    analyticsLevel: consentGranted ? "performance" : "none",
  });
  return {
    config: () => guard.config_,
    onSample: (stats: PerformanceStats) => {
      if (guard.canReportPerformance()) report(stats);
    },
    revoke: () =>
      guard.configure({
        allowAnalytics: false,
        analyticsLevel: "none",
      }),
  };
}
```

The example evaluates host policy; it does not obtain consent or provide a transport. The host determines what `report` does and which fields are permitted.

## Host responsibilities

Make camera and snapshot actions understandable. Handle denial, revocation and teardown. Obtain permissions or consent required for the host's actual collection/sharing, and define retention/deletion for stored data.

Avoid remote logs containing photos, frame buffers, landmarks or full result objects. An error's `cause` can contain upstream information; minimize it before external reporting.

Inspect deployed network activity during initialization, loading, analysis, capture and sharing, including host code and third-party scripts. Absence of an SDK upload path does not establish application-wide compliance.

Use [Security Policy](../SECURITY.md) to report vulnerabilities. Product privacy claims must describe the complete implemented data flow.
