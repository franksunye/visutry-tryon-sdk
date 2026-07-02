# @visutry/demo-assets

Demo glasses manifests and sample assets for the [VisuTry](https://github.com/visutry/visutry-tryon-sdk) SDK.

## Contents

| File | Frame Style | Description |
|------|-------------|-------------|
| `glasses/aviator-classic.json` | Aviator | Classic teardrop aviator shape |
| `glasses/cateye-fashion.json` | Cat-eye | Upswept fashion cat-eye frame |
| `glasses/round-retro.json` | Round | Retro round metal frame |
| `glasses/sport-wrap.json` | Sport | Wraparound sport performance frame |
| `glasses/square-modern.json` | Square | Modern square acetate frame |

## Usage

```typescript
import { loadGlassesManifest } from "@visutry/tryon-web";
import aviatorManifest from "@visutry/demo-assets/glasses/aviator-classic.json";

const sdk = await createVisuTryWebSDK({ /* ... */ });
await sdk.loadGlasses(aviatorManifest);
```

## License

MIT
