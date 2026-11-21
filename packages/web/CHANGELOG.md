# @visutry/tryon-web

## 0.3.0

### Minor Changes

- Supply intrinsic image dimensions and observed face counts to core 0.3.0.
- Return explicit accepted/rejected photo status; reject group photos and failed quality instead of appending warnings to a confident result.
- Add recoverable no-face and busy errors, immutable per-detection landmarks, independent photo stability and safe resource disposal.
- Validate IMAGE-mode analysis in the real browser gate alongside the existing camera/renderer checks.
- Depend on @visutry/tryon-core 0.3.0; see [migration notes](../../docs/migration-0.3.md).

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
