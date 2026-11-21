# @visutry/recommender

Reusable, deterministic glasses-ranking rules for the [VisuTry](https://github.com/franksunye/visutry-tryon-sdk) SDK. Rank your own catalog with user preferences, an optional valid face-shape result, and optional physical measurements supplied by your application.

The package contains no camera, DOM or rendering integration. Its rules can be shared by web, JavaScript mobile and mini-program applications; each host supplies its own detection, validation, catalog and UI adapters. It does not provide the main site's paid Advisor workflow or verify physical fit.

## Install

```bash
pnpm add @visutry/recommender @visutry/tryon-core
# or
npm install @visutry/recommender @visutry/tryon-core
```

Node.js >= 20 is required for repository tooling. This README describes the current source contract; check the installed npm version before using the migration below. A source change does not publish a package.

## Start with preferences and your catalog

No face result or camera is required:

```ts
import { Recommender } from "@visutry/recommender";
import type { GlassesItem } from "@visutry/tryon-core";

const inventory: GlassesItem[] = [
  {
    id: "demo-rectangle",
    name: "Demo Rectangle",
    thumbnailUrl: "/frames/rectangle.svg",
    shapeCategory: "rectangle",
    brand: "Example",
    dimensions: { frameWidthMm: 140, lensWidthMm: 50 },
    price: 120,
  },
  {
    id: "demo-round",
    name: "Demo Round",
    thumbnailUrl: "/frames/round.svg",
    shapeCategory: "round",
    price: 150,
  },
];

const ranked = new Recommender().recommend({
  inventory,
  preferences: {
    brands: ["Example"],
    preferredShapes: ["rectangle"],
    maxPrice: 200,
  },
});

console.log(ranked[0].item.id); // "demo-rectangle"
console.log(ranked[0].faceShapeApplied); // false
console.log(ranked[0].size);
// { status: "unavailable", reason: "measurements-required" }
console.log(ranked[0].reasons, ranked[0].cautions);
```

Use one consistent currency for `price` and `maxPrice`; these fields do not carry currency metadata. Known prices above the budget are excluded. Unknown prices remain with a caution when a budget is supplied. An empty inventory returns an empty array.

## Add face-shape analysis when it is usable

Pass `faceShape` from the core analysis pipeline alongside the same catalog and preferences. Shape rules are applied only when:

- `primary` is a recognized shape other than `"unknown"`;
- `metrics.geometryValid === true`;
- there are no blocking result or geometry warnings;
- the heuristic `confidence` is finite, greater than zero and no greater than one.

The confidence check rejects missing/invalid metadata; it is not an accuracy threshold. For example, `0.01` and `0.9` apply the same shape-table contribution when the geometry is explicitly valid. Confidence and recommendation score are not calibrated probabilities.

Core analysis rejects unusable input by returning an unknown shape. Missing analysis, unknown results, rejected geometry, and older manually constructed metrics without the validity flag all receive a neutral shape contribution. Preferences continue to work, and `faceShapeApplied: false` plus the explanations identify this fallback. Do not set `geometryValid` yourself to bypass a failed analysis.

```ts
import type { FaceShapeResult, GlassesItem } from "@visutry/tryon-core";
import { Recommender } from "@visutry/recommender";

export function rankFromAnalysis(faceShape: FaceShapeResult, inventory: GlassesItem[]) {
  return new Recommender().recommend({ faceShape, inventory });
}
```

## Physical size is a separate input

Image-space face widths change with camera distance, cropping and image scale. They are never converted to millimeters. Without explicit physical measurements, every item receives a neutral size contribution and `size.status === "unavailable"`.

Your application may supply measurements after establishing their provenance and calibration:

```ts
import { Recommender, recommendSize, type PhysicalFaceMeasurements } from "@visutry/recommender";
import type { GlassesItem } from "@visutry/tryon-core";

export function rankWithMeasurements(inventory: GlassesItem[]) {
  // Sample application input, not an SDK default or a photo-based estimate.
  const measurements: PhysicalFaceMeasurements = {
    faceWidthMm: 140,
    source: "measured", // or "calibrated"
    // eyeCenterDistanceMm: 62, // optional; omitted values stay unavailable
  };

  const ranked = new Recommender().recommend({ inventory, measurements });
  const size = recommendSize(measurements);
  if (size.status === "available") {
    console.log(size.source, size.faceWidthMm, size.tier);
  }
  return ranked;
}
```

`source` records the host's assertion. The SDK checks the source label and numeric validity; it cannot prove that a measurement was performed correctly or that a calibration is accurate. All supplied distances must be finite numbers greater than zero. If a supplied optional eye-center distance is invalid, the measurement input is rejected as a whole.

`recommendSize(measurements?)` and each ranked result's `size` use the same discriminated union:

| Status          | Fields                                                                                                 | Meaning                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `"unavailable"` | `reason: "measurements-required" \| "invalid-measurements"`                                            | No physical sizing is applied; no millimeter value or tier is fabricated.                                |
| `"available"`   | `source`, `faceWidthMm`, optional `eyeCenterDistanceMm`, `tier`, `lensWidthRange`, `idealFrameWidthMm` | Validly formatted host inputs are available for heuristic ranking. This does not establish physical fit. |

The existing rule tiers are small below 130 mm, medium from 130 through 145 mm, and large above 145 mm. Their lens-width ranges are 38–46, 46–52 and 52–58 mm respectively. These are inspectable rules, not a validated fitting model. `idealFrameWidthMm` is the supplied face width used as a scoring target; its name does not imply a verified ideal fit. An explicitly supplied eye-center distance can add a non-scored caution and is not presented as a prescription or inferred pupillary distance.

## Scoring behavior

| Component          | Maximum raw score | Behavior                                                                                                                                      |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape              | 40                | Usable face/frame lookup: 40 for a match, 0 otherwise; unavailable analysis: 20. An explicit preferred shape adds 20 within the 40-point cap. |
| Size               | 30                | Without valid physical input: 15 for every item. With valid input: frame-width rules (15) plus lens-width rules (15).                         |
| Brand              | 10                | Case-insensitive preferred-brand match.                                                                                                       |
| Material and color | 10                | Up to 5 for each preference match.                                                                                                            |
| Price              | 10                | Known prices surviving the budget filter receive 10; missing prices receive 5.                                                                |

For supplied physical measurements, frame-width differences up to 10 mm receive 15 points, up to 20 mm receive 8, and larger differences receive 0. Lens widths inside the tier range receive 15, within 3 mm outside it receive 8, and farther away receive 0. Each missing or invalid catalog dimension contributes a neutral 7.5 points, so two unavailable dimensions contribute 15.

Scores are divided by 100, rounded to four decimals and sorted descending. Ties preserve inventory order. A high score reflects these rules and preferences, not a probability of purchase, attractiveness or successful physical fit. `UserPreferences.style` is reserved and currently not scored.

## API and migration

- `Recommender.recommend(input: RecommendationInput): RecommendedGlasses[]` returns `item`, `score`, `faceShapeApplied`, `size`, `reasons` and optional `cautions`.
- `faceShape` is optional. Its validity contract controls shape scoring.
- `measurements?: PhysicalFaceMeasurements` is the only physical-size input.
- `faceMetrics` remains accepted for source migration but is deprecated and ignored. An image-metric override cannot override physical measurements.
- `recommendSize` now accepts `PhysicalFaceMeasurements`, not `FaceMetrics`, and callers must narrow `status` before accessing physical fields.
- `estimateFaceWidthMm` and `estimateEyeCenterDistanceMm` are deprecated and always return `undefined`. Their previous numeric return contract is intentionally removed.
- `AVERAGE_FACE_WIDTH_MM`, `AVERAGE_FACE_WIDTH_NORM`, `AVERAGE_EYE_CENTER_DISTANCE_MM` and `MM_PER_NORM` are no longer exported. There is no average-person fallback.
- `SizeRecommendation`, `PhysicalFaceMeasurements`, match tables, score weights and size-tier thresholds remain available for inspection and integration.

These changes alter both TypeScript contracts and ranking behavior. Migrate callers instead of restoring the old fixed image-to-millimeter conversion.

## Full documentation

- [Architecture and shared-core ownership](../../docs/architecture.md)
- [Face-shape algorithm and compatibility limits](../../docs/face-shape-algorithm.md)
- [API reference](../../docs/api-reference.md)
