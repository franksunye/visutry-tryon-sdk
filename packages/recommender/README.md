# @visutry/recommender

Glasses recommendation engine for the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) SDK.

Given a face-shape analysis result (and optional face metrics / user
preferences) plus a glasses inventory, it scores each item with a transparent,
explainable model and returns a ranked list with reasons and cautions.

This package is a reusable rule engine. It does not provide the main site's
complete paid Advisor experience, manage a catalog or establish physical fit.

## Scoring behavior

| Component          | Maximum raw score | Behavior                                                                                                 |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Shape match        | 40                | Face/frame-shape lookup; unknown faces receive 20; preferred shapes add up to 20 within the 40-point cap |
| Size fit           | 30                | Estimated frame-width fit (15) plus lens-width range (15)                                                |
| Brand preference   | 10                | Case-insensitive preferred-brand match                                                                   |
| Material and color | 10                | Up to 5 points for each preference match                                                                 |
| Price              | 10                | Known prices surviving the budget filter receive 10; missing prices receive 5                            |

Items with a known price above `maxPrice` are excluded. Unknown prices remain.
Scores are divided by 100, rounded to four decimals and sorted descending;
ties preserve inventory order. `UserPreferences.style` is currently not scored.

Size conversion uses a fixed normalized-width anchor (`0.30` corresponds to
`140 mm`) and fallback values for missing or invalid metrics. These estimates
depend on framing and input normalization. They are not calibrated measurements
of a person's face or pupillary distance. Missing item dimensions receive a
neutral size score and a caution.

## Install

```bash
pnpm add @visutry/recommender @visutry/tryon-core
# or
npm install @visutry/recommender @visutry/tryon-core
```

The package declares Node.js >= 20 for tooling.
The examples describe repository source; verify the installed npm version's
exports. Documentation changes do not publish new packages.

## Basic usage

```ts
import { Recommender, recommendSize } from "@visutry/recommender";
import type { FaceShapeResult, GlassesItem } from "@visutry/tryon-core";

const recommender = new Recommender();

const inventory: GlassesItem[] = [
  {
    id: "aviator-classic",
    name: "Classic Aviator",
    thumbnailUrl: "/glasses/aviator.png",
    shapeCategory: "aviator",
    dimensions: { frameWidthMm: 142, lensWidthMm: 58, bridgeWidthMm: 14 },
    material: "metal",
    colors: ["#B87333"],
    price: 299,
    brand: "VisuTry Demo",
  },
  // ...more items
];

export function rankFrames(result: FaceShapeResult) {
  const recommendations = recommender.recommend({
    faceShape: result,
    faceMetrics: result.metrics,
    inventory,
  });
  // Sizing is a separate helper, not a field on each ranked result.
  return { recommendations, estimatedSize: recommendSize(result.metrics) };
}
```

Use one consistent currency for `price` and `maxPrice`; neither field carries
currency metadata. An empty inventory returns an empty array.

## API surface

- `Recommender.recommend(input: RecommendationInput): RecommendedGlasses[]`
  — returns items sorted by total score, each with `item`, `score`, `reasons`
  and optional `cautions`. There is no `size` field.
- `recommendSize`, `estimateFaceWidthMm`, `estimateEyeCenterDistanceMm` and
  `SizeRecommendation` expose heuristic sizing separately.
- Match tables, score weights, size-tier thresholds and conversion constants
  are exported for inspection.

## Full documentation

- [Architecture and shared-core ownership](../../docs/architecture.md)
- [Face-shape algorithm and compatibility limits](../../docs/face-shape-algorithm.md)
- [API reference](../../docs/api-reference.md)
