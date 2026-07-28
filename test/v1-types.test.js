import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectRuntimeDependencies,
  stableRuntimeArtifacts,
  stableRuntimeCanonicalSources
} from "../scripts/lib/artifact-files.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const packageManifest = readJson("package.json");
const lockfile = readJson("package-lock.json");
const typeConfig = readJson("tsconfig.json");
const expectedIncludes = [
  "bin/kanon.js",
  "bin/kanon-write.js",
  "src/analyze.js",
  "src/analyze/**/*.js",
  "src/ask.js",
  "src/ask/**/*.js",
  "src/cli.js",
  "src/cli/**/*.js",
  "src/code-intel.js",
  "src/code-intel/**/*.js",
  "src/config.js",
  "src/continuity/**/*.js",
  "src/evidence.js",
  "src/git-runner.js",
  "src/git.js",
  "src/path-security.js",
  "src/persist.js",
  "src/persistence/**/*.js",
  "src/readme.js",
  "src/render.js",
  "src/render/ask.js",
  "src/render/brief.js",
  "src/render/continuity.js",
  "src/render/shared.js",
  "src/scanner.js",
  "src/scanner/**/*.js",
  "src/trust.js",
  "src/verify.js",
  "src/verify/**/*.js",
  "src/version.js",
  "src/v1/**/*.js"
];

test("checked-JS tooling is pinned and development-only", () => {
  assert.deepEqual(packageManifest.devDependencies, {
    "@types/node": "20.19.43",
    typescript: "7.0.2"
  });
  assert.deepEqual(
    lockfile.packages[""].devDependencies,
    packageManifest.devDependencies
  );
  assert.equal(
    lockfile.packages["node_modules/@types/node"].dev,
    true
  );
  assert.equal(
    lockfile.packages["node_modules/typescript"].dev,
    true
  );
  assert.equal(packageManifest.dependencies, undefined);
  assert.match(
    packageManifest.scripts.validate,
    /npm run check:skill && npm run typecheck && node --test/
  );
});

test("strict no-emit checked-JS options are non-decorative", () => {
  const options = typeConfig.compilerOptions;
  for (const option of [
    "allowJs",
    "checkJs",
    "exactOptionalPropertyTypes",
    "forceConsistentCasingInFileNames",
    "noEmit",
    "noFallthroughCasesInSwitch",
    "noImplicitReturns",
    "noUncheckedIndexedAccess",
    "strict",
    "strictNullChecks",
    "useUnknownInCatchVariables"
  ]) {
    assert.equal(options[option], true, `${option} must remain enabled`);
  }
  assert.deepEqual(typeConfig.include, expectedIncludes);
  assert.equal(typeConfig.exclude, undefined);
  assert.equal(options.skipLibCheck, undefined);
});

test("every shipped stable runtime module has one checked canonical source", () => {
  const mappings = stableRuntimeArtifacts(repoRoot);
  const sources = stableRuntimeCanonicalSources(repoRoot);
  const targets = mappings.map(([, target]) => target).sort();
  assert.equal(mappings.length, 81);
  assert.equal(sources.length, 81);
  assert.equal(new Set(targets).size, 81);
  assert.deepEqual(
    targets,
    listJavaScriptFiles(path.join(repoRoot, "runtime"))
  );

  const execution = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      path.join(repoRoot, "tsconfig.json"),
      "--pretty",
      "false",
      "--listFilesOnly"
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024
    }
  );
  assert.equal(execution.status, 0, execution.stderr);
  const checked = new Set(
    execution.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => path.resolve(file))
  );
  for (const [sourceRelative, targetRelative] of mappings) {
    const sourcePath = path.join(repoRoot, sourceRelative);
    const targetPath = path.join(repoRoot, targetRelative);
    assert.equal(
      checked.has(sourcePath),
      true,
      `${sourceRelative} must be strictly checked`
    );
    assert.deepEqual(
      fs.readFileSync(targetPath),
      fs.readFileSync(sourcePath),
      `${targetRelative} must be a byte-equivalent generated mirror`
    );
    assertNoUncheckedTypeEscapes(
      sourceRelative,
      fs.readFileSync(sourcePath, "utf8")
    );
  }
  assert.equal(
    Array.from(checked).some((file) =>
      file.includes(`${path.sep}runtime${path.sep}`)
    ),
    false
  );
});

test("typed compatibility routes retain the approved public surface", () => {
  const metadata = readJson("runtime/build-metadata.json");
  assert.deepEqual(metadata.public_capabilities.skills, [
    "kanon",
    "orient",
    "resume",
    "status",
    "verify",
    "steer",
    "aswitch"
  ]);
  for (const skill of [
    "orient",
    "resume",
    "status",
    "verify",
    "steer",
    "aswitch"
  ]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "skills", skill, "SKILL.md")),
      true
    );
  }
});

test("shipped compatibility closure contains only explicit write consumers", () => {
  const closure = new Set([
    "bin/kanon-write.js",
    ...collectRuntimeDependencies(repoRoot)
  ]);
  assert.equal(closure.size, 54);
  if (process.platform !== "win32") {
    assert.notEqual(
      fs.statSync(path.join(repoRoot, "bin", "kanon-write.js")).mode & 0o111,
      0,
      "the canonical write bin must remain executable"
    );
  }
  for (const required of [
    "bin/kanon-write.js",
    "src/analyze.js",
    "src/cli/write.js",
    "src/cli/todo.js",
    "src/persist.js"
  ]) {
    assert.equal(closure.has(required), true, required);
  }
  for (const removed of [
    "bin/kanon.js",
    "src/ask.js",
    "src/ask/intent.js",
    "src/cli.js",
    "src/cli/index.js",
    "src/render.js",
    "src/render/ask.js"
  ]) {
    assert.equal(closure.has(removed), false, removed);
  }
});

test("release allowlist excludes type tooling and development metadata", () => {
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-types-package-")
  );
  const execution = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "build-package.js"),
      "--output",
      output
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000
    }
  );
  assert.equal(execution.status, 0, execution.stderr);
  const publicManifest = JSON.parse(
    fs.readFileSync(path.join(output, "package.json"), "utf8")
  );
  assert.equal(publicManifest.dependencies, undefined);
  assert.equal(publicManifest.devDependencies, undefined);
  assert.equal(fs.existsSync(path.join(output, "tsconfig.json")), false);
  assert.equal(fs.existsSync(path.join(output, "package-lock.json")), false);
  assert.equal(fs.existsSync(path.join(output, "node_modules")), false);
});

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));
}

function assertNoUncheckedTypeEscapes(relative, source) {
  assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)/, relative);
  for (const match of source.matchAll(
    /@(?:param|returns|type|typedef)\s*\{([^}\n]+)\}/g
  )) {
    const expression = (match[1] || "")
      .replace(/"[^"]*"|'[^']*'/g, "");
    assert.doesNotMatch(
      expression,
      /\bany\b/,
      `${relative} must not use explicit any`
    );
  }
}

function listJavaScriptFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listJavaScriptFiles(absolute)
        : entry.isFile() && entry.name.endsWith(".js")
          ? [path.relative(repoRoot, absolute).replaceAll("\\", "/")]
          : [];
    })
    .sort();
}
