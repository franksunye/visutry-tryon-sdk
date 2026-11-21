import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Public-domain NASA/scikit-image fixture, strictly outside production assets.
const source =
  "https://raw.githubusercontent.com/scikit-image/scikit-image/v0.26.0/src/skimage/data/astronaut.png";
const expected = "88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5";
const path = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../examples/web-demo/e2e/fixtures/astronaut.png",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
let bytes = await readFile(path).catch(() => null);
if (!bytes || digest(bytes) !== expected) {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Test fixture download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== expected) throw new Error("Test fixture SHA-256 mismatch");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
console.log(`Verified test-only camera fixture: ${expected}`);
