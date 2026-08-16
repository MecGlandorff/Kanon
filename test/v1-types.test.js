import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  COMPATIBILITY_WRITE_COMMANDS,
  IMPLEMENTED_STABLE_SKILLS,
  PUBLIC_COMMANDS,
  stableRuntimeArtifacts
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
  const sources = mappings.map(([source]) => source).sort();
  const targets = mappings.map(([, target]) => target).sort();
  assert.equal(mappings.length, 39);
  assert.equal(sources.length, mappings.length);
  assert.equal(new Set(targets).size, mappings.length);
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
      "--listFiles"
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

test("built public and evaluator entries prove runtime reachability by execution", {
  timeout: 120_000
}, () => {
  const runtimeRoot = path.join(repoRoot, "runtime");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-reachability-"));
  fs.writeFileSync(path.join(fixture, "README.md"), "# Fixture\n");
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    `${JSON.stringify({
      name: "fixture",
      scripts: { test: "node --test" }
    })}\n`
  );
  const instrumentation = createModuleInstrumentation();
  /** @type {Set<string>} */
  const loadedUnion = new Set();
  const steerState = `${JSON.stringify({
    schema: "kanon-steer-request-v1",
    phase: "understand",
    desired_outcome: "verify runtime reachability",
    completion_criteria: ["observe stable output"],
    constraints: ["do not execute repository code"],
    user_decisions: [],
    evidence_references: [],
    unknowns: [],
    next_slice: {
      objective: "inspect one built entry",
      boundaries: ["read-only invocation"]
    },
    required_verification: ["record loaded modules"],
    stop_or_redirect_reasons: []
  })}\n`;
  const aswitchRequest = `${JSON.stringify({
    schema: "kanon-aswitch-request-v1",
    operation: "preview",
    target_host: null,
    payload_mode: null,
    destination_root: null,
    last_plan: null,
    compacted: null,
    approval: null
  })}\n`;
  /** @type {{command: string, args: string[], skill: string, input?: string}[]} */
  const stableCases = [
    {
      command: "ask",
      args: ["ask", "what is this repo's purpose?", "--json", "--root", fixture],
      skill: "orient"
    },
    {
      command: "brief",
      args: ["brief", "--json", "--root", fixture],
      skill: "orient"
    },
    {
      command: "orient",
      args: ["orient", "runtime reachability", "--json", "--root", fixture],
      skill: "orient"
    },
    {
      command: "resume",
      args: ["resume", "--json", "--root", fixture],
      skill: "resume"
    },
    {
      command: "status",
      args: ["status", "--json"],
      skill: "status"
    },
    {
      command: "verify",
      args: ["verify", "README.md", "--json", "--root", fixture],
      skill: "verify"
    },
    {
      command: "steer",
      args: ["steer", "--state-stdin", "--json"],
      skill: "steer",
      input: steerState
    },
    {
      command: "aswitch",
      args: ["aswitch", "--request-stdin", "--json"],
      skill: "aswitch",
      input: aswitchRequest
    }
  ];
  for (const item of stableCases) {
    const execution = runInstrumentedEntry(
      path.join(runtimeRoot, "bin", "kanon-v1.js"),
      item.args,
      fixture,
      instrumentation,
      item.input
    );
    assert.equal(
      execution.status,
      0,
      `${item.command}: ${execution.stderr || execution.stdout}`
    );
    const output = JSON.parse(execution.stdout);
    assert.equal(output.schema, "kanon-stable-skill-result-v1");
    assert.equal(output.skill, item.skill);
    assert.equal(output.ok, true);
    if (item.command === "steer") {
      assert.equal(output.report.state.authorization, false);
    }
    if (item.command === "aswitch") {
      assert.equal(output.report.schema, "kanon-aswitch-report-v1");
      assert.equal(output.report.stage, "AwaitingTarget");
      assert.deepEqual(
        output.report.payload_options.map((option) => option.mode),
        ["last-plan", "compacted", "full-history"]
      );
    }
    assert.equal(execution.modules.includes("bin/kanon-v1.js"), true);
    assert.equal(
      execution.modules.some((module) =>
        module.startsWith("src/v1/compatibility/")
      ),
      false
    );
    for (const module of execution.modules) loadedUnion.add(module);
  }

  const refreshRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-refresh-entry-"));
  fs.writeFileSync(path.join(refreshRoot, "README.md"), "# Refresh fixture\n");
  const refresh = runInstrumentedEntry(
    path.join(runtimeRoot, "bin", "kanon-write.js"),
    ["refresh", "--root", refreshRoot],
    refreshRoot,
    instrumentation
  );
  assert.equal(refresh.status, 0, refresh.stderr || refresh.stdout);
  assert.match(refresh.stdout, /^Kanon refreshed /);
  const state = JSON.parse(
    fs.readFileSync(path.join(refreshRoot, ".kanon", "STATE.json"), "utf8")
  );
  assert.equal(state.schema_version, 2);
  for (const required of [
    "bin/kanon-write.js",
    "src/v1/compatibility/cli.js",
    "src/v1/compatibility/refresh.js",
    "src/v1/compatibility/state.js",
    "repository/inspect.js",
    "src/continuity/engine.js"
  ]) {
    assert.equal(refresh.modules.includes(required), true, required);
  }
  assert.equal(
    refresh.modules.includes("src/v1/compatibility/todo.js"),
    false
  );
  for (const module of refresh.modules) loadedUnion.add(module);

  const todoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-todo-entry-"));
  fs.writeFileSync(path.join(todoRoot, "README.md"), "# Todo fixture\n");
  const todo = runInstrumentedEntry(
    path.join(runtimeRoot, "bin", "kanon-write.js"),
    ["todo", "list", "--json", "--root", todoRoot],
    todoRoot,
    instrumentation
  );
  assert.equal(todo.status, 0, todo.stderr || todo.stdout);
  assert.deepEqual(JSON.parse(todo.stdout), { todos: [] });
  for (const required of [
    "bin/kanon-write.js",
    "src/v1/compatibility/cli.js",
    "src/v1/compatibility/todo.js",
    "src/v1/compatibility/todo-store.js",
    "src/v1/compatibility/write-fs.js"
  ]) {
    assert.equal(todo.modules.includes(required), true, required);
  }
  assert.equal(
    todo.modules.includes("src/v1/compatibility/refresh.js"),
    false
  );
  for (const module of todo.modules) loadedUnion.add(module);

  const evaluatorRunner = path.join(
    instrumentation.directory,
    "run-evaluator.mjs"
  );
  fs.writeFileSync(
    evaluatorRunner,
    `import { analyzeRepo } from ${JSON.stringify(pathToFileURL(path.join(
      runtimeRoot,
      "src",
      "v1",
      "evaluation",
      "analyze.js"
    )).href)};\n` +
      `const analysis = analyzeRepo(process.argv[2], { runId: "reachability-evaluation" });\n` +
      `process.stdout.write(JSON.stringify({ version: analysis.state.version, important_files: analysis.state.important_files, scan: analysis.inspection.scan }) + "\\n");\n`
  );
  const evaluator = runInstrumentedEntry(
    evaluatorRunner,
    [fixture],
    fixture,
    instrumentation
  );
  assert.equal(evaluator.status, 0, evaluator.stderr || evaluator.stdout);
  const evaluatorOutput = JSON.parse(evaluator.stdout);
  assert.equal(typeof evaluatorOutput.version, "string");
  assert.equal(Array.isArray(evaluatorOutput.important_files), true);
  assert.equal(evaluatorOutput.important_files.length <= 5, true);
  assert.equal(typeof evaluatorOutput.scan.complete, "boolean");
  assert.equal(
    evaluator.modules.includes("src/v1/evaluation/analyze.js"),
    true
  );
  for (const module of evaluator.modules) loadedUnion.add(module);

  const shipped = listJavaScriptFiles(runtimeRoot)
    .map((relative) => relative.replace(/^runtime\//, ""));
  assert.deepEqual(Array.from(loadedUnion).sort(), shipped);
  assert.deepEqual(COMPATIBILITY_WRITE_COMMANDS, ["refresh", "todo"]);
  assert.deepEqual(IMPLEMENTED_STABLE_SKILLS, [
    "orient",
    "resume",
    "status",
    "verify",
    "steer",
    "aswitch"
  ]);
  assert.deepEqual(PUBLIC_COMMANDS, [
    "ask",
    "brief",
    "refresh",
    "resume",
    "todo",
    "verify"
  ]);
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

function createModuleInstrumentation() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-module-loader-")
  );
  const loader = path.join(directory, "loader.mjs");
  fs.writeFileSync(
    loader,
    `import fs from "node:fs";
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.startsWith("file:") && process.env.KANON_MODULE_LOG) {
    fs.appendFileSync(process.env.KANON_MODULE_LOG, url + "\\n");
  }
  return result;
}
`
  );
  return { directory, loader, serial: 0 };
}

/**
 * @param {string} entry
 * @param {string[]} args
 * @param {string} cwd
 * @param {{directory: string, loader: string, serial: number}} instrumentation
 * @param {string | undefined} [input]
 */
function runInstrumentedEntry(
  entry,
  args,
  cwd,
  instrumentation,
  input = undefined
) {
  const log = path.join(
    instrumentation.directory,
    `modules-${instrumentation.serial += 1}.log`
  );
  const execution = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-loader",
      instrumentation.loader,
      entry,
      ...args
    ],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        KANON_MODULE_LOG: log,
        PLUGIN_ROOT: "",
        CLAUDE_PLUGIN_ROOT: ""
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30_000,
      windowsHide: true,
      ...(input === undefined ? {} : { input })
    }
  );
  const runtimeRoot = path.join(repoRoot, "runtime");
  const modules = fs.existsSync(log)
    ? Array.from(new Set(
        fs.readFileSync(log, "utf8")
          .split(/\r?\n/)
          .filter(Boolean)
          .map((url) => fileURLToPath(url))
          .map((absolute) => path.relative(runtimeRoot, absolute))
          .filter((relative) =>
            relative &&
            relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
          )
          .map((relative) => relative.replaceAll("\\", "/"))
      )).sort()
    : [];
  return { ...execution, modules };
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
