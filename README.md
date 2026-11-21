# VisuTry SDK

**Open-source face geometry, eyewear recommendations, and AR glasses rendering.**

[![CI](https://github.com/franksunye/visutry-tryon-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/franksunye/visutry-tryon-sdk/actions/workflows/ci.yml)
[![Reference demo](https://github.com/franksunye/visutry-tryon-sdk/actions/workflows/demo-reference.yml/badge.svg)](https://github.com/franksunye/visutry-tryon-sdk/actions/workflows/demo-reference.yml)
[![npm](https://img.shields.io/npm/v/@visutry/tryon-core.svg)](https://www.npmjs.com/package/@visutry/tryon-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Reference demo](https://visutry-sdk-demo.vercel.app) ·
[Documentation](docs/README.md) ·
[API reference](https://franksunye.github.io/visutry-tryon-sdk/) ·
[Roadmap](docs/roadmap.md) ·
[Contributing](CONTRIBUTING.md)

VisuTry SDK provides reusable, on-device visual capabilities for browser applications and
experimental platform adapters. It is the shared visual foundation being developed for VisuTry
product surfaces, and a library that external developers can integrate into their own applications.
The SDK does not provide accounts, billing, hosted AI image generation, or a complete commerce app.

## Project status

The source repository, hosted reference demo, published npm packages, and consuming applications
are separate delivery states. A working demo does not establish adoption by another application.

| Area                 | Current scope and evidence                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core algorithms      | Implemented TypeScript geometry, scoring, pose, smoothing, quality, and manifest utilities with unit tests.                                                                                              |
| Web adapter          | Implemented MediaPipe and Three.js integration. The reference release passed a Chromium camera-fixture suite using the real tracker and renderer. Physical-device and retail-fit acceptance remain open. |
| Recommendations      | Implemented rule-based ranking of a supplied frame inventory. Size estimates are heuristic, not calibrated optical measurements.                                                                         |
| WeChat adapter       | Experimental camera/tracker/renderer interfaces. It does not yet provide a complete, verified AR pipeline equivalent to Web.                                                                             |
| VisuTry applications | Shared-core adoption is tracked in [integration status](docs/integration-status.md); production-site equivalence is not assumed.                                                                         |
| Package releases     | Pin a published version. Changes on `main`, including the reference-demo recovery, do not imply a new npm release.                                                                                       |

See [the reference-release record](docs/SDK_REFERENCE_RELEASE.md) for the tested commit, evidence,
and remaining limitations. This README describes repository source; check the matching release
tag and package declarations when using a published version.

## What you can build

- Analyze a photo or camera frame using local landmarks and seven-category geometry scoring.
  Poor inputs can produce an `unknown` result; confidence is a heuristic score.
- Display landmark overlays and rank a supplied glasses inventory by geometry and preferences.
- Render GLB glasses in a browser using pose solving, smoothing, and quality gating.
- Build platform-specific experiences around shared TypeScript contracts.

Local geometry analysis is distinct from VisuTry's paid, server-generated Face Analysis reports.
Local AR rendering is also distinct from hosted AI image generation. See
[product positioning](docs/product-positioning.md) for ownership and product boundaries.

## Run the source demo

Use **Node.js 22** and **pnpm 10.31.0**, matching CI and the repository's `packageManager` setting.

```bash
git clone https://github.com/franksunye/visutry-tryon-sdk.git
cd visutry-tryon-sdk
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm demo:web
```

Open the local URL printed by Vite. Camera access requires a secure browser context such as
`localhost` or HTTPS. `demo:web` prepares the pinned MediaPipe runtime; its first run may download
the model. Browser permission is still required for a real camera.

| Demo route            | Purpose                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `/`                   | Reference AR glasses, camera preview, lifecycle controls, and snapshot export.                  |
| `/face-analysis.html` | Photo analysis and landmark overlay.                                                            |
| `/compare.html`       | SDK versus an embedded historical algorithm; not a live comparison with the production website. |

For dependency installation, runtime hosting, and package integration, use
[Getting started](docs/getting-started.md) and the [Web guide](docs/web-integration.md).

## Analyze a selected photo

The analyzer subpath avoids importing the Three.js renderer. This example expects a `File` supplied
by the application's file input and uses the current source API.

```typescript
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web/analyzer";

export async function analyzePhoto(file: File) {
  const analyzer = createVisuTryImageAnalyzer();
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    image.src = imageUrl;
    await image.decode();
    const { result } = await analyzer.analyzeImage(image);
    return result; // Check result.primary and result.warnings in the application UI.
  } finally {
    analyzer.destroy();
    URL.revokeObjectURL(imageUrl);
  }
}
```

Model and WASM resources are downloaded during initialization unless already available. Local face
processing does not mean that the application makes no network requests. The SDK has no face-upload
transport, but the host application controls the data it receives and any subsequent uploads.
Snapshot export is enabled by the current Web default; set `allowSnapshotExport: false` when needed.
Read the [privacy guide](docs/privacy.md) before integrating capture or analytics.

## Packages

| Package                                                  | Responsibility                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`@visutry/tryon-core`](packages/core/README.md)         | Shared contracts and geometry, scoring, pose, smoothing, quality, and manifest algorithms.                                 |
| [`@visutry/tryon-web`](packages/web/README.md)           | Browser camera, MediaPipe tracking, Three.js rendering, photo analyzer, and overlays.                                      |
| [`@visutry/recommender`](packages/recommender/README.md) | Rule-based ranking and heuristic sizing for an application-supplied inventory.                                             |
| [`@visutry/tryon-wechat`](packages/wechat/README.md)     | Experimental WeChat adapters and a lifecycle facade; see its limitations before use.                                       |
| [`@visutry/demo-assets`](packages/demo-assets/README.md) | Private workspace assets, including an original, versioned reference frame. Not a retail catalog or published npm package. |

Core and recommender logic must be reused by adapters and consuming products rather than copied
into new classifiers. The [architecture contract](docs/architecture.md) defines this target and
acceptance requirements for migrating existing applications.

## Documentation map

| Start here                    | Then read                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the project        | [Positioning](docs/product-positioning.md), [architecture](docs/architecture.md), [integration status](docs/integration-status.md).                 |
| Integrate Web                 | [Getting started](docs/getting-started.md), [Web integration](docs/web-integration.md), [privacy](docs/privacy.md).                                 |
| Evaluate WeChat               | [WeChat integration](docs/wechat-integration.md) and its experimental limitations.                                                                  |
| Understand outputs and assets | [Face-shape algorithm](docs/face-shape-algorithm.md), [glasses asset standard](docs/glasses-asset-standard.md), [performance](docs/performance.md). |
| Contribute                    | [Contributing](CONTRIBUTING.md), [roadmap](docs/roadmap.md), [security](SECURITY.md), [code of conduct](CODE_OF_CONDUCT.md).                        |

The [documentation index](docs/README.md) identifies the authority for each subject. Documentation,
examples, and project-facing contributions are maintained in English.

## Development checks

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:coverage
corepack pnpm build
corepack pnpm docs:api
```

Unit checks do not establish live-camera quality or device compatibility. Follow the
[reference-demo procedure](docs/SDK_REFERENCE_RELEASE.md) when a change affects the camera,
tracker, renderer, or assets. Do not infer production readiness from a coverage badge.

## License and support

SDK source is [MIT licensed](LICENSE). Reference assets carry their own
[provenance](packages/demo-assets/reference/v1/PROVENANCE.md), and bundled third-party runtime
components retain their upstream licenses and notices.

Use [GitHub Issues](https://github.com/franksunye/visutry-tryon-sdk/issues) for bugs and proposals.
Report vulnerabilities through the [security policy](SECURITY.md). For VisuTry's hosted product,
visit [visutry.com](https://www.visutry.com).
