# Face Shape Analysis Algorithm

This document describes the VisuTry face shape analysis algorithm in detail. The algorithm classifies a face into one of 6 shapes (or `unknown`) using geometric metrics derived from semantic landmarks, independent membership functions, softmax normalization, and a confidence model based on score margin and measurement quality.

---

## Table of Contents

- [Overview](#overview)
- [The 6 Face Shapes](#the-6-face-shapes)
- [MediaPipe Semantic Index Mapping](#mediapipe-semantic-index-mapping)
- [Face Metrics](#face-metrics)
  - [Width Metrics](#width-metrics)
  - [Height Metrics](#height-metrics)
  - [Ratios](#ratios)
  - [Chin Type Classification](#chin-type-classification)
  - [Measurement Quality](#measurement-quality)
- [Membership Functions](#membership-functions)
- [Per-Shape Scoring](#per-shape-scoring)
- [Softmax Normalization](#softmax-normalization)
- [Confidence Calculation](#confidence-calculation)
- [Multi-Frame Aggregation](#multi-frame-aggregation)
- [Quality Requirements](#quality-requirements)
- [Result Structure](#result-structure)
- [Versioning](#versioning)
- [Using the Scorer Directly](#using-the-scorer-directly)

---

## Overview

The face shape scorer is designed around three principles:

1. **No hard if/else verdicts.** Every shape receives an independent score from its own membership function. The highest score becomes `primary` only when the confidence margin is sufficient.
2. **Tolerant of missing data.** Missing semantic points degrade measurement quality rather than causing failures. The calculator never throws on missing data.
3. **Multi-frame robustness.** Real-time single-frame results are noisy. The scorer aggregates metrics across multiple frames using median (distances) and trimmed mean (ratios) before scoring.

The pipeline:

```
Raw landmarks (478 points)
       │
       ▼
FaceSemanticMapper ──► FaceSemanticPoints (14 key points)
       │
       ▼
FaceMetricsCalculator ──► FaceMetrics (widths, heights, ratios, chinType, quality)
       │
       ▼
FaceShapeScorer ──► 6 independent membership scores
       │
       ▼
softmax(scores, temperature=0.6) ──► normalized probabilities
       │
       ▼
ranked candidates + confidence (margin + measurementQuality)
```

---

## The 6 Face Shapes

| Shape | Description | Geometric Signature |
|---|---|---|
| **oval** | Face length slightly > width, jaw slightly < cheek, rounded chin | width/height ~0.80, jaw/cheek ~0.80, rounded chin |
| **round** | Width approximately equals height, broad jaw, rounded chin | width/height ~0.96, jaw/cheek ~0.91, rounded chin |
| **square** | Jaw approximately equals cheek, square chin, medium proportions | jaw/cheek 0.86-1.0, width/height ~0.85, square chin |
| **heart** | Upper face wider, jaw narrows, pointed chin | jaw/eyeOuter ~0.58, jaw/cheek ~0.58, pointed chin |
| **diamond** | Cheekbone widest, forehead & jaw narrower, pointed chin | eyeOuter/cheek ~0.70, jaw/cheek ~0.64, pointed chin |
| **oblong** | Height much greater than width, similar widths, low width/height ratio | width/height ~0.66, jaw/cheek ~0.82 |

A seventh result, **`unknown`**, is returned when confidence falls below 0.45.

---

## MediaPipe Semantic Index Mapping

The `FaceSemanticMapper` translates raw landmark indices into stable semantic points using `MEDIAPIPE_SEMANTIC_INDEX_MAP`. This default map targets the MediaPipe Face Landmarker 468/478-point topology:

| Semantic Point | MediaPipe Index | Description |
|---|---|---|
| `leftEyeOuter` | 33 | Left eye outer corner |
| `leftEyeInner` | 133 | Left eye inner corner |
| `rightEyeInner` | 362 | Right eye inner corner |
| `rightEyeOuter` | 263 | Right eye outer corner |
| `noseBridge` | 168 | Nose bridge (between eyes) |
| `noseTip` | 1 | Nose tip |
| `leftBrowCenter` | 105 | Left eyebrow centre |
| `rightBrowCenter` | 334 | Right eyebrow centre |
| `foreheadCenter` | 10 | Forehead centre (top of face) |
| `chin` | 152 | Chin (bottom of face) |
| `leftCheek` | 123 | Left cheekbone |
| `rightCheek` | 352 | Right cheekbone |
| `leftJaw` | 172 | Left jaw |
| `rightJaw` | 397 | Right jaw |

Three derived points are computed from the eye corners when `deriveCenters` is enabled (default):

| Derived Point | Computation |
|---|---|
| `leftEyeCenter` | midpoint(leftEyeOuter, leftEyeInner) |
| `rightEyeCenter` | midpoint(rightEyeInner, rightEyeOuter) |
| `eyesCenter` | midpoint(leftEyeCenter, rightEyeCenter) |

These derived points are the backbone of the glasses pose solver and face metrics.

---

## Face Metrics

The `FaceMetricsCalculator` computes geometric metrics from `FaceSemanticPoints`. All distances use normalized coordinates (0..1). Every result carries a `measurementQuality` in [0, 1].

### Width Metrics

| Metric | Computation | Fallback |
|---|---|---|
| `cheekboneWidth` | distance(leftCheek, rightCheek) | — |
| `jawWidth` | distance(leftJaw, rightJaw) | — |
| `eyeOuterDistance` | distance(leftEyeOuter, rightEyeOuter) | — |
| `eyeInnerDistance` | distance(leftEyeInner, rightEyeInner) | — |
| `eyeCenterDistance` | distance(leftEyeCenter, rightEyeCenter) | — |
| `faceWidth` | cheekboneWidth | eyeOuterDistance |

`faceWidth` prefers cheekbone width and falls back to eye outer distance so the metric remains usable when cheek points are missing.

### Height Metrics

| Metric | Computation | Fallback |
|---|---|---|
| `faceHeight` | distance(foreheadCenter, chin) | distance(eyesCenter, chin) / 0.55 |

The fallback uses a documented heuristic: eyes sit at roughly 55% of face height measured from the chin, so the eyes-to-chin span is scaled up by `1 / 0.55`.

| Metric | Computation |
|---|---|
| `noseBridgeToEyeLine` | abs(noseBridge.y - eyesCenter.y) |

### Ratios

| Metric | Formula | Interpretation |
|---|---|---|
| `widthHeightRatio` | faceWidth / faceHeight | ~0.80 = oval, ~0.96 = round, ~0.66 = oblong |
| `jawCheekRatio` | jawWidth / cheekboneWidth | ~0.80 = tapered, ~0.91 = broad, 0.86-1.0 = square |

The scorer also computes two derived ratios for internal use:

| Derived Ratio | Formula | Interpretation |
|---|---|---|
| `jawToEyeOuter` | jawWidth / eyeOuterDistance | Low => upper face wider (heart) |
| `eyeOuterToCheek` | eyeOuterDistance / cheekboneWidth | <1 => cheekbone wider than eye span (diamond) |

### Chin Type Classification

Chin type is classified geometrically from `jawCheekRatio`, `widthHeightRatio`, and the jaw/chin landmarks:

| Condition | Chin Type |
|---|---|
| `jawCheekRatio < 0.72` | `pointed` (jaw much narrower than cheekbone) |
| `jawCheekRatio >= 0.86` and `widthHeightRatio >= 0.9` | `rounded` (broad jaw, nearly square proportions) |
| `jawCheekRatio >= 0.86` and `widthHeightRatio < 0.9` | `square` (broad jaw, medium proportions) |
| Otherwise (0.72 <= ratio < 0.86) | `rounded` (intermediate taper) |
| Missing jaw/chin data | `unknown` |

### Measurement Quality

`measurementQuality` blends two factors:

| Factor | Weight | Computation |
|---|---|---|
| Coverage (17 key points) | 35% | presentCount / 17 |
| Critical points (9 essential) | 65% | criticalPresent / 9 |

The 9 critical points are: `leftEyeCenter`, `rightEyeCenter`, `eyesCenter`, `noseBridge`, `chin`, `leftCheek`, `rightCheek`, `leftJaw`, `rightJaw`. Critical points matter more than peripheral coverage.

```ts
measurementQuality = clamp01(coverage * 0.35 + criticalRatio * 0.65)
```

---

## Membership Functions

Each shape uses independent membership functions — Gaussian (bell) or trapezoidal (trap) — applied to the relevant metrics. The functions are intentionally independent: a face can score high on multiple shapes simultaneously.

### Gaussian (bell) membership

```
bell(value, center, sigma) = exp(-0.5 * ((value - center) / sigma)^2)
```

Returns 1.0 at `center`, falling off symmetrically with `sigma` controlling the width.

### Trapezoidal membership

```
trap(value, lo, hi, ramp) =
  0                     if value < lo - ramp or value > hi + ramp
  1                     if lo <= value <= hi
  (value - (lo - ramp)) / ramp   if lo - ramp <= value < lo
  (hi + ramp - value) / ramp     if hi < value <= hi + ramp
```

Full membership inside `[lo, hi]`, with linear ramps of width `ramp` at the edges.

### Chin bonus

A `chinBonus` function adds a categorical contribution based on chin type match:

| Condition | Bonus |
|---|---|
| `chinType === "unknown"` | 0.5 (neutral) |
| `chinType` in preferred list | 1.0 (full match) |
| `chinType` not in preferred list | 0.3 (mismatch) |

---

## Per-Shape Scoring

Each shape combines 2-3 membership scores with weighted sums. The raw scores are then normalized via softmax.

### Oval

```
whrScore  = bell(widthHeightRatio, center=0.80, sigma=0.08)
jcrScore  = bell(jawCheekRatio,    center=0.80, sigma=0.08)
chinScore = chinBonus(chinType, ["rounded"])
score     = whrScore * 0.40 + jcrScore * 0.35 + chinScore * 0.25
```

### Round

```
whrScore  = bell(widthHeightRatio, center=0.96, sigma=0.06)
jcrScore  = bell(jawCheekRatio,    center=0.91, sigma=0.07)
chinScore = chinBonus(chinType, ["rounded"])
score     = whrScore * 0.40 + jcrScore * 0.30 + chinScore * 0.30
```

### Square

```
jcrScore  = trap(jawCheekRatio, lo=0.86, hi=1.0, ramp=0.04)
whrScore  = bell(widthHeightRatio, center=0.85, sigma=0.07)
chinScore = chinBonus(chinType, ["square"])
score     = jcrScore * 0.45 + whrScore * 0.25 + chinScore * 0.30
```

### Heart

```
taperScore = bell(jawToEyeOuter, center=0.58, sigma=0.08)
jcrScore   = bell(jawCheekRatio, center=0.58, sigma=0.08)
chinScore  = chinBonus(chinType, ["pointed"])
score      = taperScore * 0.40 + jcrScore * 0.30 + chinScore * 0.30
```

### Diamond

```
cheekDominant = bell(eyeOuterToCheek, center=0.70, sigma=0.08)
jcrScore      = bell(jawCheekRatio,   center=0.64, sigma=0.08)
chinScore     = chinBonus(chinType, ["pointed"])
score         = cheekDominant * 0.40 + jcrScore * 0.30 + chinScore * 0.30
```

### Oblong

```
whrScore      = bell(widthHeightRatio, center=0.66, sigma=0.05)
uniformScore  = bell(jawCheekRatio,    center=0.82, sigma=0.08)
score         = whrScore * 0.60 + uniformScore * 0.40
```

Note: oblong does not use a chin bonus — it relies purely on proportional ratios.

---

## Softmax Normalization

The 6 raw shape scores are normalized to probabilities using softmax with temperature 0.6:

```ts
const probs = softmax(raw.map(s => s.score), temperature=0.6);
```

Softmax formula (numerically stable):

```
exp_i = exp((score_i - maxScore) / temperature)
prob_i = exp_i / sum(exp_j)
```

Temperature 0.6 (< 1) **sharpens** the distribution, making the top candidate more decisive. The probabilities sum to 1.0.

The candidates are then sorted by score (descending):

```ts
const ranked = raw
  .map((s, i) => ({ ...s, score: probs[i] }))
  .sort((a, b) => b.score - a.score);
```

---

## Confidence Calculation

Confidence blends the **score margin** (gap between the top two candidates) with **measurement quality**:

```ts
const margin = primary.score - (second?.score ?? 0);
const confidence = clamp01(margin + metrics.measurementQuality * 0.25 - 0.05);
```

| Component | Effect |
|---|---|
| `margin` | Larger gap between top-2 => higher confidence |
| `measurementQuality * 0.25` | Better landmark coverage slightly boosts confidence |
| `- 0.05` | Small pessimism offset to avoid overconfidence on marginal cases |

### Unknown threshold

If `confidence < 0.45`, the primary shape is set to `"unknown"` and a `LOW_CONFIDENCE` warning is added:

```ts
if (confidence < 0.45) {
  primaryShape = "unknown";
  warnings.push("LOW_CONFIDENCE");
}
```

This prevents the scorer from issuing a confident verdict when the metrics are ambiguous or noisy.

---

## Multi-Frame Aggregation

Single-frame analysis is noisy. The `scoreFrames()` method aggregates metrics across multiple frames before scoring:

1. **Compute per-frame metrics** for each `NormalizedFaceResult`.
2. **Aggregate distances via median**: faceWidth, faceHeight, cheekboneWidth, jawWidth, eyeOuterDistance, eyeInnerDistance, eyeCenterDistance, noseBridgeToEyeLine.
3. **Recompute ratios from medians**: `widthHeightRatio = medianFaceWidth / medianFaceHeight`, `jawCheekRatio = medianJawWidth / medianCheekboneWidth`. This keeps ratios internally consistent with the aggregated distances.
4. **Aggregate quality via trimmed mean** (trim fraction 0.2): drops the top and bottom 20% of per-frame quality values, then averages.
5. **Stability bonus**: computed from the coefficient of variation (CV) of faceWidth across frames. Low CV (stable) => high stability; CV >= 0.15 => zero stability.
6. **Final quality blend**: `measurementQuality = avgQuality * 0.6 + stability * 0.4`.
7. **Chin type via majority vote** across frames.

### Stability factor

```ts
stabilityFactor(values) =
  if values.length < 2: 1
  else: clamp01(1 - coefficientOfVariation / 0.15)
```

Where `coefficientOfVariation = stddev / mean`. A CV near 0 (very stable measurements) yields a stability of 1.0; a CV >= 0.15 (unstable) yields 0.

### Default collection parameters

The web facade collects frames with these defaults:

| Parameter | Default | Description |
|---|---|---|
| `sampleFrames` | 8 | Number of quality-gated frames to collect |
| `sampleIntervalMs` | 120 | Minimum interval between collected samples |
| `requireFrontal` | true | Requires `frontalScore >= 0.75` |

Each frame must pass the `analysis` quality gate (the strictest mode). The maximum wait time is `max(sampleFrames * intervalMs + 2000, 5000)` ms.

---

## Quality Requirements

The `analysis` quality gate mode is the strictest of the three modes:

| Check | Threshold |
|---|---|
| `minConfidence` | 0.75 |
| `minFrontalScore` | 0.75 |
| `minStabilityScore` | 0.70 |
| `minBboxWidth` | 0.25 |
| `FACE_TOO_CLOSE` | bboxWidth > 0.70 |
| Required semantic points | leftEyeCenter, rightEyeCenter, noseBridge, chin, leftCheek, rightCheek, leftJaw, rightJaw |

If any check fails, the frame is rejected and not included in the aggregation. If no quality frames arrive within the timeout, `analyzeFaceShape()` rejects with an error.

---

## Result Structure

```ts
interface FaceShapeResult {
  primary: FaceShape;              // "oval" | "round" | "square" | "heart" | "diamond" | "oblong" | "unknown"
  candidates: FaceShapeCandidate[]; // ranked by score (descending)
  confidence: number;               // 0..1
  metrics: FaceMetrics;             // all computed metrics
  warnings: FaceQualityWarning[];   // e.g. ["LOW_CONFIDENCE"]
  version: string;                  // "1.0.0"
}

interface FaceShapeCandidate {
  shape: FaceShape;
  score: number;      // softmax probability, rounded to 3 decimals
  reasons: string[];  // human-readable explanation
}
```

### Example output

```json
{
  "primary": "oval",
  "candidates": [
    { "shape": "oval",    "score": 0.412, "reasons": ["width/height 0.81 (ideal ~0.80)", "jaw/cheek 0.79 (slightly tapered)", "chin rounded"] },
    { "shape": "round",   "score": 0.198, "reasons": ["width/height 0.81 (near 1.0)", "jaw/cheek 0.79 (broad)", "chin rounded"] },
    { "shape": "diamond", "score": 0.143, "reasons": ["eyeOuter/cheek 0.75 (cheekbone widest)", "jaw/cheek 0.79 (narrow)", "chin rounded"] },
    { "shape": "square",  "score": 0.097, "reasons": ["jaw/cheek 0.79 (strong jaw)", "width/height 0.81 (medium)", "chin rounded"] },
    { "shape": "heart",   "score": 0.083, "reasons": ["jaw/eyeOuter 0.82 (upper wider)", "jaw/cheek 0.79 (narrowing)", "chin rounded"] },
    { "shape": "oblong",  "score": 0.067, "reasons": ["width/height 0.81 (elongated)", "jaw/cheek 0.79 (uniform widths)"] }
  ],
  "confidence": 0.72,
  "metrics": {
    "faceWidth": 0.31,
    "faceHeight": 0.38,
    "cheekboneWidth": 0.31,
    "jawWidth": 0.245,
    "eyeOuterDistance": 0.27,
    "eyeInnerDistance": 0.12,
    "eyeCenterDistance": 0.195,
    "noseBridgeToEyeLine": 0.02,
    "widthHeightRatio": 0.816,
    "jawCheekRatio": 0.79,
    "chinType": "rounded",
    "measurementQuality": 0.88
  },
  "warnings": [],
  "version": "1.0.0"
}
```

---

## Versioning

The scorer carries a version string:

```ts
export const FACE_SHAPE_SCORER_VERSION = "1.0.0";
```

Every `FaceShapeResult` includes this version. When the scoring algorithm, membership functions, or confidence model change, the version is incremented. This lets callers:

- Cache results and invalidate on version change
- A/B test algorithm versions
- Track which algorithm produced a given result

---

## Using the Scorer Directly

The `FaceShapeScorer` is platform-agnostic and can be used without a camera — for example, to score pre-collected landmarks in a backend service.

### Single-frame scoring

```ts
import { FaceShapeScorer, FaceMetricsCalculator } from "@visutry/tryon-core";

const scorer = new FaceShapeScorer();
const result = scorer.score(faceResult); // NormalizedFaceResult
console.log(result.primary, result.confidence);
```

### Multi-frame scoring

```ts
const result = scorer.scoreFrames(frames); // NormalizedFaceResult[]
console.log(result.primary, result.confidence, result.candidates);
```

### Scoring from pre-aggregated metrics

```ts
const metricsCalculator = new FaceMetricsCalculator();
const metrics = metricsCalculator.aggregate(frames);
const result = scorer.scoreFromMetrics(metrics, warnings);
```

### Using with the recommender

The `FaceShapeResult` feeds directly into the `@visutry/recommender` engine:

```ts
import { Recommender } from "@visutry/recommender";

const recommender = new Recommender();
const recommendations = recommender.recommend({
  faceShape: result,        // FaceShapeResult
  faceMetrics: result.metrics,
  preferences: { brands: ["Ray-Ban"], maxPrice: 500 },
  inventory: glassesItems,  // GlassesItem[]
});
```

See the [Glasses Asset Standard](./glasses-asset-standard.md) for the face-shape-to-frame-shape recommendation table.
