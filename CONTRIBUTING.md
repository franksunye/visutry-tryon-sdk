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

## Release Process

The SDK uses [Changesets](https://github.com/changesets/changesets) for version management and npm OIDC Trusted Publishing for automated, tokenless releases.

### How Releases Work

1. **Create a changeset** — When making changes that affect published packages, run:

   ```bash
   pnpm changeset
   ```

   Select the affected packages, choose bump type (patch/minor/major), and write a summary. This creates a `.changeset/*.md` file that should be committed with your PR.

2. **Version PR** — When a changeset is merged to `main`, the Release workflow automatically opens a "Version Packages" PR that bumps versions and updates CHANGELOGs. Merge this PR to trigger a release.

3. **Automatic publish** — Pushing to `main` (including merging the version PR) triggers the Release workflow which:
   - Builds all packages
   - Publishes to npm via OIDC Trusted Publishing (no tokens stored in GitHub)
   - Creates git tags for each released version

4. **Manual trigger** — The Release workflow can also be triggered manually from the GitHub Actions tab (`workflow_dispatch`).

### OIDC Trusted Publishing

npm packages are published using [OIDC Trusted Publishing](https://docs.npmjs.com/generating-provenance-statements) — no `NPM_TOKEN` secret is stored in GitHub. Each package's npm page has a Trusted Publisher configured for `franksunye/visutry-tryon-sdk` with workflow `release.yml`.

### What Not to Do

- Do not manually run `npm publish` — releases go through CI only
- Do not manually edit `package.json` versions or `CHANGELOG.md` — use changesets
- Do not create git tags manually — the publish script handles tagging

## Reporting Issues

- Use [GitHub Issues](https://github.com/franksunye/visutry-tryon-sdk/issues) to report bugs or request features
- Include the SDK version, browser/platform, and a minimal reproduction
- For security vulnerabilities, see [SECURITY.md](SECURITY.md) — do not open public issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
