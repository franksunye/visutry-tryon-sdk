# Contributing to VisuTry SDK

Thank you for your interest in contributing to VisuTry! This document covers the development setup, coding standards, and pull request process.

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9 (`npm install -g pnpm`)
- A modern browser with WebGL2 and `getUserMedia` support (for demo testing)

### Getting Started

```bash
git clone https://github.com/franksunye/visutry-tryon-sdk.git
cd visutry-tryon-sdk
pnpm install
```

### Build

```bash
pnpm build          # Build all packages
pnpm typecheck      # Type check all packages
pnpm test           # Run all unit tests
pnpm test:coverage  # Run tests with coverage report
pnpm lint           # Lint all TypeScript files
pnpm format         # Format all files with Prettier
```

### Running the Demo

```bash
cd examples/web-demo
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser.

## Architecture

The SDK follows a **core / adapter** separation:

- **`@visutry/tryon-core`** — Platform-agnostic algorithms (no browser, MediaPipe, or Three.js imports). All types, face shape scoring, pose solving, smoothing, quality gating, and privacy logic live here.
- **`@visutry/tryon-web`** — H5 adapter. Implements `MediaPipeFaceTracker`, `WebCameraProvider`, `ThreeJsRenderer`, and `LandmarkOverlay` on top of core.
- **`@visutry/tryon-wechat`** — WeChat Mini Program adapter (experimental).
- **`@visutry/recommender`** — Glasses recommendation engine.

Core must never import from adapter packages. Adapters depend on core, never on each other.

## Coding Standards

- **TypeScript strict mode** — all code must pass `tsc --strict` with zero errors
- **No `any` types** — use `unknown` and type narrow, or define proper interfaces
- **ESM first** — all packages use `"type": "module"` with `.js` extensions in imports
- **Co-located tests** — unit tests sit next to source files as `*.test.ts`
- **Coverage threshold** — 80% statements/lines/functions, 75% branches (enforced in CI)
- **Prettier formatting** — `semi: true`, `double quotes`, `printWidth: 100`, `trailingComma: "all"`

## Pull Request Process

1. **Create a changeset** — Run `pnpm changeset` to describe what changed and which packages are affected. This is required for all PRs that modify published packages.

2. **Write tests** — New features and bug fixes must include tests. Aim for at least 80% coverage on new code.

3. **Update documentation** — If you add a public API, update the relevant docs file and README.

4. **Ensure CI passes** — All checks (lint, typecheck, test, build) must pass:

   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```

5. **Keep PRs focused** — One feature or fix per PR. Split large changes into multiple PRs.

## Commit Messages

Use clear, descriptive commit messages. Suggested format:

```
type: short description

Optional longer description.
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

## Reporting Issues

- Use [GitHub Issues](https://github.com/franksunye/visutry-tryon-sdk/issues) to report bugs or request features
- Include the SDK version, browser/platform, and a minimal reproduction
- For security vulnerabilities, see [SECURITY.md](SECURITY.md) — do not open public issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
