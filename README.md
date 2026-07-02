# VisuTry Face Geometry & AR Glasses Try-On SDK

[![CI](https://github.com/visutry/visutry-tryon-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/visutry/visutry-tryon-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-368%20passed-brightgreen.svg)](#testing)

On-device face geometry analysis and AR glasses try-on SDK for **web (H5)** and **WeChat Mini Program**. All face processing happens locally — no images or landmarks are sent to a server.

---

## Features

- **On-device first** — face images, video frames, and landmarks never leave the device by default
- **Core / Adapter separation** — core algorithms have zero browser, MediaPipe, or Three.js dependencies
- **Face shape analysis** — 7 shape classification (oval, round, square, heart, diamond, oblong, triangle) with 2D geometric ratios and confidence scoring
- **Landmark mesh overlay** — render MediaPipe's 478-point face mesh with customizable colors, contours, and highlight points
- **Real-time AR try-on** — 3D glasses rendering with pose solving, smoothing, and quality gating
- **Single-photo analysis** — `analyzeFaceShapeFromImage()` for non-camera use cases
- **Glasses recommendation engine** — shape + size + preference scoring
- **Normalized glasses manifest** — standardized asset format for all try-on models
- **Multi-platform** — H5 (stable), WeChat Mini Program (experimental)

## Quick Start

### Install

```bash
pnpm install
```

### Build & Test

```bash
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm typecheck    # Type check
```

### Run the Web Demo

```bash
cd examples/web-demo
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser. Pages available:

| Page | Description |
|------|-------------|
| `/` | AR glasses try-on with live camera |
| `/face-analysis.html` | Upload a photo for face shape analysis with landmark mesh overlay |
| `/compare.html` | Head-to-head comparison: SDK vs legacy algorithm |

## Package Structure

| Package | Description | Status |
|---------|-------------|--------|
| [`@visutry/tryon-core`](packages/core) | Platform-agnostic core: types, coordinate transforms, semantic point mapping, face shape scoring, pose solving, smoothing, quality gate, privacy | Stable |
| [`@visutry/tryon-web`](packages/web) | H5 adapter: getUserMedia, MediaPipe FaceLandmarker, Three.js renderer, LandmarkOverlay | Stable |
| [`@visutry/tryon-wechat`](packages/wechat) | WeChat Mini Program adapter | Experimental |
| [`@visutry/recommender`](packages/recommender) | Glasses recommendation engine: shape + size + preference scoring | Stable |
| [`@visutry/demo-assets`](packages/demo-assets) | Demo glasses manifests and sample assets | Demo |

## Usage

### AR Glasses Try-On (Live Camera)

```typescript
import { createVisuTryWebSDK } from "@visutry/tryon-web";

const sdk = await createVisuTryWebSDK({
  canvas: document.getElementById("tryon-canvas"),
  camera: { facingMode: "user", width: 640, height: 480 },
  tracker: { mode: "balanced", maxFaces: 1 },
  renderer: { width: 640, height: 480, mirror: true, background: "transparent" },
  privacy: { processOnDeviceOnly: true, allowSnapshotExport: true },
});

await sdk.initialize();
await sdk.startCamera();
await sdk.startTryOn();
await sdk.loadGlasses(manifest);

// Face shape analysis from live camera
const result = await sdk.analyzeFaceShape();
console.log(result.primary, result.confidence);

// Snapshot
const snapshot = await sdk.snapshot();
```

### Face Shape Analysis (Single Photo)

```typescript
import { createVisuTryImageAnalyzer } from "@visutry/tryon-web";

const analyzer = createVisuTryImageAnalyzer();
const img = new Image();
img.src = "photo.jpg";
await img.decode();

const result = await analyzer.analyzeFaceShapeFromImage(img);
console.log(result.primary);       // "round"
console.log(result.confidence);    // 0.82
console.log(result.candidates);    // [{ shape: "round", score: 0.85 }, ...]
console.log(result.metrics.visutry.faceAspectRatio);  // 0.97
```

### Landmark Mesh Overlay

```typescript
import { createVisuTryImageAnalyzer, LandmarkOverlay } from "@visutry/tryon-web";

const analyzer = createVisuTryImageAnalyzer();
const result = await analyzer.analyzeFaceShapeFromImage(img);

const face = analyzer.getLastFaceResult();
const overlay = new LandmarkOverlay(canvas, {
  tesselationColor: "rgba(56, 189, 248, 0.34)",
  contourColor: "rgba(37, 99, 235, 0.9)",
  highlightColor: "#2563eb",
  showTesselation: true,
  showHighlights: true,
});
overlay.renderFromFace(face, img.naturalWidth, img.naturalHeight);
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Web (H5) Integration Guide](docs/web-integration.md)
- [WeChat Mini Program Integration](docs/wechat-integration.md)
- [Glasses Asset Standard](docs/glasses-asset-standard.md)
- [Face Shape Analysis Algorithm](docs/face-shape-algorithm.md)
- [Privacy Model](docs/privacy.md)
- [Performance Guide](docs/performance.md)

## Tech Stack

- **TypeScript** 5.7 (ES2020, strict mode)
- **pnpm** 10 workspace monorepo
- **vitest** 2.1 (jsdom, 80% coverage threshold)
- **@mediapipe/tasks-vision** 0.10.18 (478-point FaceLandmarker)
- **Three.js** 0.170 (OrthographicCamera, GLTFLoader)
- **ESLint** + **Prettier** + **Changesets**

## Testing

The SDK maintains 368 unit tests across all packages with an 80% coverage threshold enforced in CI.

```bash
pnpm test           # Run all tests
pnpm test:coverage  # Run with coverage report
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and pull request guidelines.

## Security

VisuTry processes all face data on-device. See [SECURITY.md](SECURITY.md) for vulnerability reporting policy.

## License

[MIT](LICENSE)
