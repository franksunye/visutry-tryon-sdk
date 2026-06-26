# Glasses Asset Standard

This document specifies the complete `GlassesAssetManifest` format — the contract between a glasses 3D model and the VisuTry SDK. Every glasses model loaded via `loadGlasses()` or `switchGlasses()` must conform to this manifest. The `ManifestValidator` enforces it at load time.

---

## Table of Contents

- [Manifest Overview](#manifest-overview)
- [Coordinate System Requirements](#coordinate-system-requirements)
- [Unit Normalization](#unit-normalization)
- [Dimensions](#dimensions)
- [Anchors](#anchors)
- [Fitting Configuration](#fitting-configuration)
- [Material Properties](#material-properties)
- [Metadata](#metadata)
- [Model Preparation Guidelines](#model-preparation-guidelines)
- [GLB Requirements](#glb-requirements)
- [Validation](#validation)
- [Complete Examples](#complete-examples)

---

## Manifest Overview

The `GlassesAssetManifest` is a JSON object with these top-level fields:

```ts
interface GlassesAssetManifest {
  // Identity
  id: string;
  name: string;
  modelUrl: string;
  thumbnailUrl?: string;
  format: "glb" | "gltf";

  // Geometry
  coordinateSystem: {
    unit: "millimeter" | "centimeter" | "meter";
    forwardAxis: "+z" | "-z";
    upAxis: "+y" | "+z";
  };

  // Physical dimensions
  dimensions: {
    frameWidthMm: number;
    lensWidthMm?: number;
    lensHeightMm?: number;
    bridgeWidthMm?: number;
    templeLengthMm?: number;
  };

  // Anchor points (in model-local coordinates)
  anchors: {
    origin: Vector3;
    noseBridge: Vector3;
    leftHinge?: Vector3;
    rightHinge?: Vector3;
    leftLensCenter?: Vector3;
    rightLensCenter?: Vector3;
  };

  // Fitting defaults
  fitting: {
    defaultScale: number;
    defaultOffset: Vector3;
    defaultRotation: Vector3;
    minScale?: number;
    maxScale?: number;
  };

  // Material (optional)
  material?: {
    lensOpacity?: number;
    frameRoughness?: number;
    supportsTransparency?: boolean;
  };

  // Metadata (optional)
  metadata?: {
    brand?: string;
    shapeCategory?: GlassesShape;
    colors?: string[];
    tags?: string[];
  };
}
```

### Required vs optional fields

| Field | Required | Validation |
|---|---|---|
| `id` | Yes | Non-empty string |
| `name` | Yes | Non-empty string |
| `modelUrl` | Yes | Non-empty string |
| `format` | Yes | Must be `"glb"` or `"gltf"` |
| `coordinateSystem` | Yes | Must contain valid `unit`, `forwardAxis`, `upAxis` |
| `dimensions` | Yes | `frameWidthMm` must be positive |
| `anchors` | Yes | `origin` and `noseBridge` must be Vector3 |
| `fitting` | Yes | `defaultScale` > 0; `defaultOffset` and `defaultRotation` must be Vector3 |
| `material` | No | If present, `lensOpacity` and `frameRoughness` must be in [0, 1] |
| `metadata` | No | Free-form |

---

## Coordinate System Requirements

The manifest declares the model's native coordinate system so the SDK can normalize it to the render-world convention (origin centre, y up, x scaled by aspect, 1.0 unit = frame height).

```json
"coordinateSystem": {
  "unit": "millimeter",
  "forwardAxis": "+z",
  "upAxis": "+y"
}
```

| Field | Allowed Values | Description |
|---|---|---|
| `unit` | `"millimeter"`, `"centimeter"`, `"meter"` | The physical unit of all dimension and anchor values |
| `forwardAxis` | `"+z"`, `"-z"` | The direction the glasses face (temple-to-temple is along x) |
| `upAxis` | `"+y"`, `"+z"` | The up direction of the model |

The renderer normalizes the model to millimetres on load. The `GlassesPoseSolver` then converts millimetres to render-world units via the calibration constant `MM_TO_RENDER_WORLD = 1/200`.

### Glasses-local coordinate system

The model's own space (`glasses-local`) uses:
- **Origin**: model origin (typically the nose bridge centre)
- **x**: right (temple-to-temple axis)
- **y**: up
- **z**: forward (away from the face, toward the viewer)

The `anchors.origin` should be at the model's geometric centre or nose bridge. The solver positions the model so that `anchors.origin` (adjusted by `fitting.defaultOffset`) lands on the face's vertical anchor point (noseBridge, eyeLine, or browLine).

---

## Unit Normalization

The SDK accepts models authored in millimetres, centimetres, or metres. Internally, everything is normalized to millimetres:

| Manifest `unit` | Factor to mm | Example |
|---|---|---|
| `"millimeter"` | 1 | 142 mm stays 142 mm |
| `"centimeter"` | 10 | 14.2 cm becomes 142 mm |
| `"meter"` | 1000 | 0.142 m becomes 142 mm |

The `GlassesPoseSolver.modelFrameWidthMm()` method applies this factor:

```ts
private modelFrameWidthMm(asset: GlassesAssetManifest): number {
  const unitFactor =
    asset.coordinateSystem.unit === "millimeter" ? 1
    : asset.coordinateSystem.unit === "centimeter" ? 10
    : 1000;
  return asset.dimensions.frameWidthMm * unitFactor;
}
```

The `ThreeJsRenderer` applies the same factor when loading the GLB:

```ts
const UNIT_TO_MM = { millimeter: 1, centimeter: 10, meter: 1000 };
root.scale.setScalar(UNIT_TO_MM[asset.coordinateSystem.unit]);
```

> **Important:** The `dimensions.*Mm` fields must be expressed **in the declared unit**, not necessarily in millimetres. The field names end in `Mm` for readability, but the values are in the manifest's declared unit. The factor is applied during normalization. (For clarity, the demo manifests all use `"millimeter"` and express values in actual millimetres.)

---

## Dimensions

Physical dimensions drive the scale-solving and size-recommendation logic.

```json
"dimensions": {
  "frameWidthMm": 142,
  "lensWidthMm": 58,
  "lensHeightMm": 50,
  "bridgeWidthMm": 14,
  "templeLengthMm": 140
}
```

| Field | Required | Typical Range | Description |
|---|---|---|---|
| `frameWidthMm` | Yes | 80-200 mm | Total horizontal frame width (hinge-to-hinge). The validator warns if outside 80-200 mm. |
| `lensWidthMm` | No | 0-80 mm | Width of a single lens. The validator warns if > 80 mm. |
| `lensHeightMm` | No | — | Height of a single lens. |
| `bridgeWidthMm` | No | — | Distance between the two lenses. |
| `templeLengthMm` | No | — | Length of the temple arm. |

### How `frameWidthMm` is used

The pose solver computes the glasses scale by matching the model's frame width to the face's outer-eye distance (or another chosen fit metric):

```
scale = (faceFitMetricRW) / (modelFrameWidthMm * MM_TO_RENDER_WORLD) * defaultScale * scaleMultiplier
```

If `frameWidthMm` is inaccurate, the glasses will be over- or under-sized on the face. Measure it precisely as the horizontal distance from the left hinge to the right hinge.

---

## Anchors

Anchor points define key geometric references in model-local coordinates. They are used by the renderer and can guide custom fitting logic.

```json
"anchors": {
  "origin": { "x": 0, "y": 0, "z": 0 },
  "noseBridge": { "x": 0, "y": 0, "z": 0 },
  "leftHinge": { "x": -71, "y": 0, "z": 0 },
  "rightHinge": { "x": 71, "y": 0, "z": 0 }
}
```

| Anchor | Required | Description |
|---|---|---|
| `origin` | Yes | The model origin. Should be at the nose bridge centre or geometric centre. |
| `noseBridge` | Yes | The nose bridge contact point. Used for vertical positioning. |
| `leftHinge` | No | Left temple hinge. Useful for verifying frame width. |
| `rightHinge` | No | Right temple hinge. Useful for verifying frame width. |
| `leftLensCenter` | No | Centre of the left lens. |
| `rightLensCenter` | No | Centre of the right lens. |

All anchor values are in the model's native unit (see `coordinateSystem.unit`).

---

## Fitting Configuration

The `fitting` block controls how the pose solver places and scales the glasses. These are the **per-model defaults** that the solver applies before any runtime `GlassesFittingConfig` overrides.

```json
"fitting": {
  "defaultScale": 1.0,
  "defaultOffset": { "x": 0, "y": 0.005, "z": 0.01 },
  "defaultRotation": { "x": 0, "y": 0, "z": 0 },
  "minScale": 0.6,
  "maxScale": 1.8
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `defaultScale` | Yes | — | Base scale multiplier. Typically 1.0. Applied before the solver's computed scale. |
| `defaultOffset` | Yes | — | Position offset in render-world units applied after the solver computes position. Use small values (e.g. 0.005) for fine-tuning. |
| `defaultRotation` | Yes | — | Rotation offset in radians applied after the solver computes rotation. |
| `minScale` | No | 0.1 | Minimum clamped scale. |
| `maxScale` | No | 5.0 | Maximum clamped scale. |

> **Note:** The manifest's `fitting` block may also include `fitBy`, `verticalAnchor`, and `depthStrategy` fields (as seen in the demo manifests). These are applied by the renderer/solver when present and not overridden by the runtime `GlassesFittingConfig`.

### How offsets are applied

The solver computes a base position from the face's vertical anchor, then adds both the manifest's `defaultOffset` and the runtime config's `positionOffset`:

```ts
finalPosition = solverPosition + asset.fitting.defaultOffset + config.positionOffset
```

Similarly for rotation:

```ts
finalRotation = solverRotation + asset.fitting.defaultRotation + config.rotationOffset
```

This lets manifest authors bake in per-model corrections (e.g. a model whose origin is slightly off-centre) while runtime config handles user adjustments.

---

## Material Properties

The optional `material` block declares rendering hints. The validator type-checks these if present.

```json
"material": {
  "lensOpacity": 0.45,
  "frameRoughness": 0.35,
  "supportsTransparency": true
}
```

| Field | Type | Range | Description |
|---|---|---|---|
| `lensOpacity` | number | [0, 1] | Lens transparency. 0 = fully transparent, 1 = opaque. |
| `frameRoughness` | number | [0, 1] | Frame material roughness (PBR). 0 = mirror-smooth, 1 = fully rough. |
| `supportsTransparency` | boolean | — | Whether the model's materials support alpha blending. |

The demo manifests also include free-form material fields (`frameColor`, `frameMaterial`, `frameMetalness`, `lensColor`) that are not validated by the SDK but can be used by custom renderers for PBR material setup.

---

## Metadata

Optional metadata for display, recommendation, and filtering:

```json
"metadata": {
  "brand": "VisuTry Demo",
  "shapeCategory": "aviator",
  "colors": ["#B87333", "#1a1a2e"],
  "tags": ["aviator", "metal", "classic", "unisex"]
}
```

| Field | Type | Description |
|---|---|---|
| `brand` | string | Brand name. Used by the recommender's brand preference scoring. |
| `shapeCategory` | `GlassesShape` | Frame shape category. Used by the recommender's shape-match table. |
| `colors` | string[] | Available color hex codes. Used by the recommender's color preference scoring. |
| `tags` | string[] | Free-form tags for filtering. |

### GlassesShape values

```ts
type GlassesShape =
  | "round"
  | "oval"
  | "rectangle"
  | "square"
  | "cat-eye"
  | "aviator"
  | "browline"
  | "rimless";
```

The recommender maps face shapes to recommended frame shapes:

| Face Shape | Recommended Frame Shapes |
|---|---|
| oval | rectangle, round, aviator, browline |
| round | rectangle, square, browline |
| square | round, oval, cat-eye |
| heart | rectangle, aviator, browline |
| diamond | oval, cat-eye, browline |
| oblong | round, oval |

---

## Model Preparation Guidelines

### 1. Origin placement

Place the model origin at the nose bridge centre. The `anchors.origin` should match the GLB's root node position. If the origin is elsewhere, use `fitting.defaultOffset` to compensate.

### 2. Orientation

- The model should face `+z` (forward, toward the viewer) with `+y` up.
- The temples should extend along the x-axis (left temple at `-x`, right temple at `+x`).
- If your modelling software exports with a different orientation, set `coordinateSystem.forwardAxis` and `coordinateSystem.upAxis` accordingly, or use `fitting.defaultRotation` to correct.

### 3. Scale

Author the model in real-world millimetres. A frame that is 142 mm wide should have vertices spanning 142 units along x. This ensures `dimensions.frameWidthMm` matches the actual geometry.

### 4. Geometry cleanup

- Remove unused vertices, hidden geometry, and NGons.
- Ensure the model is a single mesh or a small group of meshes (frame + lenses).
- Weld duplicate vertices.
- Keep the polygon count reasonable (under 20k triangles for smooth performance on mobile).

### 5. Materials

- Use PBR materials (Metallic-Roughness workflow).
- Separate the frame and lenses into distinct materials so transparency can be applied to lenses only.
- Bake textures; avoid large uncompressed textures (keep under 1024x1024 for mobile).

### 6. Centering

After authoring, verify the model is centred on the nose bridge. The `ThreeJsRenderer` applies the manifest's `defaultRotation` as the baseline; the per-frame pose multiplies on top via the group transform.

---

## GLB Requirements

The web renderer uses Three.js `GLTFLoader` to parse the model. GLB (binary glTF) is preferred for smaller file size.

### Format

- **GLB** (binary glTF 2.0) is the recommended format.
- **glTF** (with external .bin and textures) is supported but requires all assets to be accessible at the `modelUrl` base path.
- Set `format: "glb"` or `format: "gltf"` in the manifest to match.

### File size

- Keep GLB files under 2 MB for fast loading on mobile networks.
- Compress textures with KTX2/Basis if possible (GLTFLoader supports Draco and KTX2 extensions via plugins).

### Loading

The renderer loads the model asynchronously:

```ts
const gltf = await this.gltfLoader.loadAsync(asset.modelUrl);
```

On failure, it throws `GLASSES_LOAD_FAILED` and the SDK emits the `glassesLoadFailed` event.

### CORS

The `modelUrl` must be served with appropriate CORS headers if hosted on a different origin than the app. For self-hosted models, ensure `Access-Control-Allow-Origin` is set.

---

## Validation

The `ManifestValidator` checks the manifest at load time. Use it to fail fast on malformed assets.

### Programmatic validation

```ts
import { ManifestValidator } from "@visutry/tryon-core";

const validator = new ManifestValidator();
const result = validator.validate(manifest);

if (!result.valid) {
  for (const issue of result.issues) {
    console.error(`[${issue.severity}] ${issue.field}: ${issue.message}`);
  }
}

// Or throw on invalid:
validator.validateOrThrow(manifest); // throws if any error-severity issue exists
```

### Validation result

```ts
interface ManifestValidationResult {
  valid: boolean;       // true only if no error-severity issues
  issues: ManifestValidationIssue[];
}

interface ManifestValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}
```

### Validation rules

| Field | Rule | Severity |
|---|---|---|
| `id` | Must be a non-empty string | error |
| `name` | Must be a non-empty string | error |
| `modelUrl` | Must be a non-empty string | error |
| `format` | Must be `"glb"` or `"gltf"` | error |
| `coordinateSystem.unit` | Must be `millimeter`, `centimeter`, or `meter` | error |
| `coordinateSystem.forwardAxis` | Must be `"+z"` or `"-z"` | error |
| `coordinateSystem.upAxis` | Must be `"+y"` or `"+z"` | error |
| `dimensions.frameWidthMm` | Must be a positive number | error |
| `dimensions.frameWidthMm` | Should be in 80-200 mm range | warning |
| `dimensions.lensWidthMm` | Should be in (0, 80] | warning |
| `anchors.origin` | Must be a Vector3 | error |
| `anchors.noseBridge` | Must be a Vector3 | error |
| `fitting.defaultScale` | Must be a positive number | error |
| `fitting.defaultOffset` | Must be a Vector3 | error |
| `fitting.defaultRotation` | Must be a Vector3 | error |
| `fitting.minScale` / `maxScale` | `minScale` must be <= `maxScale` | error |
| `material.lensOpacity` | Must be in [0, 1] | error |
| `material.frameRoughness` | Must be in [0, 1] | error |

A manifest is `valid` only if it has zero error-severity issues. Warnings do not block loading but should be addressed.

---

## Complete Examples

### Example 1: Aviator (metal, with transparency)

```json
{
  "id": "aviator-classic",
  "name": "Classic Aviator",
  "brand": "VisuTry Demo",
  "modelUrl": "https://cdn.visutry.com/demo/glasses/aviator-classic.glb",
  "thumbnailUrl": "https://cdn.visutry.com/demo/glasses/aviator-classic.png",
  "format": "glb",
  "coordinateSystem": {
    "unit": "millimeter",
    "forwardAxis": "+z",
    "upAxis": "+y"
  },
  "dimensions": {
    "frameWidthMm": 142,
    "lensWidthMm": 58,
    "lensHeightMm": 50,
    "bridgeWidthMm": 14,
    "templeLengthMm": 140
  },
  "anchors": {
    "origin": { "x": 0, "y": 0, "z": 0 },
    "noseBridge": { "x": 0, "y": 0, "z": 0 },
    "leftHinge": { "x": -71, "y": 0, "z": 0 },
    "rightHinge": { "x": 71, "y": 0, "z": 0 }
  },
  "fitting": {
    "defaultScale": 1.0,
    "defaultOffset": { "x": 0, "y": 0.005, "z": 0.01 },
    "defaultRotation": { "x": 0, "y": 0, "z": 0 },
    "minScale": 0.6,
    "maxScale": 1.8,
    "fitBy": "eyeOuterDistance",
    "verticalAnchor": "noseBridge"
  },
  "material": {
    "frameColor": "#B87333",
    "frameMaterial": "metal",
    "frameRoughness": 0.35,
    "frameMetalness": 0.8,
    "lensColor": "#1a1a2e",
    "lensOpacity": 0.45,
    "supportsTransparency": true
  },
  "tags": ["aviator", "metal", "classic", "unisex"],
  "price": 299,
  "currency": "CNY"
}
```

### Example 2: Minimal valid manifest

```json
{
  "id": "simple-frame",
  "name": "Simple Frame",
  "modelUrl": "https://cdn.example.com/glasses/simple.glb",
  "format": "glb",
  "coordinateSystem": {
    "unit": "millimeter",
    "forwardAxis": "+z",
    "upAxis": "+y"
  },
  "dimensions": {
    "frameWidthMm": 135
  },
  "anchors": {
    "origin": { "x": 0, "y": 0, "z": 0 },
    "noseBridge": { "x": 0, "y": 0, "z": 0 }
  },
  "fitting": {
    "defaultScale": 1.0,
    "defaultOffset": { "x": 0, "y": 0, "z": 0 },
    "defaultRotation": { "x": 0, "y": 0, "z": 0 }
  }
}
```

### Example 3: Centimeter-unit model

```json
{
  "id": "cm-model",
  "name": "Centimeter Model",
  "modelUrl": "https://cdn.example.com/glasses/cm-model.glb",
  "format": "glb",
  "coordinateSystem": {
    "unit": "centimeter",
    "forwardAxis": "+z",
    "upAxis": "+y"
  },
  "dimensions": {
    "frameWidthMm": 14.0
  },
  "anchors": {
    "origin": { "x": 0, "y": 0, "z": 0 },
    "noseBridge": { "x": 0, "y": 0, "z": 0 }
  },
  "fitting": {
    "defaultScale": 1.0,
    "defaultOffset": { "x": 0, "y": 0, "z": 0 },
    "defaultRotation": { "x": 0, "y": 0, "z": 0 }
  }
}
```

In this example, `frameWidthMm` is 14.0 cm. The solver normalizes it: `14.0 * 10 = 140 mm`, which is a typical frame width. The validator will not warn because 140 mm is within the 80-200 mm range (after normalization).

### Demo assets

The SDK ships with 5 demo manifests in `@visutry/demo-assets/glasses/`:

| File | Shape | Frame Width |
|---|---|---|
| `aviator-classic.json` | aviator | 142 mm |
| `round-retro.json` | round | — |
| `square-modern.json` | square | — |
| `cateye-fashion.json` | cat-eye | — |
| `sport-wrap.json` | sport | — |

Use these as reference implementations and starting templates for your own models.
