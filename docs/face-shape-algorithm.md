# Face Shape Analysis Algorithm

This document describes `FaceShapeScorer` version `0.3.0` in this SDK. It is a
deterministic geometry heuristic that classifies a face into seven shapes (or
`unknown`) using semantic landmarks, threshold scores and a score-margin
confidence formula. The confidence value is not a calibrated probability.

The implementation lives in [FaceMetricsCalculator](../packages/core/src/face/FaceMetricsCalculator.ts)
and [FaceShapeScorer](../packages/core/src/face/FaceShapeScorer.ts), with shared
acceptance rules in [geometryQuality](../packages/core/src/face/geometryQuality.ts)
and detector-level checks in [QualityGate](../packages/core/src/quality/QualityGate.ts).
Algorithm versioning is separate from npm package versions. Version 0.3.0 adopts
the main site's coordinate scaling, rounding and deterministic tie order;
cross-product acceptance still requires the evidence described under
[compatibility and integration](#compatibility-and-integration).

---

## Table of Contents

- [Overview](#overview)
- [Image and Coordinate Contract](#image-and-coordinate-contract)
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

All photo measurements now use 2D geometry. Detector-specific z values are
ignored. The general length fields and classifier ratios share the same
aspect-aware geometry; the classifier consumes the canonically rounded
`visutry` fields. `chinType` remains an auxiliary heuristic and is not an input
to the three-ratio shape classifier.

## Image and Coordinate Contract

`NormalizedFaceResult.imageSize` supplies the source image's pixel dimensions:

```typescript
imageSize: { width: 1200, height: 1600 }
```

Landmarks must describe that same image after the adapter's orientation and
mirroring transforms: x is divided by image width, y by image height, and the
origin is the top-left corner with y increasing downward. Browser adapters use
decoded intrinsic dimensions (`naturalWidth`/`naturalHeight`,
`videoWidth`/`videoHeight`, or canvas/bitmap dimensions), not CSS display size.
Core does not infer missing dimensions from a face bounding box.

`imageSize` is optional in the TypeScript interface for existing tracking-only
adapters, but mandatory for analysis. Missing, non-positive or non-finite
dimensions produce `geometryValid: false` and `INVALID_IMAGE_SIZE`. No square
image fallback is applied. `computeFromSemantic(points, imageSize)` has the
same requirement.

Before measuring, the calculator converts both axes to source-image-width
units: `x' = x` and `y' = y * imageHeight / imageWidth`. A length of `0.3`
therefore means 30% of source-image width in this common 2D coordinate system;
it is not a physical millimeter measurement. All supplied point x/y values must
be finite. Missing required points reject analysis with `MISSING_KEY_POINTS`;
non-finite coordinates or degenerate geometry use `INVALID_LANDMARKS`.

Two fields deliberately retain their original axis units:

- `faceSpanX = abs(rightFace.x - leftFace.x)`, as a fraction of image width.
- `faceSpanY = abs(chin.y - foreheadCenter.y)`, as a fraction of image height.

The legacy `faceSpan` is their maximum for display compatibility. Acceptance
checks each axis independently. Uniform resizing preserves geometry. Adding
padding preserves ratios for the same physical pixel geometry but reduces
image-space spans; enough padding can correctly trigger `FACE_TOO_SMALL`.

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

All classifier ratios use Euclidean distances in the common 2D scale above,
equivalent to pixel-space `hypot(dx * imageWidth, dy * imageHeight)` ratios.
Depth is excluded:

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

The required set contains 15 points: forehead center, chin, both face-outline
points, cheeks, jaw points, forehead-width points, eye outer corners, nose
wings, and nose bridge. Other semantic points contribute optional measurements
and coverage quality. Face height, face width, cheek width, and outer-eye
distance must be positive.

The seven values in `metrics.visutry` are rounded before quality acceptance and
classification: ratios and symmetry to three decimals, eye-line tilt to one
decimal. General length fields and top-level tilt/symmetry retain full numeric
precision. Positive tilt means the right eye corner is lower in image space.
For example, a measured tilt of 15.04 degrees becomes 15.0 and passes the
15-degree geometry limit; 15.06 becomes 15.1 and fails.

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
order: `round`, `square`, `oval`, `heart`, `diamond`, `oblong`, `triangle`.
The highest-scoring shape becomes `primary`. The public `candidates` array
contains all seven shapes, including zero-score entries. Each candidate score
is its raw score divided by `max(highestRawScore, 1)`, rounded to three decimals.
Candidate scores are relative weights; they are not probabilities and do not
sum to one.

The exported low-level `classifyFaceGeometry(ratios)` function also returns up
to two non-zero alternatives. `FaceShapeResult` does not expose an
`alternatives` field. If every raw score is zero and no quality check rejects
the input, the tie order selects `round` with confidence `0.58`; there is no
separate zero-score rejection.

### Shared explanations and profiles

`buildGeometrySignals(shape, ratios)` returns the same four explanation strings
used for each candidate and the primary result's `signals`. Profile helpers
avoid duplicating display thresholds in application adapters:

- `classifyJawProfile`: `<= 0.78` is tapered, `>= 0.94` is strong, otherwise balanced.
- `classifyUpperFaceProfile`: `< 0.84` is narrower, `> 0.92` is broad, otherwise balanced.

Both helpers return `null` for non-number or non-finite input. The upper-face
explanation uses the strict `> 0.92` broad threshold. This does not change the
separate square-scoring rule's `foreheadToCheekWidth >= 0.9` condition.

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

### Geometry acceptance

`FaceMetricsCalculator` writes `geometryValid` and `geometryWarnings` on every
computed result. `getFaceGeometryWarnings(metrics)` supplies the same rules to
the scorer; `QualityGate` uses the calculator instead of recomputing geometry.

| Check             | Rejection condition                                         | Warning              |
| ----------------- | ----------------------------------------------------------- | -------------------- |
| Image dimensions  | Missing, non-finite or non-positive dimensions              | `INVALID_IMAGE_SIZE` |
| Semantic coverage | A required point or required ratio/span is absent           | `MISSING_KEY_POINTS` |
| Numeric geometry  | Non-finite x/y or metrics, or degenerate required distances | `INVALID_LANDMARKS`  |
| Face spans        | `faceSpanX < 0.16` **or** `faceSpanY < 0.16`                | `FACE_TOO_SMALL`     |
| Eye line tilt     | `abs(visutry.eyeLineTiltDeg) > 15`                          | `EXCESSIVE_TILT`     |
| Symmetry          | `visutry.symmetryOffset > 0.14`                             | `ASYMMETRIC_FACE`    |

Span checks use unrounded source-image fractions. Tilt and symmetry checks use
the rounded canonical values. A rejected observation may retain usable partial
metrics for diagnostics; `geometryValid` must be checked before using those
metrics as an accepted geometric measurement. `measurementQuality` reflects
point coverage and, for batches, stability; it is not a substitute for validity.

### Full detector gate versus metrics-only scoring

The entry points deliberately have different available evidence:

| Entry point                           | Acceptance behavior                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scoreFromMetrics(metrics, warnings)` | Requires `geometryValid === true`, finite complete ratios and both spans, and no blocking geometry or caller-supplied warnings. It does not invent detector confidence or video stability for a photo-only adapter.   |
| `score(face)`                         | Runs the full `QualityGate` in analysis mode, then scores geometry.                                                                                                                                                   |
| `scoreFrames(frames)`                 | Runs the full analysis gate on **every** supplied frame and unions their warnings, then scores the aggregate.                                                                                                         |
| `classifyFaceGeometry(ratios)`        | Low-level threshold calculation only. Does not check dimensions, spans, face count or detector quality. Throws `RangeError` for invalid numeric ratios; adapters should validate through the calculator/scorer first. |

The full analysis gate also requires a visible face, confidence `>= 0.75`,
frontal score `>= 0.75`, and stability score `>= 0.7`. Present lighting and
occlusion scores must be `>= 0.4`; all supplied scores must be finite and within
their valid ranges. Adapter warnings are blocking. A supplied `faceCount > 1`
adds `MULTIPLE_FACES`; an invalid supplied count also rejects the observation.
Absent `faceCount` does not establish that the detector checked for multiple
people.

Analysis uses the semantic span rules above, not the old 0.25 bounding-box-width
threshold. Try-on and snapshot retain their separate tracker bounding-box
rules. A detector may still supply a blocking size or pose warning of its own;
the full scorer preserves that extra evidence. Thus `geometryValid: true`
does not guarantee full detector acceptance.

Every rejected classification has `primary: "unknown"`, `confidence: 0`, empty
`candidates` and empty `signals`. Missing validity markers on legacy hand-built
metrics are rejected; recalculate them with the actual source dimensions.
In particular, a low-confidence face cannot retain a valid shape merely
because its landmarks look geometrically complete.

### Non-blocking photo advice

Soft advice is separate from rejection warnings in 0.3.0:

- `getFaceGeometryAdvisories(ratios)` returns `TILTED_FACE` above 8 degrees and
  `OFF_CENTER_FACE` above a symmetry offset of 0.08.
- These codes are not appended to the classification's blocking `warnings`.
  Applications may map them to retake guidance without invalidating an
  otherwise accepted result.
- `computeGeometryQualityScore(ratios)` supplies the main site's heuristic
  display score: `round(clamp(96 - abs(tilt) * 2.2 - symmetry * 180, 45, 96))`.
  It returns zero for non-finite inputs. This display score is not measured
  accuracy and does not replace geometry acceptance.

---

## Multi-Frame Aggregation

For video/camera analysis, metrics from multiple frames are aggregated:

1. Compute each frame's metrics. An invalid geometric sample invalidates the
   batch; it is not silently removed before aggregation.
2. Take medians of distances, tilt, symmetry and axis spans. Recompute ratios
   from aggregate distances and apply the canonical rounding. The aggregate is
   checked again against the shared geometry rules.
3. Combine per-frame coverage quality with relative face-width stability for
   `measurementQuality`, and use a majority vote for the auxiliary `chinType`.
4. `scoreFrames` unions the full gate warnings from every frame. A later
   low-confidence, invisible or otherwise rejected sample cannot be hidden by
   the first frame's good quality or by median aggregation.

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
  signals?: string[]; // Primary-shape explanations; the scorer always writes this
  version: string; // "0.3.0"
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
The scorer always includes `signals`; the optional TypeScript field preserves
compatibility with externally constructed result objects.

The Web image analyzer's `analyzeImage()` returns
`{ status: "accepted" | "rejected", result, face }`. No-face input is a separate
recoverable `FACE_NOT_DETECTED` error. Concurrent use of the same analyzer
rejects with `ANALYSIS_IN_PROGRESS`; a later retry may reuse that analyzer.
Destroying it prevents pending detections from publishing a late result.

---

## Versioning

The `FACE_SHAPE_SCORER_VERSION` constant tracks algorithm changes:

- **v0.3.0** — Required source dimensions for analysis; common-scale 2D lengths;
  canonical three-decimal ratios and one-decimal tilt; main-compatible tie
  order and upper-face explanations; rejection on either small axis; explicit
  geometry validity; full-gate versus metrics-only entry points; all-frame
  warning propagation; separate soft advisories; primary result signals.
- **v0.2.0** — Earlier integer threshold scorer. Used uncorrected normalized
  x/y ratios, an oval-first tie order, max-axis size acceptance and incomplete
  quality rejection. Callers must account for these intentional behavior changes.
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
  // face.imageSize must describe the image used to normalize the landmarks.
  // This entry point also requires valid detector quality metadata.
  return scorer.score(face);
}
```

For an adapter that owns still-photo detection but has no video stability or
tracker confidence measurements, use the geometry entry point:

```typescript
import {
  FaceMetricsCalculator,
  FaceShapeScorer,
  getFaceGeometryAdvisories,
  type FaceSemanticPoints,
  type ImageSize,
} from "@visutry/tryon-core";

const calculator = new FaceMetricsCalculator();
const scorer = new FaceShapeScorer();

export function classifyPhotoGeometry(points: FaceSemanticPoints, imageSize: ImageSize) {
  const metrics = calculator.computeFromSemantic(points, imageSize);
  const result = scorer.scoreFromMetrics(metrics);
  const advisories =
    result.primary !== "unknown" && metrics.visutry
      ? getFaceGeometryAdvisories(metrics.visutry)
      : [];
  return { result, advisories };
}
```

The host must still handle no-face/multiple-face detection and other evidence
that is not represented in semantic points. Pass any blocking detector
warnings to `scoreFromMetrics`; do not fabricate confidence or stability values
to make a full detector gate pass.

For image-only analysis without a camera:

```typescript
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web/analyzer";

export async function classifyPhoto(image: HTMLImageElement) {
  await image.decode();
  const analyzer = createVisuTryImageAnalyzer();
  try {
    // Inspect status and result.warnings to offer a retake for rejected input.
    return await analyzer.analyzeImage(image);
  } finally {
    analyzer.destroy();
  }
}
```
