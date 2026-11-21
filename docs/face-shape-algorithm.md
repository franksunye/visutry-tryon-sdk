# Face Shape Analysis Algorithm

This document describes `FaceShapeScorer` version `0.2.0` in this SDK. It is a
deterministic geometry heuristic that classifies a face into seven shapes (or
`unknown`) using semantic landmarks, threshold scores and a score-margin
confidence formula. The confidence value is not a calibrated probability.

The implementation lives in [FaceMetricsCalculator](../packages/core/src/face/FaceMetricsCalculator.ts)
and [FaceShapeScorer](../packages/core/src/face/FaceShapeScorer.ts). Algorithm
versioning is separate from npm package versions. Historical derivation from
the VisuTry main site does not establish parity with its current implementation;
see [compatibility and integration](#compatibility-and-integration).

---

## Table of Contents

- [Overview](#overview)
- [The 7 Face Shapes](#the-7-face-shapes)
- [MediaPipe Semantic Index Mapping](#mediapipe-semantic-index-mapping)
- [Geometric Ratios (2D)](#geometric-ratios-2d)
- [Classification Algorithm](#classification-algorithm)
- [Confidence Calculation](#confidence-calculation)
- [Quality Gates](#quality-gates)
- [Multi-Frame Aggregation](#multi-frame-aggregation)
- [Result Structure](#result-structure)
- [Versioning](#versioning)
- [Compatibility and Integration](#compatibility-and-integration)
- [Using the Scorer Directly](#using-the-scorer-directly)

---

## Overview

The algorithm operates in three stages:

1. **Landmark extraction** — MediaPipe FaceLandmarker produces 478 normalized points. The `FaceSemanticMapper` maps these to 23 semantic points (eyes, nose, cheeks, jaw, forehead, chin, face outline).
2. **Metric computation** — `FaceMetricsCalculator` computes general metrics and a separate set of seven 2D ratios under `FaceMetrics.visutry`. The field name records the historical integration lineage.
3. **Classification** — `FaceShapeScorer` applies integer threshold rules to three ratios and returns the primary shape, confidence and all seven ranked candidates.

The `visutry` ratios use normalized x/y coordinates without z. General metrics
such as `faceWidth` and `faceHeight` also use 3D distances; they must not be
substituted for the classifier's 2D ratios. Normalized coordinates do not
automatically preserve pixel-space ratios or tilt when image width and height
differ. A matching formula alone is not evidence of matching production output.

---

## The 7 Face Shapes

| Shape      | Description                                                                             |
| ---------- | --------------------------------------------------------------------------------------- |
| `oval`     | Face length > width, jaw slightly < cheek, rounded chin                                 |
| `round`    | Width ≈ height, broad jaw, rounded chin                                                 |
| `square`   | Jaw ≈ cheek, square chin, medium proportions                                            |
| `heart`    | Narrow jaw, broad forehead, pointed chin                                                |
| `diamond`  | Narrow jaw + narrow forehead, cheek dominant                                            |
| `oblong`   | Height >> width, similar widths throughout                                              |
| `triangle` | Wide jaw, narrow forehead                                                               |
| `unknown`  | Required ratios are missing, hard quality checks fail, or an empty frame list is scored |

These descriptions are summaries of the rule set, not independent tests of chin
shape or physical fit. A Web image analyzer throws when it detects no face;
that path does not return an `unknown` classification.

---

## MediaPipe Semantic Index Mapping

The SDK maps MediaPipe landmark indices to semantic points:

| Semantic Point                   | MediaPipe Index | Description                |
| -------------------------------- | --------------- | -------------------------- |
| `foreheadCenter`                 | 10              | Top of forehead            |
| `chin`                           | 152             | Bottom of chin             |
| `leftCheek` / `rightCheek`       | 123 / 352       | Cheekbone outer edges      |
| `leftJaw` / `rightJaw`           | 172 / 397       | Jaw angle points           |
| `leftEyeOuter` / `rightEyeOuter` | 33 / 263        | Outer eye corners          |
| `leftEyeInner` / `rightEyeInner` | 133 / 362       | Inner eye corners          |
| `noseBridge`                     | 168             | Nose bridge center         |
| `noseTip`                        | 1               | Nose tip                   |
| `leftFace` / `rightFace`         | 234 / 454       | Face outline widest points |
| `leftForehead` / `rightForehead` | 103 / 332       | Forehead width points      |
| `noseLeft` / `noseRight`         | 98 / 327        | Nose wing edges            |

---

## Geometric Ratios (2D)

All classifier ratios use normalized 2D Euclidean distances
(`Math.hypot(dx, dy)`) without the z-component:

| Ratio                   | Formula                                       | Description                        |
| ----------------------- | --------------------------------------------- | ---------------------------------- |
| `faceAspectRatio`       | `faceHeight / faceWidth`                      | Height-to-width ratio (H/W)        |
| `cheekToFaceWidth`      | `cheekWidth / faceWidth`                      | Cheekbone relative to face outline |
| `jawToCheekWidth`       | `jawWidth / cheekWidth`                       | Jaw relative to cheekbone          |
| `foreheadToCheekWidth`  | `foreheadWidth / cheekWidth`                  | Forehead relative to cheekbone     |
| `eyeLineTiltDeg`        | `atan2(dy, dx) * 180/π`                       | Eye line tilt in degrees           |
| `symmetryOffset`        | `\|noseBridge.x - faceCenter.x\| / faceWidth` | Facial asymmetry                   |
| `noseBridgeToFaceWidth` | `noseBridgeWidth / faceWidth`                 | Nose width relative to face        |

Where:

- `faceWidth` = distance(leftFace, rightFace)
- `faceHeight` = distance(foreheadCenter, chin)
- `cheekWidth` = distance(leftCheek, rightCheek)
- `jawWidth` = distance(leftJaw, rightJaw)
- `foreheadWidth` = distance(leftForehead, rightForehead)

---

## Classification Algorithm

The classifier uses integer scoring rules on three key ratios: `faceAspectRatio`, `jawToCheekWidth`, and `foreheadToCheekWidth`.

### Scoring Rules

| Condition                                                   | Shape    | Points |
| ----------------------------------------------------------- | -------- | ------ |
| `faceAspectRatio >= 1.42`                                   | oblong   | +4     |
| `1.27 <= faceAspectRatio < 1.42`                            | oval     | +3     |
| `faceAspectRatio < 1.2`                                     | round    | +2     |
| `faceAspectRatio < 1.18 && jawToCheekWidth >= 0.86`         | square   | +3     |
| `jawToCheekWidth >= 0.92 && foreheadToCheekWidth >= 0.9`    | square   | +3     |
| `jawToCheekWidth < 0.76 && foreheadToCheekWidth >= 0.84`    | heart    | +4     |
| `jawToCheekWidth < 0.78 && foreheadToCheekWidth < 0.84`     | diamond  | +4     |
| `jawToCheekWidth > 0.98 && foreheadToCheekWidth < 0.88`     | triangle | +4     |
| `0.78 <= jawToCheekWidth <= 0.9 && faceAspectRatio >= 1.2`  | oval     | +2     |
| `0.82 <= jawToCheekWidth <= 0.94 && faceAspectRatio < 1.22` | round    | +2     |

### Ranking

All seven shapes are ranked by their total integer score. Ties preserve this
order: `oval`, `round`, `square`, `heart`, `diamond`, `oblong`, `triangle`.
The highest-scoring shape becomes `primary`. The public `candidates` array
contains all seven shapes, including zero-score entries. Each candidate score
is its raw score divided by `max(highestRawScore, 1)`, rounded to three decimals.
Candidate scores are relative weights; they are not probabilities and do not
sum to one.

The internal classifier also computes up to two non-zero alternatives, but
`FaceShapeResult` does not expose an `alternatives` field. If every raw score is
zero and no quality check rejects the input, the current tie order selects
`oval` with confidence `0.58`; the algorithm has no separate zero-score rejection.

---

## Confidence Calculation

Confidence is computed from the best score and the margin between the top two candidates:

```
confidence = clamp(0.56 + bestScore * 0.065 + (bestScore - secondScore) * 0.035, 0.58, 0.93)
```

The result is rounded to two decimals. Accepted classifications are bounded to
`0.58` through `0.93` by design; these bounds are not measured accuracy claims.
Larger score margins increase the heuristic confidence. An `unknown` result has
confidence `0`.

---

## Quality Gates

Missing required semantic points or non-positive face/cheek dimensions prevent
the calculator from producing `metrics.visutry`; the scorer then returns
`unknown` with `MISSING_KEY_POINTS`. When ratios exist, it checks:

| Check                     | Threshold                                                                   | Warning           |
| ------------------------- | --------------------------------------------------------------------------- | ----------------- |
| Face span, when available | `max(abs(rightFace.x - leftFace.x), abs(chin.y - foreheadCenter.y)) < 0.16` | `FACE_TOO_SMALL`  |
| Eye line tilt             | `abs(eyeLineTiltDeg) > 15°`                                                 | `EXCESSIVE_TILT`  |
| Symmetry                  | `symmetryOffset > 0.14`                                                     | `ASYMMETRIC_FACE` |

These conditions return `unknown`. Pre-existing `FACE_TOO_SMALL`,
`EXCESSIVE_TILT` or `ASYMMETRIC_FACE` warnings supplied to the scorer also cause
rejection. Other incoming warnings are retained without automatic rejection.

After a classification passes, tilt above 8 degrees or symmetry offset above
`0.08` adds a soft warning using the same warning codes. A returned warning
therefore does not by itself mean the classification is `unknown`; inspect
`primary`, confidence and warnings together. Adapter-level quality checks may
add warnings or filter frames separately.

---

## Multi-Frame Aggregation

For video/camera analysis, metrics from multiple frames are aggregated:

1. Compute per-frame metrics, including the available `visutry` ratio sets.
2. Take the median of each classifier ratio across those sets. General distances also use medians; general width/height and jaw/cheek ratios are recomputed from their median distances.
3. Run classification on the aggregated metrics. `scoreFrames` currently carries incoming warnings from the first frame, not a union of every frame's warnings.

This can reduce per-frame variation; it is not an accuracy guarantee. An empty
frame array returns `unknown`, no candidates and confidence `0`. Web live
analysis collects quality-gated samples, while image analysis scores one frame.

---

## Result Structure

```typescript
import type { FaceMetrics, FaceQualityWarning, FaceShape } from "@visutry/tryon-core";

interface FaceShapeResult {
  primary: FaceShape; // e.g., "round"
  candidates: FaceShapeCandidate[];
  confidence: number; // 0 for unknown; otherwise 0.58 - 0.93
  metrics: FaceMetrics; // Full metrics including visutry ratios
  warnings: FaceQualityWarning[];
  version: string; // "0.2.0"
}

interface FaceShapeCandidate {
  shape: FaceShape;
  score: number; // Relative 0-1 weight; not a probability
  reasons: string[]; // Human-readable signals
}
```

For a rejected classification, `candidates` is empty and `confidence` is zero.
Accepted classifications include all seven candidates. `metrics` contains the
full `FaceMetrics` object, not just the three ratios used by the classifier.

---

## Versioning

The `FACE_SHAPE_SCORER_VERSION` constant tracks algorithm changes:

- **v0.2.0** — Current threshold scorer, historically ported from VisuTry's `classifyFaceGeometry`. Uses integer scores on 2D ratios. This provenance does not guarantee equivalence with later main-site revisions or differently normalized inputs.
- **v1.0.0** — Historical bell-function/softmax implementation on 3D ratios, superseded by the current baseline. These are algorithm identifiers, not the package release sequence.

## Compatibility and Integration

The shared-core objective is one maintained implementation of geometry and
classification, consumed through platform adapters. Adapters must agree on
landmark semantics, image orientation, mirroring and coordinate normalization.
Separate copies of threshold tables can drift even if they started from the
same source.

Before claiming parity with the main site or another adapter, record both exact
source revisions, detector/model versions, preprocessing and sampling settings.
Compare the same normalized fixtures and representative image inputs, including
non-square images, tilted faces and rejected-quality cases. Check metrics,
primary shape, candidate order, confidence and warnings. A successful unit-test
run in this repository or a reference-demo smoke test alone does not establish
cross-product parity.

See the [architecture and integration requirements](architecture.md) for shared
ownership and the main-site adoption boundary. This document describes current
SDK behavior; it does not declare the separate main-site integration complete.

---

## Using the Scorer Directly

```typescript
import { FaceShapeScorer, type NormalizedFaceResult } from "@visutry/tryon-core";

const scorer = new FaceShapeScorer();
export function classifyFace(face: NormalizedFaceResult) {
  return scorer.score(face);
}
```

For image-only analysis without a camera:

```typescript
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web/analyzer";

export async function classifyPhoto(image: HTMLImageElement) {
  await image.decode();
  const analyzer = createVisuTryImageAnalyzer();
  try {
    return await analyzer.analyzeFaceShapeFromImage(image);
  } finally {
    analyzer.destroy();
  }
}
```
