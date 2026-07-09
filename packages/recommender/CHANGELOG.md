# @visutry/recommender

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
