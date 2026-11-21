#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 VisuTry

/**
 * Build the first-party SDK reference frame without a modelling application,
 * a network request, third-party meshes, textures, or build dependencies.
 *
 * The SDK's manifest explicitly declares millimetres. These numerical model
 * coordinates are therefore millimetres, not glTF's usual metre convention.
 * +Y is up, +Z faces the camera, and both temples extend towards -Z.
 *
 * This is original demonstration geometry. Its design dimensions are useful
 * for testing scale and pose; they are not a manufactured product's fit data.
 *
 * Run: node scripts/generate-reference-glasses.mjs [--check]
 * --check regenerates in memory and fails if any committed copy has drifted.
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const checkOnly = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check")) {
  throw new Error("Usage: node scripts/generate-reference-glasses.mjs [--check]");
}

const MODEL_ID = "reference-frame-v1";
const MODEL_FILE = `${MODEL_ID}.glb`;
const THUMBNAIL_FILE = `${MODEL_ID}.svg`;
const ROOT_URL = "/reference/v1";
const DESTINATIONS = [
  "packages/demo-assets/reference/v1",
  "examples/web-demo/public/reference/v1",
];
const DESIGN = Object.freeze({
  frameWidthMm: 140,
  lensWidthMm: 52,
  lensHeightMm: 36,
  bridgeWidthMm: 16,
  templeLengthMm: 140,
  lensCenterX: 34,
  lensCenterY: -2,
  hingeX: 68.2,
  hingeY: 5,
  hingeZ: -2.5,
});

const add = (a, b) => a.map((n, i) => n + b[i]);
const sub = (a, b) => a.map((n, i) => n - b[i]);
const mul = (a, scale) => a.map((n) => n * scale);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a) => Math.hypot(...a);
const unit = (a) => {
  const size = length(a);
  if (!(size > 1e-10)) throw new Error("Degenerate geometry vector");
  return mul(a, 1 / size);
};
const mix = (a, b, t) => add(mul(a, 1 - t), mul(b, t));
const pointObject = (point) => ({ x: point[0], y: point[1], z: point[2] });
const round = (n, places = 6) => Number(n.toFixed(places));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

class Mesh {
  constructor(name, material) {
    this.name = name;
    this.material = material;
    this.positions = [];
    this.normals = [];
  }

  triangle(a, b, c, outward) {
    let normal = cross(sub(b, a), sub(c, a));
    if (length(normal) < 1e-8) throw new Error(`${this.name}: degenerate triangle`);
    if (dot(normal, outward) < 0) {
      [b, c] = [c, b];
      normal = mul(normal, -1);
    }
    normal = unit(normal);
    this.positions.push(...a, ...b, ...c);
    this.normals.push(...normal, ...normal, ...normal);
  }

  quad(a, b, c, d, outward) {
    this.triangle(a, b, c, outward);
    this.triangle(a, c, d, outward);
  }
}

// Counterclockwise rounded-rectangle boundary viewed from +Z. Each corner has
// the same sample count, so different outlines can be joined without seams.
function roundedRectangle(width, height, radius, cx, cy, z, cornerSteps = 12) {
  const points = [];
  const corners = [
    [cx + width / 2 - radius, cy + height / 2 - radius],
    [cx - width / 2 + radius, cy + height / 2 - radius],
    [cx - width / 2 + radius, cy - height / 2 + radius],
    [cx + width / 2 - radius, cy - height / 2 + radius],
  ];
  for (let corner = 0; corner < 4; corner++) {
    for (let step = 0; step <= cornerSteps; step++) {
      const angle = (corner + step / cornerSteps) * Math.PI / 2;
      points.push([
        corners[corner][0] + radius * Math.cos(angle),
        corners[corner][1] + radius * Math.sin(angle),
        z,
      ]);
    }
  }
  return points;
}

function frameRim(name, cx) {
  const mesh = new Mesh(name, 0);
  const sections = [
    [56.8, 40.8, 10.4, -2.5],
    [58, 42, 11, -1.7],
    [58, 42, 11, 1.7],
    [56.8, 40.8, 10.4, 2.5],
    [53.2, 37.2, 9.6, 2.5],
    [52, 36, 9, 1.7],
    [52, 36, 9, -1.7],
    [53.2, 37.2, 9.6, -2.5],
  ].map(([w, h, r, z]) => roundedRectangle(w, h, r, cx, DESIGN.lensCenterY, z));
  const directions = [[1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  for (let section = 0; section < sections.length; section++) {
    const nextSection = (section + 1) % sections.length;
    for (let i = 0; i < sections[section].length; i++) {
      const next = (i + 1) % sections[section].length;
      const tangent = sub(sections[section][next], sections[section][i]);
      const outwardXY = unit([tangent[1], -tangent[0], 0]);
      const [radial, axial] = directions[section];
      mesh.quad(
        sections[section][i], sections[section][next],
        sections[nextSection][next], sections[nextSection][i],
        [outwardXY[0] * radial, outwardXY[1] * radial, axial],
      );
    }
  }
  return mesh;
}

function lens(name, cx) {
  const mesh = new Mesh(name, 1);
  const front = roundedRectangle(52, 36, 9, cx, DESIGN.lensCenterY, 0.8);
  const back = roundedRectangle(52, 36, 9, cx, DESIGN.lensCenterY, 0.2);
  for (let i = 0; i < front.length; i++) {
    const next = (i + 1) % front.length;
    mesh.triangle([cx, DESIGN.lensCenterY, 0.8], front[i], front[next], [0, 0, 1]);
    mesh.triangle([cx, DESIGN.lensCenterY, 0.2], back[i], back[next], [0, 0, -1]);
    const tangent = sub(front[next], front[i]);
    mesh.quad(front[i], front[next], back[next], back[i], [tangent[1], -tangent[0], 0]);
  }
  return mesh;
}

function tube(name, points, radius, material = 0, sides = 12) {
  const mesh = new Mesh(name, material);
  const tangents = points.map((point, i) => unit(sub(
    points[Math.min(i + 1, points.length - 1)],
    points[Math.max(i - 1, 0)],
  )));
  const rings = points.map((point, i) => {
    const reference = Math.abs(tangents[i][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const right = unit(cross(tangents[i], reference));
    const up = unit(cross(tangents[i], right));
    return Array.from({ length: sides }, (_, side) => {
      const angle = side * 2 * Math.PI / sides;
      return add(point, add(mul(right, radius * Math.cos(angle)), mul(up, radius * Math.sin(angle))));
    });
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      const outward = sub(mix(rings[i][side], rings[i][next], 0.5), points[i]);
      mesh.quad(rings[i][side], rings[i][next], rings[i + 1][next], rings[i + 1][side], outward);
    }
  }
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    mesh.triangle(points[0], rings[0][side], rings[0][next], mul(tangents[0], -1));
    const last = points.length - 1;
    mesh.triangle(points[last], rings[last][side], rings[last][next], tangents[last]);
  }
  return mesh;
}

function box(name, center, dimensions) {
  const mesh = new Mesh(name, 2);
  const p = (x, y, z) => [
    center[0] + x * dimensions[0] / 2,
    center[1] + y * dimensions[1] / 2,
    center[2] + z * dimensions[2] / 2,
  ];
  const faces = [
    [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1], [1, 0, 0]],
    [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1], [-1, 0, 0]],
    [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], [0, 1, 0]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]],
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [0, 0, -1]],
  ];
  for (const [a, b, c, d, normal] of faces) mesh.quad(p(...a), p(...b), p(...c), p(...d), normal);
  return mesh;
}

const centerlineLength = (points) => points.slice(1).reduce((sum, point, i) => sum + length(sub(point, points[i])), 0);

function templePoints(side) {
  const controls = [
    [68.2, 5, -2.5], [68.2, 5, -18], [67, 4.5, -80],
    [65, 3, -108], [62, -3, -124], [60, -14, -136],
  ];
  // Solve the Z stretch so the documented hinge-to-tip centreline is 140 mm.
  // The X/Y design stays fixed and neither temple extends beyond ±70 mm.
  let low = 0.8;
  let high = 1.2;
  const stretch = (scale) => controls.map(([x, y, z]) => [side * x, y, DESIGN.hingeZ + (z - DESIGN.hingeZ) * scale]);
  for (let iteration = 0; iteration < 64; iteration++) {
    const middle = (low + high) / 2;
    if (centerlineLength(stretch(middle)) < DESIGN.templeLengthMm) low = middle;
    else high = middle;
  }
  const points = stretch((low + high) / 2);
  const dense = [points[0]];
  for (let i = 1; i < points.length; i++) {
    for (let step = 1; step <= 6; step++) dense.push(mix(points[i - 1], points[i], step / 6));
  }
  return dense;
}

const leftTemple = templePoints(-1);
const rightTemple = templePoints(1);
const bridgePoints = Array.from({ length: 21 }, (_, i) => {
  const t = i / 20;
  return [-8.5 + 17 * t, -2.5 + 10 * t * (1 - t), 0];
});
const meshes = [
  frameRim("frame_left_rim", -DESIGN.lensCenterX),
  frameRim("frame_right_rim", DESIGN.lensCenterX),
  tube("frame_nose_bridge", bridgePoints, 1.65),
  box("frame_left_hinge", [-66, DESIGN.hingeY, -0.5], [8, 5, 5]),
  box("frame_right_hinge", [66, DESIGN.hingeY, -0.5], [8, 5, 5]),
  tube("frame_left_temple", leftTemple, 1.8),
  tube("frame_right_temple", rightTemple, 1.8),
  lens("lens_left", -DESIGN.lensCenterX),
  lens("lens_right", DESIGN.lensCenterX),
];
const anchors = {
  origin: [0, 0, 0],
  noseBridge: [0, 0, 0],
  leftHinge: [-DESIGN.hingeX, DESIGN.hingeY, DESIGN.hingeZ],
  rightHinge: [DESIGN.hingeX, DESIGN.hingeY, DESIGN.hingeZ],
  leftLensCenter: [-DESIGN.lensCenterX, DESIGN.lensCenterY, 0.5],
  rightLensCenter: [DESIGN.lensCenterX, DESIGN.lensCenterY, 0.5],
};

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) throw new Error("Non-finite geometry coordinate");
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  return { min, max };
}

const modelBounds = bounds(meshes.flatMap((mesh) => mesh.positions));
const triangles = meshes.reduce((count, mesh) => count + mesh.positions.length / 9, 0);
if (Math.abs(modelBounds.max[0] - modelBounds.min[0] - DESIGN.frameWidthMm) > 1e-6) {
  throw new Error("Model width differs from its manifest");
}
if (triangles > 12000) throw new Error("Reference frame exceeded its triangle budget");
for (const points of [leftTemple, rightTemple]) {
  if (Math.abs(centerlineLength(points) - DESIGN.templeLengthMm) > 1e-6) throw new Error("Temple length differs from its manifest");
}

function makeGlb() {
  const doc = {
    asset: {
      version: "2.0",
      generator: "VisuTry original reference-frame generator v1",
      copyright: "Copyright (c) 2026 VisuTry. MIT License.",
      extras: { demoOnly: true, physicalProduct: false, unit: "millimeter", forwardAxis: "+z", upAxis: "+y" },
    },
    scene: 0,
    scenes: [{ name: MODEL_ID, nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [
      { name: "frame_navy_acetate", pbrMetallicRoughness: { baseColorFactor: [0.027, 0.064, 0.11, 1], metallicFactor: 0.08, roughnessFactor: 0.32 } },
      { name: "lens_clear", pbrMetallicRoughness: { baseColorFactor: [0.72, 0.84, 0.9, 0.07], metallicFactor: 0, roughnessFactor: 0.1 }, alphaMode: "BLEND", doubleSided: true },
      { name: "frame_hinge_metal", pbrMetallicRoughness: { baseColorFactor: [0.32, 0.4, 0.47, 1], metallicFactor: 0.75, roughnessFactor: 0.27 } },
    ],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
    extras: { anchors: Object.fromEntries(Object.entries(anchors).map(([key, value]) => [key, pointObject(value)])), designDimensions: DESIGN },
  };
  const buffers = [];
  let byteOffset = 0;
  function accessor(values, position = false) {
    const floats = new Float32Array(values);
    const bytes = Buffer.from(floats.buffer);
    const view = doc.bufferViews.length;
    doc.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target: 34962 });
    buffers.push(bytes);
    byteOffset += bytes.length;
    const index = doc.accessors.length;
    doc.accessors.push({ bufferView: view, componentType: 5126, count: values.length / 3, type: "VEC3", ...(position ? bounds(floats) : {}) });
    return index;
  }
  for (const mesh of meshes) {
    const meshIndex = doc.meshes.length;
    doc.meshes.push({ name: mesh.name, primitives: [{ attributes: { POSITION: accessor(mesh.positions, true), NORMAL: accessor(mesh.normals) }, material: mesh.material, mode: 4 }] });
    doc.scenes[0].nodes.push(doc.nodes.length);
    doc.nodes.push({ name: mesh.name, mesh: meshIndex });
  }
  for (const [name, position] of Object.entries(anchors)) {
    doc.scenes[0].nodes.push(doc.nodes.length);
    doc.nodes.push({ name: `anchor_${name}`, translation: position });
  }
  doc.buffers[0].byteLength = byteOffset;
  const jsonBytes = Buffer.from(JSON.stringify(doc));
  const jsonPadding = (4 - jsonBytes.length % 4) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);
  const binaryChunk = Buffer.concat(buffers);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
  const header = Buffer.alloc(20);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, binaryHeader, binaryChunk]);
}

function svgPath(points) {
  return `${points.map((p, i) => `${i ? "L" : "M"}${round(p[0], 3)},${round(p[1], 3)}`).join(" ")} Z`;
}

function makeThumbnail() {
  const rims = [-34, 34].map((cx) => {
    const outer = svgPath(roundedRectangle(58, 42, 11, cx, -2, 0));
    const inner = svgPath(roundedRectangle(52, 36, 9, cx, -2, 0));
    return `    <path d="${inner}" fill="#b8d6e6" fill-opacity="0.19"/>\n    <path d="${outer} ${inner}" fill="#2e4760" fill-rule="evenodd"/>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600" role="img" aria-labelledby="title description">\n  <title id="title">Reference Frame v1</title>\n  <desc id="description">Original rounded rectangular eyewear for technical AR demonstrations. Design width 140 millimetres. Not a real product.</desc>\n  <rect width="960" height="600" rx="40" fill="#f4f7fa"/>\n  <g transform="translate(480 270) scale(5 -5)">\n${rims}\n    <path d="M-8.5,-2.5 Q0,2.5 8.5,-2.5" fill="none" stroke="#2e4760" stroke-width="3.3" stroke-linecap="round"/>\n    <path d="M-63,5 H-70 M63,5 H70" stroke="#687b8d" stroke-width="5"/>\n  </g>\n  <text x="480" y="470" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" fill="#283f55">REFERENCE FRAME V1</text>\n  <text x="480" y="510" text-anchor="middle" font-family="system-ui,sans-serif" font-size="17" letter-spacing="1.5" fill="#62778b">ORIGINAL TECHNICAL DEMO</text>\n</svg>\n`;
}

const glb = makeGlb();
const thumbnail = makeThumbnail();
const modelHash = sha256(glb);
const manifest = {
  id: MODEL_ID,
  name: "Reference Frame v1",
  modelUrl: `${ROOT_URL}/${MODEL_FILE}`,
  thumbnailUrl: `${ROOT_URL}/${THUMBNAIL_FILE}`,
  format: "glb",
  coordinateSystem: { unit: "millimeter", forwardAxis: "+z", upAxis: "+y" },
  dimensions: Object.fromEntries(Object.entries(DESIGN).filter(([key]) => key.endsWith("Mm"))),
  anchors: Object.fromEntries(Object.entries(anchors).map(([key, point]) => [key, pointObject(point)])),
  fitting: {
    defaultScale: 1,
    defaultOffset: { x: 0, y: 0, z: 0.008 },
    defaultRotation: { x: 0, y: 0, z: 0 },
    minScale: 0.6,
    maxScale: 1.8,
    fitBy: "eyeOuterDistance",
    verticalAnchor: "noseBridge",
  },
  material: { frameColor: "#2E4760", frameMaterial: "technical-demo acetate appearance", frameRoughness: 0.32, frameMetalness: 0.08, lensColor: "#DDECF3", lensOpacity: 0.07, supportsTransparency: true },
  metadata: { shapeCategory: "rectangle", colors: ["#2E4760"], tags: ["reference", "original", "demo-only", "not-a-real-product"] },
  demoOnly: true,
  physicalProduct: false,
  integrity: { algorithm: "sha256", digest: modelHash, bytes: glb.length },
};

const license = readFileSync(resolve(root, "LICENSE"), "utf8");
const provenance = `# Reference Frame v1 — asset provenance\n\n` +
  `This original reference frame is generated entirely by \`scripts/generate-reference-glasses.mjs\` in this repository. It uses no downloaded mesh, texture, photograph, brand design, or real SKU.\n\n` +
  `- Author / attribution: VisuTry, 2026.\n` +
  `- License: MIT, matching the repository; see the adjacent \`LICENSE\`.\n` +
  `- Purpose: development, regression testing and clearly labelled AR demonstrations.\n` +
  `- \`demoOnly: true\`; no physical product, purchase price, inventory or manufacturer relationship.\n` +
  `- Dimensions are original technical design parameters, not measured product specifications or a guarantee of wearable fit.\n` +
  `- No optical prescription, refraction simulation or manufacturing validation is claimed.\n\n` +
  `## Coordinate and geometry contract\n\n` +
  `The SDK manifest declares **millimetres**, **+Y up**, **+Z forward**. The model's numeric vertex coordinates are in millimetres; generic glTF consumers normally assume metres and must apply the declared unit conversion when importing it outside this SDK. The nose-bridge centreline and model origin are both \`(0, 0, 0)\`. Both temples extend behind the front towards **-Z**. Left/right node labels denote the model's negative/positive X sides.\n\n` +
  `| Design measure | Value | Definition |\n| --- | ---: | --- |\n` +
  `| Frame width | 140 mm | Maximum X extent including the two hinge blocks |\n` +
  `| Lens width | 52 mm | Each transparent lens contour's X extent |\n` +
  `| Lens height | 36 mm | Each transparent lens contour's Y extent |\n` +
  `| Bridge width | 16 mm | Minimum horizontal gap between the two lens contours |\n` +
  `| Temple length | 140 mm | Each hinge-to-tip polyline centreline, not a straight Z projection |\n` +
  `| Lens-centre spacing | 68 mm | Synthetic design parameter; not a user's PD |\n\n` +
  `The closed frame has bevelled rims, a curved bridge, two metallic hinge blocks, two full temples with downturned tips, and two thin transparent lenses. Material names distinguish \`frame_navy_acetate\`, \`frame_hinge_metal\` and \`lens_clear\`. There are ${meshes.length} mesh primitives and **${triangles.toLocaleString("en-US")} triangles**; no texture, external buffer, compression decoder or glTF extension is required. Geometry is explicitly triangulated with finite positions, outward normals and no zero-area triangles.\n\n` +
  `Overall bounds in millimetres: minimum \`${JSON.stringify(modelBounds.min.map((n) => round(n)))}\`, maximum \`${JSON.stringify(modelBounds.max.map((n) => round(n)))}\`. The manifest anchors are also embedded as named empty glTF nodes for inspection.\n\n` +
  `## Reproducibility and integrity\n\n` +
  `Run \`node scripts/generate-reference-glasses.mjs\` from any directory to regenerate the canonical package assets and matching demo-public copies. Run \`node scripts/generate-reference-glasses.mjs --check\` to compare every generated byte without writing. The script has no dependencies and performs no network access.\n\n` +
  `| File | SHA-256 | Bytes |\n| --- | --- | ---: |\n` +
  `| \`${MODEL_FILE}\` | \`${modelHash}\` | ${glb.length} |\n` +
  `| \`${THUMBNAIL_FILE}\` | \`${sha256(thumbnail)}\` | ${Buffer.byteLength(thumbnail)} |\n` +
  `| Generator source | \`${sha256(readFileSync(scriptPath))}\` | ${readFileSync(scriptPath).length} |\n\n` +
  `Canonical source artifacts live in \`packages/demo-assets/reference/v1/\`. The identical files in \`examples/web-demo/public/reference/v1/\` serve the development/preview demo from the same origin. The model URL is \`${ROOT_URL}/${MODEL_FILE}\`; relative URLs do not assert that any production CDN has been provisioned.\n\n` +
  `The five legacy remote demo entries remain separate. This original reference model does not establish their existence or restore their former URLs. Passing a binary/loader check does not establish live camera tracking quality, physical fit accuracy or target-device performance. Those require separate acceptance evidence.\n`;

const outputs = new Map([
  [MODEL_FILE, glb],
  ["manifest.json", Buffer.from(json(manifest))],
  [THUMBNAIL_FILE, Buffer.from(thumbnail)],
  ["LICENSE", Buffer.from(license)],
  ["PROVENANCE.md", Buffer.from(provenance)],
]);
for (const destination of DESTINATIONS) {
  for (const [name, bytes] of outputs) {
    const path = resolve(root, destination, name);
    if (checkOnly) {
      let existing;
      try { existing = readFileSync(path); } catch { throw new Error(`Missing generated file: ${destination}/${name}`); }
      if (!existing.equals(bytes)) throw new Error(`Generated file drift: ${destination}/${name}`);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
  }
}
console.log(json({ status: checkOnly ? "verified" : "generated", id: MODEL_ID, sha256: modelHash, bytes: glb.length, triangles, boundsMm: modelBounds, templeLengthMm: round(centerlineLength(leftTemple)), destinations: DESTINATIONS }));
