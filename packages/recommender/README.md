# @visutry/recommender

Glasses recommendation engine for the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) SDK.

Given a face-shape analysis result (and optional face metrics / user
preferences) plus a glasses inventory, it scores each item with a transparent,
explainable model and returns a ranked list with reasons and cautions.

Scoring components:

- **Shape match** (40) — face shape × frame `shapeCategory` lookup table.
- **Size fit** (30) — millimetre-level frame/lens width fit vs. measured face.
- **Preference** (30) — brand, material and colour preferences.

## Install

```bash
pnpm add @visutry/recommender @visutry/tryon-core
# or
npm install @visutry/recommender @visutry/tryon-core
```

> Requires Node.js >= 18.

## Basic usage

```ts
import { Recommender } from "@visutry/recommender";
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

// `result` is the FaceShapeResult returned by `sdk.analyzeFaceShape()`.
const result = faceShapeResult as FaceShapeResult;

const recommendations = recommender.recommend({
  faceShape: result,
  faceMetrics: result.metrics,
  inventory,
});

console.log(recommendations[0].item.name, recommendations[0].reasons);
```

## API surface

- `Recommender.recommend(input: RecommendationInput): RecommendedGlasses[]`
  — returns items sorted by total score, each with `score`, `reasons`,
  `cautions`, and (when available) a `size` recommendation.

## Full documentation

See the monorepo docs: <https://github.com/franksunye/visutry-tryon-sdk#readme>
