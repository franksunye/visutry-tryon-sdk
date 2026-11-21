# Glasses Asset Standard

`GlassesAssetManifest` describes a model and fitting metadata. The interface is in [core types](../packages/core/src/types/index.ts). Validation is explicit: current web and WeChat `loadGlasses()` paths do not automatically invoke `ManifestValidator`.

Use the reference [manifest](../packages/demo-assets/reference/v1/manifest.json) and [provenance](../packages/demo-assets/reference/v1/PROVENANCE.md) as the implementation baseline.

## Fields

| Field              | Contract                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| `id`, `name`       | Non-empty identity strings                                             |
| `modelUrl`         | GLB/glTF location                                                      |
| `thumbnailUrl`     | Optional host UI preview                                               |
| `format`           | `"glb"` or `"gltf"`                                                    |
| `coordinateSystem` | Native unit, forward axis and up axis                                  |
| `dimensions`       | Required `frameWidthMm`; optional lens/bridge/temple dimensions        |
| `anchors`          | Required `origin`, `noseBridge`; optional hinge/lens centers           |
| `fitting`          | Scale, offset and rotation defaults; optional bounds/hints             |
| `material`         | Required object in the TypeScript contract; optional individual fields |
| `metadata`         | Optional brand, shape, colors, tags, price and currency                |

The type accepts `millimeter`, `centimeter`, `meter`; `forwardAxis: "+z" | "-z"`; and `upAxis: "+y" | "+z"`. Declaring them does not make every authoring convention automatically work.

## Authoring and current limits

Normalize new models to millimeters with `+y` up, `+z` forward, frame width along x, and the model origin at the intended fitting anchor. This matches the reference asset.

The web renderer converts model-local units using the declared factor and `MM_TO_RENDER_WORLD = 1 / 200` once. Its orthographic space spans one unit vertically; aspect ratio sets the horizontal extent. The pose solver supplies relative scale, position and rotation.

Current limitations:

- Axis declarations are validated, but the renderer does not automatically rotate geometry from `forwardAxis` or `upAxis`.
- Declared `anchors` do not automatically relocate the model pivot. Bake the intended pivot into geometry or verify fitting offsets.
- The current pose solver applies the declared unit factor to `frameWidthMm`, although the field name suggests millimeters. The validator's width-range warning assumes millimeter-scale values. Use millimeter geometry and dimensions for the documented baseline; verify other units explicitly.
- `material` metadata does not override glTF materials. Author appearance and transparency in the model.
- Manifest `fitBy` and `verticalAnchor` are hints. The current solver uses its defaults plus runtime `GlassesFittingConfig`, not those hints automatically.
- `depthStrategy` is a runtime fitting option, not a declared manifest field.

These are current implementation boundaries. Do not silently reinterpret an existing asset to work around them.

## Example

The URL below is illustrative; the host must supply that model.

```ts
import type { GlassesAssetManifest } from "@visutry/tryon-core";

export const exampleManifest: GlassesAssetManifest = {
  id: "example-frame-v1",
  name: "Example Frame",
  modelUrl: "/glasses/example-frame-v1.glb",
  format: "glb",
  coordinateSystem: { unit: "millimeter", forwardAxis: "+z", upAxis: "+y" },
  dimensions: { frameWidthMm: 140, lensWidthMm: 52, bridgeWidthMm: 16 },
  anchors: {
    origin: { x: 0, y: 0, z: 0 },
    noseBridge: { x: 0, y: 0, z: 0 },
  },
  fitting: {
    defaultScale: 1,
    defaultOffset: { x: 0, y: 0, z: 0 },
    defaultRotation: { x: 0, y: 0, z: 0 },
    minScale: 0.6,
    maxScale: 1.8,
  },
  material: {},
  metadata: { shapeCategory: "rectangle" },
};
```

`defaultOffset` is added directly in render-world coordinates; `defaultRotation` is added in radians. Runtime position/rotation offsets use those same conventions. They are not distances in the model's native length unit.

Fitting is visual alignment, not measured pupillary distance or verified optical/physical fit.

## Explicit validation

```ts
import { ManifestValidator, type GlassesAssetManifest } from "@visutry/tryon-core";

export async function fetchManifest(url: string): Promise<GlassesAssetManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }
  const candidate: unknown = await response.json();
  const validator: ManifestValidator = new ManifestValidator();
  validator.validateOrThrow(candidate);
  return candidate;
}
```

`validate()` returns `{ valid, issues }`. Each issue has a field, message and error/warning severity. `validateOrThrow()` rejects errors, not warnings such as width outside 80-200.

The helper checks selected fields, not a complete JSON schema. It accepts a missing `material` object and does not enforce finite numbers for every vector component. Validate untrusted catalogs more strictly in the host pipeline. Passing it proves neither URL availability, valid glTF content nor correct visual fit.

## Delivery and rendering

The web adapter uses Three.js `GLTFLoader`. GLB can embed resources; glTF may require separate buffers and textures. Serve the whole graph with appropriate HTTPS, MIME types and CORS. Keep source licenses and provenance.

The renderer does not configure Draco or KTX2 decoders. Assets requiring those extensions need corresponding implementation and validation. Extra integrity/provenance fields in the reference JSON are release-tooling metadata; the generic loader does not enforce them.

The reference demo serves committed geometry on its own origin. External-origin/R2 delivery needs separate deployment and browser evidence. See [Reference Release](./SDK_REFERENCE_RELEASE.md).

## Acceptance

Verify loading, pivot, scale, orientation, front/side poses, mirroring, replacement and failed replacement, and snapshot appearance. Test the final model with the final runtime settings. Review cost with the [Performance guide](./performance.md); manifest validation is only one part of acceptance.
