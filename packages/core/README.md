# @visutry/tryon-core

Platform-agnostic core of the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) AR glasses try-on SDK.

It contains no platform (browser / WeChat) code — only the shared foundation:
shared types, coordinate-system transforms, face semantic mapping, face metrics,
face-shape scoring, the glasses pose solver, pose smoothing, the quality gate,
the asset-manifest validator, error helpers, and the i18n message catalogue.

This package is consumed by the platform adapters (`@visutry/tryon-web`,
`@visutry/tryon-wechat`) and the `@visutry/recommender`. Application code
usually depends on a platform adapter rather than the core directly.

This is the intended shared implementation boundary. Its existence does not
establish that the separate VisuTry main site already consumes this package or
returns identical results. See the [architecture and integration requirements](../../docs/architecture.md).

## Install

```bash
pnpm add @visutry/tryon-core
# or
npm install @visutry/tryon-core
```

The package declares Node.js >= 20 for tooling. Core calculations can also run
through an adapter in a browser or Mini Program runtime.
The examples describe repository source; check the installed npm version's
exports when integrating. Documentation changes do not publish new packages.

## Basic usage

```ts
import {
  FaceShapeScorer,
  type FaceShapeResult,
  type NormalizedFaceResult,
} from "@visutry/tryon-core";

const scorer = new FaceShapeScorer();

export function classifyFace(face: NormalizedFaceResult): FaceShapeResult {
  // The caller supplies landmarks normalized by a tracker adapter.
  return scorer.score(face);
}
```

The core does not detect faces in photographs. Use the Web image analyzer for
that path. Handle `primary: "unknown"` and quality warnings explicitly.
Confidence is a heuristic score, not a calibrated probability.

## API surface

- Types: `VisuTrySDK`, `VisuTrySDKConfig`, `FaceShapeResult`, `FaceMetrics`,
  `GlassesAssetManifest`, `GlassesItem`, `RecommendationInput`, ...
- Pipeline: `GlassesPoseSolver`, `PoseSmoother`, `QualityGate`,
  `FaceShapeScorer`, `PrivacyGuard`.
- Helpers: `createSDKError`, `ManifestValidator`, `setLocale` / `getLocale` / `t`.

`VisuTrySDK` is the interface returned by the Web factory. The current WeChat
facade has its own smaller `WechatSDK` interface. `PrivacyGuard` supplies policy
checks; the consuming facade or application must apply them to its operations.

## Full documentation

- [Face-shape algorithm and compatibility limits](../../docs/face-shape-algorithm.md)
- [API reference](../../docs/api-reference.md)
- [Documentation index](../../docs/README.md)
