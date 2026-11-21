#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  { directory: "core", name: "@visutry/tryon-core" },
  { directory: "recommender", name: "@visutry/recommender" },
];
const allowedNames = new Set(packages.map(({ name }) => name));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const activePnpm = process.env.npm_execpath?.includes("pnpm")
  ? process.env.npm_execpath
  : undefined;
const configuredPnpm = process.env.VISUTRY_PNPM || activePnpm || "pnpm";
const pnpmIsScript = /\.[cm]?js$/.test(configuredPnpm);
const pnpmCommand = pnpmIsScript ? process.execPath : configuredPnpm;
const pnpmPrefix = pnpmIsScript ? [configuredPnpm] : [];
const expectedPnpm = readJson(join(repoRoot, "package.json")).packageManager.split("@")[1];

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_PATH: "",
        NODE_OPTIONS: "",
        npm_config_ignore_scripts: "true",
      },
    }).trim();
  } catch (error) {
    throw new Error(
      `${command} ${args.join(" ")} failed.\n${error.stdout || ""}\n${error.stderr || error.message}`,
    );
  }
}

assert.equal(
  run(pnpmCommand, [...pnpmPrefix, "--version"], repoRoot),
  expectedPnpm,
  "Use the repository's pinned pnpm on PATH or set VISUTRY_PNPM.",
);

const temporary = mkdtempSync(join(tmpdir(), "visutry-consumer-"));
const consumer = join(temporary, "consumer");
mkdirSync(consumer);

