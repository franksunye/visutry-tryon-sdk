# @visutry/demo-assets

Repository-local demonstration assets for the [VisuTry SDK](../../README.md).
This workspace package is marked `private: true`; it is not an npm installation
dependency. Reference geometry is a technical example, not a measured product.

## Reproducible reference asset

[`reference/v1/`](reference/v1/PROVENANCE.md) contains the canonical release files:

| File                     | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `manifest.json`          | Dimensions, coordinates, anchors, fitting defaults and URLs |
| `reference-frame-v1.glb` | Original VisuTry-generated reference frame                  |
| `reference-frame-v1.svg` | Reference thumbnail                                         |
| `PROVENANCE.md`          | Generator, hashes, byte counts and design parameters        |
| `LICENSE`                | MIT license for the original reference asset                |

The manifest declares `demoOnly: true` and `physicalProduct: false`. Its
millimetre dimensions are design inputs, not evidence of real-world fit.
Checked-in copies under `examples/web-demo/public/reference/v1/` serve the demo
from the same origin. Run `pnpm demo:prepare` from the repository root to check
committed geometry and prepare the pinned MediaPipe runtime.

See the [reference release record](../../docs/SDK_REFERENCE_RELEASE.md) for the
deployed source revision, recorded browser evidence and outstanding R2 work.

## Legacy style manifests

The files below remain separate manifest examples. Their
`cdn.visutry.com/demo/glasses/` URLs were not recovered or validated by the
reference release; they are not evidence of five working demo models.

| File                           | Frame Style | Description                        |
| ------------------------------ | ----------- | ---------------------------------- |
| `glasses/aviator-classic.json` | Aviator     | Classic teardrop aviator shape     |
| `glasses/cateye-fashion.json`  | Cat-eye     | Upswept fashion cat-eye frame      |
| `glasses/round-retro.json`     | Round       | Retro round metal frame            |
| `glasses/sport-wrap.json`      | Sport       | Wraparound sport performance frame |
| `glasses/square-modern.json`   | Square      | Modern square acetate frame        |

## Usage in a host application

Copy the reference directory into your application's public `/reference/v1/`
path, or use your own versioned origin and update the manifest URLs.
Call this helper after the Web SDK has initialized:

```typescript
import { ManifestValidator, type VisuTrySDK } from "@visutry/tryon-web";

export async function loadReferenceFrame(sdk: VisuTrySDK): Promise<void> {
  const response = await fetch("/reference/v1/manifest.json");
  if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
  const manifest: unknown = await response.json();
  const validator: ManifestValidator = new ManifestValidator();
  validator.validateOrThrow(manifest);
  await sdk.loadGlasses(manifest);
}
```

There is no `loadGlassesManifest` export. The host fetches or imports JSON,
validates it and passes the manifest to `sdk.loadGlasses`.

See the [glasses asset standard](../../docs/glasses-asset-standard.md) when
preparing your own models.

## License

MIT
