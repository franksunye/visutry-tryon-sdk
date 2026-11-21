# @visutry/recommender

## 0.3.0

### Breaking safety corrections

- Physical sizing now requires explicit host-supplied `PhysicalFaceMeasurements`
  with source `measured` or `calibrated`. The source label is a host assertion,
  not SDK verification of provenance. Missing or invalid inputs return
  `size.status: "unavailable"` and a neutral size score; normalized face metrics
  and population averages no longer produce millimeter estimates.
- `recommendSize` now accepts physical measurements and returns an
  available/unavailable union. Narrow `status` before reading physical fields.
  `estimateFaceWidthMm` and `estimateEyeCenterDistanceMm` remain as deprecated
  exports but always return `undefined`. The four fixed-conversion/average
  constants are removed from the public exports.
- `RecommendationInput.faceShape` is optional; `faceMetrics` is deprecated and
  ignored. `RecommendedGlasses` now includes `faceShapeApplied` and `size`.
  Face-shape rules require a known shape, explicit core geometry validity, and
  finite positive heuristic confidence within its declared range. Unknown,
  rejected and legacy unvalidated analyses use generic preference ranking.
  Confidence is not treated as a calibrated probability or an accuracy cutoff.
- Missing or invalid catalog dimensions each receive a neutral component weight
  instead of being treated as a zero-size match. Reasons describe heuristic
  rules, and unknown prices include a caution when a budget is supplied.
- Added regression tests for photo-scale independence, invalid numeric input,
  unknown/rejected face analysis, generic preferences and explicit physical data.

## 0.2.3

### Patch Changes

- 653d50e: Fix developer experience issues: exclude test fixtures from npm packages, update Node.js engine requirement to >=20, fix face shape count (7 not 6) in docs, update TypeScript version to 5.9 in README, fix TypeDoc version title, clarify peer dependency install instructions.
- Updated dependencies [653d50e]
  - @visutry/tryon-core@0.2.2

## 0.2.2

### Patch Changes

- Initial public release changelog. Added package metadata (keywords, repository, homepage, bugs) to all sub-packages for npm discoverability. Added subpath exports for granular tree-shaking. Improved `ImageAnalyzer.analyzeFaceShapeFromImage` to optionally return face result alongside the shape analysis, while maintaining backward compatibility with `getLastFaceResult()`.
- Updated dependencies
  - @visutry/tryon-core@0.2.1
