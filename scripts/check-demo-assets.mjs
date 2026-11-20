/**
 * R1 read-only preflight for the five demo GLB manifests.
 *
 * Validates the URL actually returns a GLB v2 header and is CORS-readable
 * from the local H5 demo. Exits non-zero on any blocker; no fallback models,
 * data mutation, uploads, or paid APIs are involved.
 */
import { readFile, readdir } from "node:fs/promises";

const manifestDir = new URL("../packages/demo-assets/glasses/", import.meta.url);
const demoOrigin = "http://localhost:5173";

async function inspectGlb(url) {
  const candidate = new URL(url);
  if (candidate.protocol !== "https:") {
    throw new Error("Model URL is not HTTPS");
  }
  const response = await fetch(candidate, {
    method: "GET",
    headers: {
      Origin: demoOrigin,
      Range: "bytes=0-15",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from model URL`);
  }

  const cors = response.headers.get("access-control-allow-origin");
  if (cors !== "*" && cors !== demoOrigin) {
    // A successful Node fetch alone does not prove browser GLTFLoader can
    // read this cross-origin model.
    throw new Error(`Missing CORS for ${demoOrigin} (ACAO=${cors ?? "absent"})`);
  }

  if (!response.body) throw new Error("Empty response body");

  const reader = response.body.getReader();
  const bytes = [];
  try {
    while (bytes.length < 12) {
      const { value, done } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length && bytes.length < 12; i++) bytes.push(value[i]);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (bytes.length < 12) throw new Error("GLB header shorter than 12 bytes");
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "glTF") {
    throw new Error("Invalid GLB magic; URL does not serve a binary glTF");
  }
  const version = new DataView(Uint8Array.from(bytes).buffer).getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);

  return { http: response.status, cors };
}

const files = (await readdir(manifestDir)).filter((name) => name.endsWith(".json")).sort();
if (files.length !== 5) {
  console.error(`FAIL: expected five demo manifests, found ${files.length}`);
  process.exitCode = 1;
}

let failures = 0;
for (const file of files) {
  const manifest = JSON.parse(await readFile(new URL(file, manifestDir), "utf8"));
  try {
    if (manifest.format !== "glb" || typeof manifest.modelUrl !== "string") {
      throw new Error("Manifest must specify a GLB model URL");
    }
    const result = await inspectGlb(manifest.modelUrl);
    console.log(`PASS ${file}: GLB v2, HTTP ${result.http}, CORS ${result.cors}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${file}: ${manifest.modelUrl ?? "no URL"} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`R1 Demo GLB asset preflight: ${files.length - failures}/${files.length} verified`);
if (failures) {
  process.exitCode = 1;
}