try {
  const tarballs = [];
  const sourceVersions = new Map();
  for (const { directory, name } of packages) {
    const packageRoot = join(repoRoot, "packages", directory);
    assert(existsSync(join(packageRoot, "dist", "index.js")), "Run pnpm build first.");
    sourceVersions.set(name, readJson(join(packageRoot, "package.json")).version);
    const tarball = join(temporary, `${directory}.tgz`);
    run(pnpmCommand, [...pnpmPrefix, "pack", "--out", tarball], packageRoot);
    assert(existsSync(tarball), `Missing tarball: ${name}`);
    tarballs.push(tarball);
  }

  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "visutry-isolated-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
    }),
  );
  run(
    "npm",
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs],
    consumer,
  );

  const installedTree = JSON.parse(run("npm", ["ls", "--all", "--json"], consumer));
  const installedNames = new Set();
  function inspectTree(tree) {
    for (const [name, dependency] of Object.entries(tree.dependencies || {})) {
      assert(allowedNames.has(name), `Unexpected runtime dependency: ${name}`);
      installedNames.add(name);
      inspectTree(dependency);
    }
  }
  inspectTree(installedTree);
  assert.deepEqual([...installedNames].sort(), [...allowedNames].sort());

  const installedRoots = new Map();
  const manifests = new Map();
  for (const { name } of packages) {
    const installedRoot = join(consumer, "node_modules", name);
    assert(
      !lstatSync(installedRoot).isSymbolicLink(),
      "A workspace link is not a packaged consumer.",
    );
    assert(realpathSync(installedRoot).startsWith(realpathSync(consumer)));
    const manifest = readJson(join(installedRoot, "package.json"));
    assert.equal(manifest.version, sourceVersions.get(name));
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [dependency, version] of Object.entries(manifest[field] || {})) {
        assert(allowedNames.has(dependency), `Unexpected ${field}: ${dependency}`);
        assert(
          !/^(workspace:|link:|file:)/.test(version),
          "Published dependencies must use registry versions.",
        );
      }
    }
    installedRoots.set(name, installedRoot);
    manifests.set(name, manifest);
  }

  // Inspect emitted imports, including lazy imports that this example may not run.
  let inspectedModules = 0;
  function inspectModule(path, packageRoot) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.JS,
    );
    function checkSpecifier(specifier) {
      assert(ts.isStringLiteralLike(specifier), `Unverifiable computed module import in ${path}`);
      const name = specifier.text;
      if (name.startsWith(".")) {
        const destination = resolve(dirname(path), name);
        const offset = relative(packageRoot, destination);
        assert(
          !offset.startsWith("..") && !isAbsolute(offset),
          `Import escapes its package: ${name}`,
        );
        assert(existsSync(destination), `Missing packaged import: ${name}`);
      } else {
        const packageName = [...allowedNames].find(
          (candidate) => name === candidate || name.startsWith(`${candidate}/`),
        );
        assert(packageName, `Unexpected runtime import: ${name}`);
        const subpath = name === packageName ? "." : `.${name.slice(packageName.length)}`;
        assert(
          Object.hasOwn(manifests.get(packageName).exports, subpath),
          `Non-public import: ${name}`,
        );
      }
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        checkSpecifier(node.moduleSpecifier);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        assert(node.arguments.length === 1, `Unsupported module loading in ${path}`);
        checkSpecifier(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    inspectedModules++;
  }
  function walk(directory, packageRoot) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path, packageRoot);
      else if (entry.name.endsWith(".js")) inspectModule(path, packageRoot);
    }
  }
  for (const root of installedRoots.values()) walk(join(root, "dist"), root);

  copyFileSync(
    join(repoRoot, "examples", "shared-core", "example.ts"),
    join(consumer, "example.ts"),
  );
  const publicEntries = [];
  for (const [name, manifest] of manifests) {
    for (const entry of Object.keys(manifest.exports)) {
      publicEntries.push(`import ${JSON.stringify(entry === "." ? name : name + entry.slice(1))};`);
    }
  }
  writeFileSync(join(consumer, "declarations.ts"), publicEntries.join("\n"));
  const config = ts.parseJsonConfigFileContent(
    {
      compilerOptions: {
        target: "ES2020",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2020"],
        types: [],
        strict: true,
        skipLibCheck: false,
        noEmitOnError: true,
        outDir: "build",
      },
      include: ["example.ts", "declarations.ts"],
    },
    ts.sys,
    consumer,
  );
  const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => consumer,
      getNewLine: () => "\n",
    }),
  );
  for (const source of program.getSourceFiles()) {
    assert(
      !/lib\.dom|lib\.webworker|[/\\]@types[/\\]/.test(source.fileName),
      "Ambient platform types leaked into the consumer.",
    );
    if (!program.isSourceFileDefaultLibrary(source)) {
      assert(
        resolve(source.fileName).startsWith(consumer),
        `Type resolution escaped the isolated consumer: ${source.fileName}`,
      );
    }
  }
  assert.equal(program.emit().emitSkipped, false);

  writeFileSync(
    join(consumer, "run.mjs"),
    `
import assert from "node:assert/strict";
for (const name of ["window", "document", "navigator", "Blob", "HTMLCanvasElement", "HTMLVideoElement", "OffscreenCanvas", "ImageBitmap", "requestAnimationFrame"]) {
  assert(Reflect.deleteProperty(globalThis, name), "Could not remove browser global " + name);
}
const { runSharedCoreExample, syntheticFaceInput, ownInventory } = await import("./build/example.js");
const { FaceShapeScorer } = await import("@visutry/tryon-core");
const { Recommender } = await import("@visutry/recommender");
const { faceShape, ranked } = runSharedCoreExample();
assert.equal(faceShape.metrics.geometryValid, true);
assert.notEqual(faceShape.primary, "unknown");
assert.equal(ranked.length, 2);
assert(ranked.every((item) => item.faceShapeApplied && Number.isFinite(item.score)));
assert(ranked.every((item) => item.size.status === "unavailable" && !("faceWidthMm" in item.size)));
assert(ranked.every((item) => item.item.price <= 200));
const rejected = new FaceShapeScorer().score({ ...syntheticFaceInput, imageSize: undefined });
assert.equal(rejected.primary, "unknown");
assert.equal(rejected.confidence, 0);
assert(rejected.warnings.includes("INVALID_IMAGE_SIZE"));
const generic = new Recommender().recommend({ faceShape: rejected, inventory: ownInventory, preferences: { maxPrice: 200 } });
assert.equal(generic.length, 2);
assert(generic.every((item) => !item.faceShapeApplied && item.size.status === "unavailable"));
console.log(JSON.stringify({ syntheticContractExample: true, faceShape: faceShape.primary, rankedIds: ranked.map((item) => item.item.id), size: ranked[0].size, rejectedInput: rejected.primary }, null, 2));
`,
  );
  console.log(run(process.execPath, [join(consumer, "run.mjs")], consumer));
  console.log(
    `PASS: isolated tarball consumer; ES2020-only declarations (${publicEntries.length} public entries); ${inspectedModules} packaged JS modules; runtime dependencies: ${[...installedNames].join(", ")}.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
