# Integration status

- **Inspected:** 2026-11-21
- **Method:** Source inspection at the revisions below, plus the separately recorded reference-demo
  release. This is not a new production smoke test or a measurement of user-facing error rates.

This document records adoption evidence. [Architecture](architecture.md) defines the target;
[the roadmap](roadmap.md) defines the work needed to reach it.

## Inspected revisions

| Repository               | Revision                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK                      | [`b8e3b1aee62bdca633f73929e5da5bfde8485099`](https://github.com/franksunye/visutry-tryon-sdk/commit/b8e3b1aee62bdca633f73929e5da5bfde8485099). |
| Main VisuTry application | [`66381dc7d7ccd053414a1c9069355c3ecef3e21c`](https://github.com/franksunye/VisuTry/commit/66381dc7d7ccd053414a1c9069355c3ecef3e21c).           |
| VisuTry Mobile           | [`b932c86e3c5a3ad0526c9e3d20a92e10911fe142`](https://github.com/franksunye/visutry-mobile/commit/b932c86e3c5a3ad0526c9e3d20a92e10911fe142).    |

## Adoption summary

| Consumer                            | Observed state                                                                                                                                 | Completion status                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SDK reference Web demo              | Uses the SDK tracker/renderer and original reference GLB. PR #4 records a deployed source revision and real-browser fixture checks.            | Reference release recorded; physical-device and retail-fit qualification remain open.                            |
| Main-site local face detector       | Maintains its own geometry/classifier implementation. The inspected root package manifest declares no `@visutry/*` dependency.                 | Shared-package migration is not complete.                                                                        |
| Mobile face-analysis adapter        | Declares SDK workspace dependencies and imports the Web facade, with execution behind an environment flag and incomplete input/result mapping. | Partial, gated source integration; a working deployed photo-analysis flow is not established by this inspection. |
| WeChat                              | Experimental SDK adapters exist, but the facade does not wire a full tracking/rendering loop and the renderer is a placeholder.                | Experimental; not accepted for production AR.                                                                    |
| Merchant/widget/native app surfaces | Intended consumers of applicable shared capabilities.                                                                                          | No completed integration is established by this audit.                                                           |

## Main-site evidence and parity gaps

The main application has its own
[`face-landmark-metrics.ts`](https://github.com/franksunye/VisuTry/blob/66381dc7d7ccd053414a1c9069355c3ecef3e21c/src/lib/face-landmark-metrics.ts)
and face-shape definitions in
[`face-analysis.ts`](https://github.com/franksunye/VisuTry/blob/66381dc7d7ccd053414a1c9069355c3ecef3e21c/src/config/face-analysis.ts).
Its [package manifest](https://github.com/franksunye/VisuTry/blob/66381dc7d7ccd053414a1c9069355c3ecef3e21c/package.json)
does not establish SDK consumption. The SDK independently owns
[`FaceMetricsCalculator`](https://github.com/franksunye/visutry-tryon-sdk/blob/b8e3b1aee62bdca633f73929e5da5bfde8485099/packages/core/src/face/FaceMetricsCalculator.ts)
and [`FaceShapeScorer`](https://github.com/franksunye/visutry-tryon-sdk/blob/b8e3b1aee62bdca633f73929e5da5bfde8485099/packages/core/src/face/FaceShapeScorer.ts).

The raw classifier scoring thresholds still match in the inspected implementations. That does not
make the complete pipelines equivalent:

| Area                 | Main application                                                      | SDK                                                                                    | Migration implication                                                     |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tie ordering         | Canonical order begins `round`, `square`, `oval`.                     | Canonical order begins `oval`, `round`, `square`.                                      | Equal raw scores can select different primary shapes.                     |
| Geometry and tilt    | Applies image width and height to landmark distances and tilt.        | Computes the comparable ratios from normalized x/y coordinates.                        | Non-square inputs require explicit coordinate/aspect-ratio parity checks. |
| Small-face rejection | Rejects when either horizontal or vertical face span is below `0.16`. | Scores using the maximum bounding-box span and rejects when that span is below `0.16`. | Quality acceptance is not the same rule; boundary fixtures are required.  |

A source-level check using `faceAspectRatio = 1.21`, `jawToCheekWidth = 0.85`, and
`foreheadToCheekWidth = 0.90` produces raw scores of `round: 2` and `oval: 2` in both classifiers.
Applying their actual tie orders selects `round` in the main application and `oval` in the SDK.
This check executes the extracted scoring rules; it is not an image, camera, or deployed-path test.

These code-level differences do not establish the frequency or severity of live user outcomes.
They justify removing the previous blanket claim of numerical equivalence and creating a deliberate
compatibility decision before migration.

## Mobile evidence and incomplete behavior

Mobile's [package manifest](https://github.com/franksunye/visutry-mobile/blob/b932c86e3c5a3ad0526c9e3d20a92e10911fe142/package.json)
uses `workspace:*` for core and Web. Its SDK submodule under `packages/visutry-tryon-sdk` is pinned to
`d883d159a2e6020176dfee54906a887244df754f`, rather than the inspected SDK `main` revision above.

The [Web face-analysis adapter](https://github.com/franksunye/visutry-mobile/blob/b932c86e3c5a3ad0526c9e3d20a92e10911fe142/src/platform/web/face-shape.ts)
shows these limitations:

- It runs the SDK path only when `VITE_FACE_SHAPE_SDK_ENABLED` is exactly `true`. This source check
  does not establish the value in any deployment.
- Its `analyze(_image)` method does not pass the supplied image into the SDK. It initializes the Web
  facade and calls `analyzeFaceShape()` without starting the camera in this adapter.
- Its result mapping omits `triangle`, so that SDK result cannot become a measured Mobile shape
  through this mapping.
- It creates the full AR facade for photo analysis rather than using the current lightweight
  image-analyzer entry point.

Mobile also maintains application-level style recommendations in
[`src/core/face-shape/analyzer.ts`](https://github.com/franksunye/visutry-mobile/blob/b932c86e3c5a3ad0526c9e3d20a92e10911fe142/src/core/face-shape/analyzer.ts).
These must be reviewed for intended product ownership before assuming they are the same capability
as SDK inventory ranking.

The workspace/submodule setup is more specific than the older README's local `file:` description.
Update the consuming repository's instructions and dependency/release strategy during its migration;
do not describe Mobile as fully integrated merely because imports exist.

## Reference-demo delivery

[PR #4](https://github.com/franksunye/visutry-tryon-sdk/pull/4) records release of
`a07a0097ca616f2c391f08237ec917c16fb28a99`, merged into the SDK baseline above. It records 391 unit
tests and five Chromium camera-fixture checks, with the actual MediaPipe tracker and WebGL renderer.
The [reference demo](https://visutry-sdk-demo.vercel.app) uses same-origin runtime and reference assets.

The same record states that npm package versions were unchanged, automatic Git deployment was not
connected, and the dedicated R2 custom-domain publication was still pending. The reference release
does not establish acceptance on physical iOS/Android hardware, WeChat, or a real retail frame.
See [the release procedure and evidence](SDK_REFERENCE_RELEASE.md).

## Updating adoption status

For any new verified integration, record the consuming application SHA, SDK version/SHA, active
entry points, removed duplicate rules, compatibility fixtures, deployment reference, observed
acceptance, and remaining limitations. Use the [architecture completion criteria](architecture.md#completion-criteria).
Keep older snapshots labeled as history rather than silently treating them as current deployment
evidence.
