# Shared core: a standalone Node consumer

This example uses only the public `@visutry/tryon-core` and `@visutry/recommender`
packages. It supplies normalized semantic landmarks with their source image
dimensions, runs the face-shape scorer, and ranks a host-owned sample catalog.
The example itself uses no DOM or Node globals, so the same application logic
can be compiled for other JavaScript hosts.

**The geometry, quality metadata and catalog are synthetic.** They demonstrate
the input/output contract and failure handling; they do not validate face-shape
accuracy, physical fit, actual camera detection or mobile-device support.

## Run the packaged consumer check

From the repository root, install dependencies and build the packages first:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm exec node scripts/verify-shared-core-consumer.mjs
```

The verification script:

1. Packs the local built packages with the repository's pinned pnpm version.
2. Installs only those tarballs into a fresh temporary directory using npm's
   offline mode with lifecycle scripts disabled. It does not import repository
   source files or use workspace links.
3. Compiles this example and every public package entry with TypeScript
   `lib: ["ES2020"]`, `types: []` and `skipLibCheck: false`. Missing browser or
   Node ambient types are errors.
4. Checks the installed dependency tree and packaged JavaScript imports. Only
   core and recommender are allowed; Web, MediaPipe and Three.js cannot enter
   through undeclared or transitive imports.
5. Runs the emitted example in Node with browser globals removed, checks that
   physical size stays unavailable, and verifies that missing image dimensions
   produce an unknown result and generic preference recommendations.

The temporary consumer is removed when the command finishes. No registry access,
camera, browser or GPU is needed. Tooling uses Node.js >= 20. If the pinned pnpm
is not on `PATH`, set `VISUTRY_PNPM` to its executable or `pnpm.cjs` path.

## Reuse the application logic

Copy `example.ts` into a host project that has compatible public package
versions installed, then call `runSharedCoreExample()`. Replace the synthetic
input and catalog with your adapter's validated input and your own products.
Coordinates must be `x / sourceWidth` and `y / sourceHeight` after orientation;
`imageSize` must describe that same image. Never substitute detector confidence
or quality values merely to make a rejected analysis pass.

The result contains the heuristic `faceShape` and ranked products with reasons,
cautions, `faceShapeApplied` and an explicit `size` availability state. Physical
dimensions are not inferred from normalized geometry. Apps and mini-programs
still implement their own camera, detector, rendering and UI adapters; this
example demonstrates the shared computation contract only.
