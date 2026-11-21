import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep JavaScript, WASM and the pinned model together; no runtime CDN dependency.
const VERSION = "0.10.35";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "examples/web-demo/public/mediapipe", VERSION);
const require = createRequire(resolve(root, "examples/web-demo/package.json"));
const source = dirname(require.resolve("@mediapipe/tasks-vision"));
const pkg = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
if (pkg.version !== VERSION) throw new Error(`Expected MediaPipe ${VERSION}, got ${pkg.version}`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = {};
await mkdir(resolve(output, "wasm"), { recursive: true });
await mkdir(resolve(output, "models"), { recursive: true });
for (const name of (await readdir(resolve(source, "wasm"))).sort()) {
  if (!/\.(?:wasm|js)$/.test(name)) continue;
  const bytes = await readFile(resolve(source, "wasm", name));
  await copyFile(resolve(source, "wasm", name), resolve(output, "wasm", name));
  files[`wasm/${name}`] = { bytes: bytes.length, sha256: sha256(bytes) };
}
const modelPath = resolve(output, "models/face_landmarker.task");
let model = await readFile(modelPath).catch(() => null);
if (!model || sha256(model) !== MODEL_SHA256) {
  const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  model = Buffer.from(await response.arrayBuffer());
  if (sha256(model) !== MODEL_SHA256)
    throw new Error("Model SHA-256 mismatch; refusing to publish");
  await writeFile(`${modelPath}.tmp`, model);
  await rename(`${modelPath}.tmp`, modelPath);
}
files["models/face_landmarker.task"] = {
  bytes: model.length,
  sha256: MODEL_SHA256,
  source: MODEL_URL,
};
await copyFile(
  resolve(root, "scripts/licenses/mediapipe-APACHE-2.0.txt"),
  resolve(output, "LICENSE"),
);
await writeFile(
  resolve(output, "NOTICE.md"),
  `# MediaPipe runtime\n\n@mediapipe/tasks-vision ${VERSION}, Copyright Google LLC, Apache-2.0.\nJavaScript and WASM files are copied unmodified from the exact npm package.\n\nFace Landmarker float16 version 1 is copied unmodified from:\n${MODEL_URL}\n\nSHA-256: ${MODEL_SHA256}\n\nThe bundle contains BlazeFace Short Range, Face Mesh V2 and Blendshape V2 models,\nwhose Google model cards specify Apache-2.0. See the accompanying LICENSE.\nSource/model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker\n`,
);
await writeFile(
  resolve(output, "runtime-manifest.json"),
  `${JSON.stringify({ version: VERSION, license: "Apache-2.0", files }, null, 2)}\n`,
);
console.log(`Prepared MediaPipe ${VERSION}: ${Object.keys(files).length} verified runtime files`);
