# Migrating to 0.3.0

This pre-1.0 minor release deliberately changes geometry and sizing behavior.
Pin all selected `@visutry/*` packages to `0.3.0` and review stored results before
mixing them with results from older algorithms. The scorer reports
`FACE_SHAPE_SCORER_VERSION = "0.3.0"` independently of the package version.

## Supply the source image dimensions

Normalized x and y coordinates use different denominators on a non-square
image. The calculator now uses a common two-dimensional scale:
`(x, y * imageHeight / imageWidth)`. It does not use landmark depth to estimate
photo proportions or assume that missing dimensions mean a square image.

For a tracker result, set `face.imageSize = { width, height }`. These must be
the dimensions of the image on which the landmarks were detected, after the
host's orientation/cropping step. Browser adapters supply intrinsic dimensions;
CSS display width and height are not analysis inputs.

An existing detector can use the landmark-only entry point:

```ts
import {
  FaceMetricsCalculator,
  FaceShapeScorer,
  type FaceSemanticPoints,
  type ImageSize,
} from "@visutry/tryon-core";

export function analyzeGeometry(points: FaceSemanticPoints, imageSize: ImageSize) {
  const metrics = new FaceMetricsCalculator().computeFromSemantic(points, imageSize);
  return new FaceShapeScorer().scoreFromMetrics(metrics);
}
```

Keep adapters responsible for detector semantics and preprocessing. Do not
copy the classifier or manufacture tracker confidence to use the full result
entry point. `scoreFromMetrics` validates geometry; `score` and `scoreFrames`
also enforce detector quality.

## Handle rejected observations

| Change | Required host handling |
| --- | --- |
| Missing/invalid dimensions | Expect `INVALID_IMAGE_SIZE` and an unknown classification. |
| Non-finite or degenerate required landmarks | Expect `INVALID_LANDMARKS` or `MISSING_KEY_POINTS`. |
| Face occupies less than 0.16 of either image axis | Ask for a better-framed photo; max-axis span is no longer sufficient. |
| Failed full quality gate or any caller-supplied blocking warning | Expect `primary: "unknown"`, confidence `0`, and `candidates: []`. |
| Invalid sample in `scoreFrames` | The batch is rejected; medians cannot hide a failed observation. |
| Soft tilt/off-center advice | Read `getFaceGeometryAdvisories`; rejection warning codes no longer double as soft advice. |

`geometryValid` and `geometryWarnings` describe geometry only. They do not imply
that the full tracker-quality gate passed. Use the returned classification and
warnings rather than checking just one metric flag. Manually assembled legacy
metrics without explicit validity are rejected; recalculate them from source
landmarks and dimensions.

The classifier rounds ratios to three decimals and tilt to one decimal before
applying canonical rules. Ties use `round, square, oval, heart, diamond, oblong,
triangle`. These are intentional compatibility choices aligned with the
inspected main-site classifier, not evidence of model accuracy. See the
[algorithm reference](face-shape-algorithm.md).

## Update photo analysis lifecycle handling

`analyzeImage` returns `{ status, result, face }`, with status `accepted` or
`rejected`. Detected but rejected faces retain their landmarks for a retake UI.
The simpler `analyzeFaceShapeFromImage` still returns only the shape result.

- No detected face rejects with recoverable error `FACE_NOT_DETECTED`.
- An overlapping request on the same analyzer rejects with `ANALYSIS_IN_PROGRESS`.
- Failed attempts clear the previous face result. Destroyed instances cannot
  return a pending result; create a new instance to analyze again.
- IMAGE mode requests at least two detections so group photos can be rejected.
  This remains limited by the detector's ability to find the faces in the image.
- Still-image analysis does not borrow temporal-stability history from an
  unrelated previous photograph.

## Stop deriving millimeters from image coordinates

Normalized face width cannot establish physical scale. The recommender removes
the fixed conversion and average-person fallbacks. `estimateFaceWidthMm` and
`estimateEyeCenterDistanceMm` remain deprecated exports that return `undefined`.
The deprecated `RecommendationInput.faceMetrics` is ignored for physical sizing.

Supply physical measurements only when the host actually has them:

```ts
import { Recommender } from "@visutry/recommender";
import type { GlassesItem, PhysicalFaceMeasurements } from "@visutry/tryon-core";

export function rankInventory(
  inventory: GlassesItem[],
  measurements?: PhysicalFaceMeasurements,
) {
  return new Recommender().recommend({ inventory, measurements });
}
```

`PhysicalFaceMeasurements` requires a positive, finite `faceWidthMm` and a
`source` of `measured` or `calibrated`. Optional `eyeCenterDistanceMm` must also
be positive and finite when provided. The SDK records the host's assertion;
it does not verify measurement provenance.

Read the new `RecommendedGlasses.size.status` discriminant:

- `available`: supplied measurements can participate in heuristic sizing rules.
- `unavailable`: `measurements-required` or `invalid-measurements`; no size tier
  or millimeter estimate is emitted, and sizing contributes a neutral score.

`faceShape` is optional. `faceShapeApplied` tells the host whether valid shape
rules participated; missing, unknown or rejected analysis falls back to general
preference ranking. Neither confidence nor a recommendation score is a
calibrated probability or a guarantee of physical fit.

## Platform and package boundaries

Core declarations no longer require DOM library types. `RenderTarget` uses a
structural `CanvasRenderTarget`; `SnapshotResult<TBlob>`, `IRenderer<TBlob>` and
`VisuTrySDK<TBlob>` default their platform-specific payload to `unknown`.
The Web factory returns `VisuTrySDK<Blob>`. Code that explicitly annotates a
browser snapshot interface can add the `<Blob>` parameter.

The [shared-core example](../examples/shared-core/README.md) runs from packed
packages in a separate Node project and compiles with ES2020 libraries only.
This proves reusable package contracts, not a native App or WeChat camera/UI
implementation. WeChat remains experimental; this release only carries its
observed frame dimensions/count into the shared contract.

Release automation now publishes `pnpm pack` archives, replacing internal
`workspace:*` dependencies with pinned registry versions. The archive check and
external-consumer check run in CI. See [integration status](integration-status.md)
for separate evidence of application adoption and deployment.
