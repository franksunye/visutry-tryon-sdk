import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [archive, expectedName, expectedVersion] = process.argv.slice(2);
assert(archive && expectedName && expectedVersion, "Archive, package name and version are required");
const manifest = JSON.parse(execFileSync("tar", ["-xOf", archive, "package/package.json"], { encoding: "utf8" }));
assert.equal(manifest.name, expectedName);
assert.equal(manifest.version, expectedVersion);
for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
  for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
    assert(!/^(workspace|file|link):/.test(specifier), `${name} has an unpublished dependency: ${specifier}`);
  }
}
if (expectedName !== "@visutry/tryon-core") {
  const core = JSON.parse(readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies[core.name], core.version, "Internal core dependency must pin the packed version");
}
const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
assert(entries.includes("package/dist/index.js"), "Missing runtime entry");
assert(entries.includes("package/dist/index.d.ts"), "Missing declaration entry");
assert(!entries.some((entry) => /(?:\.test\.|__fixtures__|__testutils__)/.test(entry)), "Test-only content entered a package");
console.log(`Validated ${manifest.name}@${manifest.version}: registry dependencies and build entries`);
