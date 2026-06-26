# @visutry/tryon-core

Platform-agnostic core of the [VisuTry](https://github.com/visutry/visutry-tryon-sdk) AR glasses try-on SDK.

It contains no platform (browser / WeChat) code — only the shared foundation:
shared types, coordinate-system transforms, face semantic mapping, face metrics,
face-shape scoring, the glasses pose solver, pose smoothing, the quality gate,
the asset-manifest validator, error helpers, and the i18n message catalogue.

This package is consumed by the platform adapters (`@visutry/tryon-web`,
`@visutry/tryon-wechat`) and the `@visutry/recommender`. Application code
usually depends on a platform adapter rather than the core directly.

## Install

```bash
pnpm add @visutry/tryon-core
# or
npm install @visutry/tryon-core
```

> Requires Node.js >= 18.

## Basic usage

```ts
import {
  createSDKError,
  GlassesPoseSolver,
  QualityGate,
  setLocale,
  t,
  type FaceShapeResult,
} from "@visutry/tryon-core";

// Localise user-facing SDK error messages (default locale: "en").
setLocale("zh-CN");

try {
  // ...core pipeline helpers run here...
} catch (err) {
  // err is a normalised SDKError whose message comes from the i18n catalogue.
  console.error(t("error.sdk_destroyed"));
  throw createSDKError("UNKNOWN", t("error.sdk_destroyed"), err);
}
```

## API surface

- Types: `VisuTrySDK`, `VisuTrySDKConfig`, `FaceShapeResult`, `FaceMetrics`,
  `GlassesAssetManifest`, `GlassesItem`, `RecommendationInput`, ...
- Pipeline: `GlassesPoseSolver`, `PoseSmoother`, `QualityGate`,
  `FaceShapeScorer`, `PrivacyGuard`.
- Helpers: `createSDKError`, `ManifestValidator`, `setLocale` / `getLocale` / `t`.

## Full documentation

See the monorepo docs: <https://github.com/visutry/visutry-tryon-sdk#readme>
