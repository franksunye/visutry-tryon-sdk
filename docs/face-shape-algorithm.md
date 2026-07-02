# Face Shape Analysis Algorithm

This document describes the VisuTry face shape analysis algorithm (v0.2.0). The algorithm classifies a face into one of 7 shapes (or `unknown`) using 2D geometric ratios derived from semantic landmarks, integer threshold scoring, and a confidence model based on score margin.

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
- [Using the Scorer Directly](#using-the-scorer-directly)

---

## Overview

The algorithm operates in three stages:

1. **Landmark extraction** — MediaPipe FaceLandmarker produces 478 normalized points. The `FaceSemanticMapper` maps these to 23 semantic points (eyes, nose, cheeks, jaw, forehead, chin, face outline).
2. **Metric computation** — `FaceMetricsCalculator` computes 2D distances between semantic points and derives 7 geometric ratios. These ratios are stored under `FaceMetrics.visutry` for compatibility with the visutry main site algorithm.
3. **Classification** — `FaceShapeScorer` applies integer threshold scoring rules on three key ratios to determine the primary shape, confidence, and alternative candidates.

All distances are computed in 2D (x, y only — no z-component) to ensure numerical equivalence with visutry's production algorithm.

---

## The 7 Face Shapes

| Shape | Description |
|-------|-------------|
| `oval` | Face length > width, jaw slightly < cheek, rounded chin |
| `round` | Width ≈ height, broad jaw, rounded chin |
| `square` | Jaw ≈ cheek, square chin, medium proportions |
| `heart` | Narrow jaw, broad forehead, pointed chin |
| `diamond` | Narrow jaw + narrow forehead, cheek dominant |
| `oblong` | Height >> width, similar widths throughout |
| `triangle` | Wide jaw, narrow forehead |
| `unknown` | Quality gates failed or no face detected |

---

## MediaPipe Semantic Index Mapping

The SDK maps MediaPipe landmark indices to semantic points:

| Semantic Point | MediaPipe Index | Description |
|---------------|-----------------|-------------|
| `foreheadCenter` | 10 | Top of forehead |
| `chin` | 152 | Bottom of chin |
| `leftCheek` / `rightCheek` | 123 / 352 | Cheekbone outer edges |
| `leftJaw` / `rightJaw` | 172 / 397 | Jaw angle points |
| `leftEyeOuter` / `rightEyeOuter` | 33 / 263 | Outer eye corners |
| `leftEyeInner` / `rightEyeInner` | 133 / 362 | Inner eye corners |
| `noseBridge` | 168 | Nose bridge center |
| `noseTip` | 1 | Nose tip |
| `leftFace` / `rightFace` | 234 / 454 | Face outline widest points |
| `leftForehead` / `rightForehead` | 103 / 332 | Forehead width points |
| `noseLeft` / `noseRight` | 98 / 327 | Nose wing edges |

---

## Geometric Ratios (2D)

All ratios use 2D Euclidean distances (`Math.hypot(dx, dy)`) without the z-component:

| Ratio | Formula | Description |
|-------|---------|-------------|
| `faceAspectRatio` | `faceHeight / faceWidth` | Height-to-width ratio (H/W) |
| `cheekToFaceWidth` | `cheekWidth / faceWidth` | Cheekbone relative to face outline |
| `jawToCheekWidth` | `jawWidth / cheekWidth` | Jaw relative to cheekbone |
| `foreheadToCheekWidth` | `foreheadWidth / cheekWidth` | Forehead relative to cheekbone |
| `eyeLineTiltDeg` | `atan2(dy, dx) * 180/π` | Eye line tilt in degrees |
| `symmetryOffset` | `\|noseBridge.x - faceCenter.x\| / faceWidth` | Facial asymmetry |
| `noseBridgeToFaceWidth` | `noseBridgeWidth / faceWidth` | Nose width relative to face |

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

| Condition | Shape | Points |
|-----------|-------|--------|
| `faceAspectRatio >= 1.42` | oblong | +4 |
| `1.27 <= faceAspectRatio < 1.42` | oval | +3 |
| `faceAspectRatio < 1.2` | round | +2 |
| `faceAspectRatio < 1.18 && jawToCheekWidth >= 0.86` | square | +3 |
| `jawToCheekWidth >= 0.92 && foreheadToCheekWidth >= 0.9` | square | +3 |
| `jawToCheekWidth < 0.76 && foreheadToCheekWidth >= 0.84` | heart | +4 |
| `jawToCheekWidth < 0.78 && foreheadToCheekWidth < 0.84` | diamond | +4 |
| `jawToCheekWidth > 0.98 && foreheadToCheekWidth < 0.88` | triangle | +4 |
| `0.78 <= jawToCheekWidth <= 0.9 && faceAspectRatio >= 1.2` | oval | +2 |
| `0.82 <= jawToCheekWidth <= 0.94 && faceAspectRatio < 1.22` | round | +2 |

### Ranking

All 7 shapes are ranked by their total integer score. The highest-scoring shape becomes the `primary`. Shapes with the next two highest non-zero scores become `alternatives`.

---

## Confidence Calculation

Confidence is computed from the best score and the margin between the top two candidates:

```
confidence = clamp(0.56 + bestScore * 0.065 + (bestScore - secondScore) * 0.035, 0.58, 0.93)
```

This formula ensures:
- Minimum confidence of 0.58 (shapes are never reported with very low confidence if quality gates pass)
- Maximum confidence of 0.93 (geometric analysis alone cannot achieve 100% certainty)
- Larger score margins produce higher confidence

---

## Quality Gates

Before classification, the algorithm checks three quality conditions. If any fails, the result is `unknown`:

| Check | Threshold | Warning |
|-------|-----------|---------|
| Face span | `max(faceWidth, faceHeight) < 0.16` (normalized) | `FACE_TOO_SMALL` |
| Eye line tilt | `abs(eyeLineTiltDeg) > 15°` | `EXCESSIVE_TILT` |
| Symmetry | `symmetryOffset > 0.14` | `ASYMMETRIC_FACE` |

Soft warnings are also emitted for borderline quality (tilt > 8°, symmetry > 0.08).

---

## Multi-Frame Aggregation

For video/camera analysis, metrics from multiple frames are aggregated:

1. Compute per-frame metrics (including visutry ratios)
2. Take the **median** of each ratio across all frames
3. Run classification on the median ratios

This reduces noise from individual frames while preserving the algorithm's deterministic behavior.

---

## Result Structure

```typescript
interface FaceShapeResult {
  primary: FaceShape;           // e.g., "round"
  candidates: FaceShapeCandidate[];
  confidence: number;           // 0.58 - 0.93
  metrics: FaceMetrics;         // Full metrics including visutry ratios
  warnings: FaceQualityWarning[];
  version: string;              // "0.2.0"
}

interface FaceShapeCandidate {
  shape: FaceShape;
  score: number;                // Normalized 0-1 (relative to top candidate)
  reasons: string[];            // Human-readable signals
}
```

### Example Output

```json
{
  "primary": "round",
  "confidence": 0.82,
  "candidates": [
    { "shape": "round", "score": 1.0, "reasons": ["Round shape supported by measured proportions", "Compact face length relative to width", "Jawline has moderate taper", "Cheekbones read wider than the upper face"] },
    { "shape": "oval", "score": 0.5, "reasons": ["..."] },
    { "shape": "square", "score": 0.5, "reasons": ["..."] }
  ],
  "metrics": {
    "visutry": {
      "faceAspectRatio": 0.97,
      "jawToCheekWidth": 0.91,
      "foreheadToCheekWidth": 0.92
    }
  },
  "warnings": [],
  "version": "0.2.0"
}
```

---

## Versioning

The `FACE_SHAPE_SCORER_VERSION` constant tracks algorithm changes:

- **v0.2.0** — Exact port of visutry's `classifyFaceGeometry`. Integer threshold scoring on 2D ratios. Numerical equivalence with visutry main site.
- **v1.0.0** — Bell function + softmax scoring on 3D ratios. Superseded.

---

## Using the Scorer Directly

```typescript
import { FaceShapeScorer } from "@visutry/tryon-core";

const scorer = new FaceShapeScorer();
const result = scorer.score(normalizedFaceResult);

console.log(result.primary);     // "round"
console.log(result.confidence);  // 0.82
console.log(result.version);     // "0.2.0"
```

For image-only analysis without a camera:

```typescript
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web";

const analyzer = createVisuTryImageAnalyzer();
const result = await analyzer.analyzeFaceShapeFromImage(imageElement);
```
