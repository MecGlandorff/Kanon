import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compatibilityRuntimeArtifacts,
  COMPATIBILITY_WRITE_COMMANDS,
  COMPATIBILITY_WRITE_WORKFLOW_ENTRIES,
  collectRuntimeDependencies,
  IMPLEMENTED_STABLE_SKILLS,
  PUBLIC_COMMANDS,
  stableRuntimeArtifacts,
  stableRuntimeCanonicalSources,
  V1_RUNTIME_ARTIFACTS
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
  assert.equal(mappings.length, 39);
  assert.equal(sources.length, 39);
  assert.equal(new Set(targets).size, 39);
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

test("shipped compatibility runtime isolates compact write workflows", () => {
  const routerClosure = collectEntrypointClosure([
    COMPATIBILITY_WRITE_WORKFLOW_ENTRIES.todo[0]
  ]);
  const refreshClosure = collectEntrypointClosure(
    COMPATIBILITY_WRITE_WORKFLOW_ENTRIES.refresh
  );
  const todoClosure = collectEntrypointClosure(
    COMPATIBILITY_WRITE_WORKFLOW_ENTRIES.todo
  );
  const shipped = compatibilityRuntimeArtifacts(repoRoot)
    .map(([source]) => source)
    .sort();
  assert.equal(routerClosure.length, 4);
  assert.equal(todoClosure.length, 9);
  assert.equal(refreshClosure.length, 15);
  assert.deepEqual(
    Array.from(new Set([...refreshClosure, ...todoClosure]))
      .filter((source) => !V1_RUNTIME_ARTIFACTS.some(
        ([stableSource]) => stableSource === source
      ))
      .sort(),
    shipped
  );
  if (process.platform !== "win32") {
    assert.notEqual(
      fs.statSync(path.join(repoRoot, "bin", "kanon-write.js")).mode & 0o111,
      0,
      "the canonical write bin must remain executable"
    );
  }
  for (const required of [
    "bin/kanon-write.js",
    "src/config.js",
    "src/path-security.js",
    "src/trust.js",
    "src/v1/compatibility/cli.js",
    "src/v1/compatibility/todo.js",
    "src/v1/compatibility/todo-store.js",
    "src/v1/compatibility/write-fs.js"
  ]) {
    assert.equal(todoClosure.includes(required), true, required);
  }
  for (const forbidden of [
    "src/analyze.js",
    "src/cli/args.js",
    "src/cli/io.js",
    "src/cli/write.js",
    "src/code-intel.js",
    "src/git-runner.js",
    "src/git.js",
    "src/persist.js",
    "src/readme.js",
    "src/render/brief.js",
    "src/render/continuity.js",
    "src/scanner.js",
    "src/verify.js"
  ]) {
    assert.equal(todoClosure.includes(forbidden), false, forbidden);
  }
  assert.equal(
    todoClosure.some((source) =>
      /^(?:src\/analyze|src\/code-intel|src\/scanner|src\/verify)\//.test(source)
    ),
    false
  );
  assert.equal(routerClosure.includes("src/analyze.js"), false);
  assert.equal(routerClosure.includes("src/persist.js"), false);
  assert.equal(refreshClosure.includes("src/analyze.js"), false);
  assert.equal(refreshClosure.includes("src/persist.js"), false);
  assert.equal(
    refreshClosure.includes("src/v1/compatibility/refresh.js"),
    true
  );
  assert.equal(
    refreshClosure.includes("src/v1/repository/inspect.js"),
    true
  );
  assert.equal(
    refreshClosure.some((source) =>
      /^(?:src\/(?:analyze|code-intel|render|scanner|verify)(?:\/|\.js$)|src\/(?:evidence|git-runner|git|persist|readme)\.js$)/.test(
        source
      )
    ),
    false
  );
  assert.equal(
    refreshClosure.includes("src/v1/compatibility/state.js"),
    true
  );
  for (const legacyStateModule of [
    "src/persistence/safe-fs.js",
    "src/persistence/state-fields.js",
    "src/persistence/state.js"
  ]) {
    assert.equal(
      refreshClosure.includes(legacyStateModule),
      false,
      legacyStateModule
    );
  }
  assert.deepEqual(lazyImportTargets("src/v1/compatibility/cli.js"), [
    "src/v1/compatibility/refresh.js",
    "src/v1/compatibility/todo.js"
  ]);
});

test("public workflows have isolated stable, refresh, and todo closures", () => {
  const stableEntrypoint = "src/v1/bin/kanon.js";
  const continuityImport = packageManifest.imports?.["#kanon-continuity"];
  assert.equal(continuityImport, "./src/continuity/engine.js");
  assert.equal(
    packageManifest.imports?.["#kanon-repository-inspect"],
    "./src/v1/repository/inspect.js"
  );
  const continuityEntrypoint = continuityImport.slice(2);
  const stableClosure = collectEntrypointClosure([
    stableEntrypoint,
    continuityEntrypoint
  ]);
  const refreshClosure = collectEntrypointClosure(
    COMPATIBILITY_WRITE_WORKFLOW_ENTRIES.refresh
  );
  const todoClosure = collectEntrypointClosure(
    COMPATIBILITY_WRITE_WORKFLOW_ENTRIES.todo
  );

  assert.equal(stableClosure.length, 28);
  assert.deepEqual(
    stableClosure.filter((source) => refreshClosure.includes(source)),
    [
      "src/continuity/engine.js",
      "src/v1/core/trust.js",
      "src/v1/repository/git.js",
      "src/v1/repository/inspect.js",
      "src/v1/repository/read.js"
    ]
  );
  assert.deepEqual(
    stableClosure.filter((source) => todoClosure.includes(source)),
    []
  );
  assert.deepEqual(
    Array.from(
      new Set([...stableClosure, ...refreshClosure, ...todoClosure])
    ).sort(),
    stableRuntimeCanonicalSources(repoRoot)
  );

  const workflowClosures = new Map([
    ...IMPLEMENTED_STABLE_SKILLS.map((command) => [
      `stable/${command}`,
      stableClosure
    ]),
    ...PUBLIC_COMMANDS.map((command) => [
      `compatibility/${command}`,
      command === "refresh"
        ? refreshClosure
        : command === "todo"
          ? todoClosure
          : stableClosure
    ])
  ]);
  assert.deepEqual(Array.from(workflowClosures.keys()), [
    "stable/orient",
    "stable/resume",
    "stable/status",
    "stable/verify",
    "stable/steer",
    "stable/aswitch",
    "compatibility/ask",
    "compatibility/brief",
    "compatibility/refresh",
    "compatibility/resume",
    "compatibility/todo",
    "compatibility/verify"
  ]);
  for (const [workflow, closure] of workflowClosures) {
    const expected =
      workflow === "compatibility/refresh"
        ? refreshClosure
        : workflow === "compatibility/todo"
          ? todoClosure
          : stableClosure;
    assert.deepEqual(closure, expected, workflow);
  }
  assert.deepEqual(COMPATIBILITY_WRITE_COMMANDS, ["refresh", "todo"]);
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

function collectEntrypointClosure(entries) {
  return Array.from(
    new Set(
      entries.flatMap((entry) => [
        entry,
        ...collectRuntimeDependencies(repoRoot, entry)
      ])
    )
  ).sort();
}

function lazyImportTargets(relative) {
  const source = fs
    .readFileSync(path.join(repoRoot, relative), "utf8")
    .replace(/\/\*\*[\s\S]*?\*\//g, "");
  return Array.from(
    source.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g),
    (match) => path
      .normalize(path.join(path.dirname(relative), match[1]))
      .replaceAll("\\", "/")
  ).sort();
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
