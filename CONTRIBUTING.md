# Contributing to VisuTry SDK

Contributions should make the shared visual capabilities easier to trust, integrate, and maintain.
Start with the [documentation index](docs/README.md), [architecture contract](docs/architecture.md),
and [roadmap](docs/roadmap.md).

## Development setup

Use Node.js 22 and pnpm 10.31.0 to match CI. Package engines permit Node.js 20 or newer, but the
current CI matrix exercises Node.js 22. The root `packageManager` field pins pnpm.

```bash
git clone https://github.com/franksunye/visutry-tryon-sdk.git
cd visutry-tryon-sdk
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm demo:web
```

If Corepack is not available in your environment, install the pinned pnpm version and use `pnpm`
for the same commands. Do not regenerate the lockfile with a different package-manager major version
as an incidental documentation change.

The browser demo needs WebGL, a secure context, and camera permission. Runtime preparation may fetch
the pinned model. See [Getting started](docs/getting-started.md) for details and the
[reference-release procedure](docs/SDK_REFERENCE_RELEASE.md) for camera-fixture testing.

## Package ownership

- `tryon-core`: shared contracts and algorithms, without platform runtime imports.
- `recommender`: generic inventory scoring and heuristic sizing.
- `tryon-web`: browser input, tracking, rendering, and lifecycle.
- `tryon-wechat`: experimental WeChat adapters with explicitly documented gaps.
- `demo-assets`: private workspace reference assets and provenance.

Reuse the authoritative algorithm rather than copying it into an adapter or application. Changes to
thresholds, warning semantics, coordinates, or recommendation scores require compatibility evidence.
An API resemblance does not establish that two adapters are interchangeable.

## Code and documentation standards

- Keep TypeScript strict and use concrete types or `unknown` with narrowing.
- Follow existing ESM imports and repository Prettier configuration.
- Put algorithm and behavior tests beside the relevant source.
- Keep runtime, model, asset, and application-version evidence separate.
- Use English for documentation, API comments, examples, project-facing issues, and pull requests.
- Preserve third-party notices and asset provenance.

### Documentation changes

Update the document that owns the subject, and link to it from other pages. The
[documentation index](docs/README.md) lists those responsibilities.

Before review:

1. Check examples against exported types and actual defaults. Include necessary initialization,
   input assumptions, error handling, and cleanup.
2. Distinguish implemented behavior, experimental code, accepted verification, and planned work.
3. Verify relative links and anchors. Link cross-repository evidence to inspected revisions.
4. Generate API documentation when changing README/API-facing content or public comments:

   ```bash
   corepack pnpm build
   corepack pnpm docs:api
   ```

5. Format the Markdown files you changed; avoid reformatting unrelated source:

   ```bash
   corepack pnpm exec prettier --check README.md docs/README.md
   ```

Generated files under `docs/api/` are ignored build outputs. Edit source comments and Markdown,
not generated HTML. Documentation-only changes do not need invented unit tests or a package-version
bump. If examples expose an implementation defect, document it accurately and track a separate fix
unless the approved change includes that behavior.

## Verification

For runtime changes, run the existing gates:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:coverage
corepack pnpm build
```

`vitest.config.ts` defines global coverage thresholds of 80% for statements, functions, and lines,
and 75% for branches. Coverage measures exercised code, not device support or algorithm accuracy.

Camera, rendering, snapshot, model, and asset changes also require the
[reference-demo gate](docs/SDK_REFERENCE_RELEASE.md). Its real Chromium tracker/renderer tests use a
camera fixture; physical-device qualification remains separate. Report the command, revision, and
actual result, including failures or skipped checks.

## Pull requests

Explain the problem, the changed behavior or documentation, and the evidence needed to review it.
Keep implementation work separate from unrelated refactoring. Link the relevant issue when one
exists, and use the [pull-request template](.github/PULL_REQUEST_TEMPLATE.md).

Public API or package-behavior changes require a Changeset for the affected packages. Run
`corepack pnpm changeset`, select the appropriate version impact, and explain compatibility changes.
Documentation-only updates can mark the Changeset item as not applicable.

Suggested commit prefixes are `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, and `perf`.

## Release and documentation delivery

The checked-in workflows are the authority for automation:

| Workflow                                                   | Current behavior                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [CI](.github/workflows/ci.yml)                             | Lint, typecheck, coverage, clean builds, and API documentation generation on pull requests and `main`. |
| [SDK reference demo](.github/workflows/demo-reference.yml) | Prepare assets, build, and run the selected real-browser reference suite on pull requests and `main`.  |
| [Deploy API Docs](.github/workflows/docs.yml)              | Generate TypeDoc and deploy it to GitHub Pages on `main` or manual dispatch.                           |
| [Release](.github/workflows/release.yml)                   | Build and invoke the OIDC publishing script, then open a version PR when pending Changesets exist.     |

The publishing script checks each core, recommender, Web, and WeChat name/version against the npm
registry and skips versions already present. Versions absent from the registry are published using
the configured trusted-publishing flow; the script creates a version tag if absent. Source package
versions or a configured workflow are not proof that registry publication succeeded.

Do not manually publish packages, edit version numbers/changelogs for a release, or create release
tags outside the governed process. Use Changesets and inspect the actual workflow and registry
results. Documentation generation, npm publishing, reference-demo deployment, and consuming-app
release are independent events. The reference demo currently uses a separately recorded deployment
process; its validation workflow does not itself deploy the site.

## Issues and security

Use [GitHub Issues](https://github.com/franksunye/visutry-tryon-sdk/issues) for reproducible bugs and
scoped proposals. Include package/source versions, platform, minimal code, and expected versus actual
behavior. Use a permitted fixture instead of posting private face images or raw personal data.

Report vulnerabilities privately through [SECURITY.md](SECURITY.md). Contributor conduct is covered
by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Contributions are licensed under the [MIT license](LICENSE).
