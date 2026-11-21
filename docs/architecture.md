# Architecture and shared-core contract

- **Status:** Active architecture direction; existing application migrations remain open
- **Reviewed:** 2026-11-21
- **Owner:** Engineering

This document defines where reusable visual behavior belongs and how consuming applications must
adopt it. It does not claim that the target architecture is already implemented everywhere. See
[integration status](integration-status.md) for the inspected current state.

## Package boundaries

| Owner                   | Responsibility                                                                                                                                  | Must remain outside this owner                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@visutry/tryon-core`   | Shared types, semantic landmarks, coordinates, geometry, face-shape scoring, pose, smoothing, quality, manifest validation, and policy helpers. | Platform runtime imports, UI, persistence, network transports, account and commerce rules.      |
| `@visutry/recommender`  | Generic ranking and heuristic sizing over application-supplied inventory.                                                                       | Catalog fetching, paid report generation, tenant authorization, pricing strategy, and checkout. |
| `@visutry/tryon-web`    | Browser camera/image input, MediaPipe integration, browser lifecycle, overlays, Three.js rendering, and Web facades.                            | A separate copy of core classification or recommendation rules.                                 |
| `@visutry/tryon-wechat` | Experimental WeChat environment, camera, tracker, renderer, and lifecycle interfaces.                                                           | An unverified promise of Web-equivalent tracking/rendering or a duplicated classifier.          |
| Consuming application   | UX, permissions and consent, asset selection, product policies, backend calls, errors/recovery, and lifecycle ownership.                        | A new copy of a shared algorithm introduced merely to avoid a package dependency.               |

Core has no runtime dependency on DOM, MediaPipe, Three.js, or WeChat. Some public interfaces describe
platform input types; this is different from importing a platform implementation. Adapters consume
core. The recommender consumes core types. Core must not depend on an adapter, and adapters must not
depend on each other.

## One authoritative implementation

The target is one maintained implementation for each shared geometry, classification, quality,
pose, and generic ranking rule. Consuming products must import a versioned SDK package or call a
shared service that uses it. Copying the same source into another repository does not satisfy this
contract, even when initial outputs match.

An application adapter may translate input and output structures, map warnings into user-facing
messages, and apply a distinct product policy. It must not silently change a shared threshold,
recompute the same score, or redefine the meaning of a metric. Product-specific ranking can exist
when its purpose and ownership are explicit; it must not be described as the same generic SDK rule.

Existing duplicated implementations are migration work, not evidence that this rule is already
satisfied. Migration must preserve behavior deliberately: a changed classification or warning
requires an explicit decision and regression evidence rather than a silent replacement.

## Shared processing and platform-specific detection

The reusable contract is the normalized face representation and the core behavior built on it.
Detectors may differ by platform: Web uses MediaPipe while the experimental WeChat adapter uses
WeChat-specific facilities. Their camera, detector, model loading, and rendering implementations
cannot be assumed to be identical.

| Stage                | Required agreement                                                                                 | Permitted variation                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Input and detection  | Named detector/model version, documented image orientation and coordinate mapping.                 | Camera APIs, image decoding, platform detector, and runtime delivery.         |
| Normalization        | Meaning of semantic points, coordinate conventions, frame dimensions, and missing-data handling.   | Adapter code that translates a platform's native landmark representation.     |
| Geometry and scoring | Shared functions, versioned rules, result fields, confidence interpretation, and quality warnings. | Explicitly documented application presentation and product policies.          |
| Recommendation       | Same generic scoring for the same normalized input, inventory, and preferences.                    | Inventory eligibility, catalog source, and separately named business ranking. |
| Rendering            | Manifest units and anchor meaning; consistent transformation ownership.                            | Canvas/WebGL implementation and platform lifecycle.                           |

Identical raw photos are not sufficient to demand bit-for-bit results from different detectors or
preprocessing paths. Deterministic core parity must use identical normalized inputs. Adapter parity
must use defined fixtures and documented tolerances, including failure and quality-gate behavior.

## Contracts and source authorities

| Contract                               | Source                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public data types and facade contracts | [`packages/core/src/types/index.ts`](../packages/core/src/types/index.ts).                                                                                                                                                |
| Geometry and classification            | [`FaceMetricsCalculator`](../packages/core/src/face/FaceMetricsCalculator.ts), [`FaceShapeScorer`](../packages/core/src/face/FaceShapeScorer.ts), and [shared quality constants](../packages/core/src/face/constants.ts). |
| Recommendation                         | [`Recommender`](../packages/recommender/src/Recommender.ts) and [sizing helpers](../packages/recommender/src/sizing.ts).                                                                                                  |
| Browser APIs                           | [Web exports](../packages/web/src/index.ts), [Web facade](../packages/web/src/VisuTryWebSDK.ts), and [image analyzer](../packages/web/src/ImageAnalyzer.ts).                                                              |
| WeChat APIs                            | [WeChat exports](../packages/wechat/src/index.ts) and [its separate facade](../packages/wechat/src/sdk.ts).                                                                                                               |
| Privacy defaults and limits            | [`PrivacyGuard`](../packages/core/src/privacy/PrivacyGuard.ts) and the [privacy guide](privacy.md).                                                                                                                       |

The current Web and WeChat facades have different method sets. Shared types and algorithms do not
make those facades interchangeable. Generated API documentation must reflect each package's actual
exports.

## Main-site and Mobile adoption requirements

The main website's local face detector is the first migration target because maintaining separate
classifiers allows behavior to drift. This work must not alter server-generated paid reports,
entitlements, or hosted AI generation merely because they also use the words "face analysis" or
"try-on".

For each consuming application:

1. Record the application SHA, SDK SHA/package version, current entry points, and all local copies of
   geometry, scoring, and warning rules.
2. Map application inputs and outputs to SDK contracts. Preserve public response and UX behavior
   unless a documented product decision intentionally changes it.
3. Create a bounded regression set for normal faces, threshold boundaries, tilt, asymmetry, small
   faces, missing landmarks, invalid values, and no-face inputs. Use permitted fixtures and document
   provenance.
4. Review mismatches explicitly. Either preserve required behavior in the shared implementation or
   record an intentional behavior change with its product impact.
5. Replace active duplicated logic with a thin adapter over the shared implementation. Keep any
   temporary comparison or rollback path clearly marked, time-bounded, and outside the default path.
6. Validate the application path, load/bundle impact, failure recovery, and established product
   boundaries. Pin the dependency and retain a practical rollback to the previously accepted build.
7. Record the deployed revision and acceptance evidence before changing adoption status to verified.
   A dependency declaration alone is insufficient.

### Completion criteria

- The active application path calls the versioned SDK implementation.
- Shared classification, ratios, thresholds, and generic ranking are not independently maintained
  in the application.
- Identical normalized fixtures produce the required matching outputs and warnings; numeric
  tolerances and all approved differences are recorded.
- Adapter and user-flow tests cover initialization, quality failures, cleanup, and retry where
  applicable.
- Bundle/runtime impact is measured against an agreed baseline. Geometry-only use must not
  unnecessarily import the AR renderer.
- The deployed SHA, package versions, observed result, and rollback path are linked in
  [integration status](integration-status.md).

These are acceptance requirements for future migrations. This documentation change does not itself
complete any migration.

## Compatibility and releases

Pin package versions in consuming applications and keep related packages compatible. API additions,
behavior changes, threshold updates, warning changes, and asset conventions require release notes
and appropriate package versioning. Record the scorer version alongside the package/source revision;
the scorer constant alone is not proof that two codebases match.

The repository has separate workflows for package publishing, generated API docs, and reference-demo
validation. Application deployment is another independent event. Do not replace one form of
evidence with another.

## Boundaries that remain platform-owned

Authentication, payments, credit settlement, paid-report access, image uploads/storage, merchant
tenancy, analytics transport, SEO pages, and commerce workflows stay in the consuming product or
shared platform service. The SDK's exported data and privacy helpers do not prevent host code from
sending data elsewhere. Applications must govern their own transports and retention.

See [product positioning](product-positioning.md) for product boundaries and [the roadmap](roadmap.md)
for the implementation sequence.
