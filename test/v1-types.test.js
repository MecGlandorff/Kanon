import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const packageManifest = readJson("package.json");
const lockfile = readJson("package-lock.json");
const typeConfig = readJson("tsconfig.json");

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
    "noEmit",
    "noUncheckedIndexedAccess",
    "strict",
    "strictNullChecks",
    "useUnknownInCatchVariables"
  ]) {
    assert.equal(options[option], true, `${option} must remain enabled`);
  }
  assert.deepEqual(typeConfig.include, [
    "src/continuity/**/*.js",
    "src/v1/**/*.js"
  ]);
  assert.equal(typeConfig.exclude, undefined);
  assert.equal(options.skipLibCheck, undefined);
});

test("every canonical v1 production module is in the strict project", () => {
  const productionFiles = listJavaScriptFiles(path.join(repoRoot, "src", "v1"));
  assert.deepEqual(
    productionFiles,
    [
      "src/v1/adapters/claude.js",
      "src/v1/adapters/codex.js",
      "src/v1/adapters/shared.js",
      "src/v1/bin/kanon.js",
      "src/v1/cli.js",
      "src/v1/core/build-metadata.js",
      "src/v1/core/plugin-data.js",
      "src/v1/core/receipt-store.js",
      "src/v1/core/receipt.js",
      "src/v1/core/trust.js",
      "src/v1/registry/cache.js",
      "src/v1/registry/deprecation.js",
      "src/v1/registry/sanitize.js",
      "src/v1/registry/transport.js",
      "src/v1/repository/git.js",
      "src/v1/repository/inspect.js",
      "src/v1/repository/read.js",
      "src/v1/skills/invoke.js",
      "src/v1/skills/orient.js",
      "src/v1/skills/resume.js",
      "src/v1/skills/status.js",
      "src/v1/skills/verify.js"
    ]
  );
  for (const relative of productionFiles) {
    const source = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.match(source, /\/\*\*[\s\S]*@(?:param|returns|typedef)/);
    assert.doesNotMatch(
      source,
      /@ts-(?:ignore|nocheck)|@(?:param|returns|type)\s*\{\s*any\b/
    );
  }
  const continuityFiles = listJavaScriptFiles(
    path.join(repoRoot, "src", "continuity")
  );
  assert.deepEqual(continuityFiles, ["src/continuity/engine.js"]);
  const checkedProductionFiles = [...productionFiles, ...continuityFiles];
  for (const relative of continuityFiles) {
    const source = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.match(source, /\/\*\*[\s\S]*@(?:param|returns|typedef)/);
    assert.doesNotMatch(
      source,
      /@ts-(?:ignore|nocheck)|@(?:param|returns|type)\s*\{\s*any\b/
    );
  }

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
  for (const relative of checkedProductionFiles) {
    assert.equal(
      checked.has(path.join(repoRoot, relative)),
      true,
      `${relative} must be checked`
    );
  }
  assert.equal(
    Array.from(checked).some((file) =>
      file.includes(`${path.sep}runtime${path.sep}`)
    ),
    false
  );
});

test("historical compatibility stays outside the expanded stable v1 type claim", () => {
  const legacyCompatibilityModules = [
    "src/cli/index.js",
    "src/index.js",
    "src/persist.js",
    "src/persistence/state.js",
    "src/render/continuity.js",
    "src/render/shared.js",
    "src/scanner/scan.js"
  ];
  assert.deepEqual(typeConfig.include, [
    "src/continuity/**/*.js",
    "src/v1/**/*.js"
  ]);
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
  for (const relative of legacyCompatibilityModules) {
    assert.equal(checked.has(path.join(repoRoot, relative)), false, relative);
  }
  const metadata = readJson("runtime/build-metadata.json");
  assert.deepEqual(metadata.public_capabilities.skills, [
    "kanon",
    "orient",
    "resume",
    "status",
    "verify"
  ]);
  for (const skill of ["orient", "resume", "status", "verify"]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "skills", skill, "SKILL.md")),
      true
    );
  }
  for (const removed of ["steer", "aswitch"]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, "skills", removed)),
      false
    );
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
