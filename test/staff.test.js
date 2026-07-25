import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeRepo,
  answerRepoQuestion,
  buildImprovements,
  buildRefactorPlan,
  createRunId,
  readKanonConfig,
  readPreviousState,
  writeKanonOutputs
} from "../src/index.js";
import { runCli } from "../src/cli.js";
import { scanRepo } from "../src/scanner.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(repoRoot, "skills", "kanon");

test("declared purpose stays likely and Python tests do not imply pytest", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "src/main.py": "def main():\n    return True\n",
    "tests/test_main.py": "import unittest\n\nclass MainTest(unittest.TestCase):\n    pass\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260725000000000" });
  assert.equal(analysis.state.purpose.confidence, "likely");
  assert.equal(
    analysis.state.current_state.known.some((item) => item.claim.startsWith("Repo purpose:")),
    false
  );
  assert.equal(analysis.state.commands.test.length, 0);
  assert.deepEqual(analysis.state.tests.frameworks, []);
});

test("a self-contained skill package does not require a README", () => {
  const root = makeFixture({
    "SKILL.md": "---\nname: demo\ndescription: \"Demo repository skill.\"\n---\n\n# Demo\n"
  });
  const analysis = analyzeRepo(root, { runId: "20260725000000007" });

  assert.equal(analysis.state.purpose.confidence, "likely");
  assert.equal(analysis.state.verification.applicable, false);
  assert.deepEqual(analysis.state.verification.issues, []);
  assert.equal(analysis.state.current_state.stale_suspicious.length, 0);
});

test("scanner reports truncation and excludes sensitive files and symlinks", (t) => {
  const root = makeFixture({
    ".env": "SECRET=do-not-read\n",
    "a.txt": "a\n",
    "b.txt": "b\n",
    "c.txt": "c\n"
  });
  const outside = path.join(os.tmpdir(), `kanon-outside-${process.pid}.txt`);
  fs.writeFileSync(outside, "outside\n", "utf8");
  try {
    fs.symlinkSync(outside, path.join(root, "linked.txt"));
  } catch {
    t.diagnostic("Symlink creation is unavailable; sensitive and truncation checks still apply.");
  }

  const scan = scanRepo(root, { maxFiles: 2, useGitIgnore: false });
  assert.equal(scan.diagnostics.truncated, true);
  assert.equal(scan.diagnostics.complete, false);
  assert.equal(scan.diagnostics.sensitive_files_skipped, 1);
  assert.equal(scan.files.some((file) => file.path === ".env"), false);
  assert.equal(scan.files.some((file) => file.path === "linked.txt"), false);
});

test("scanner respects Git ignore rules when Git is available", (t) => {
  const root = makeFixture({
    ".gitignore": "ignored.txt\n",
    "README.md": "# Demo\n",
    "ignored.txt": "ignore me\n",
    "visible.txt": "scan me\n"
  });
  if (!git(root, ["init"]).ok) {
    t.skip("Git is not available.");
    return;
  }

  const scan = scanRepo(root);
  assert.equal(scan.diagnostics.strategy, "git");
  assert.equal(scan.files.some((file) => file.path === "ignored.txt"), false);
  assert.equal(scan.files.some((file) => file.path === "visible.txt"), true);
});

test("scanner respects repository-local .kanonignore patterns", () => {
  const root = makeFixture({
    ".kanonignore": "generated/\n*.snapshot\n!important.snapshot\n",
    "generated/copy.js": "generated\n",
    "keep.js": "keep\n",
    "old.snapshot": "ignore\n",
    "important.snapshot": "keep\n"
  });

  const scan = scanRepo(root, { useGitIgnore: false });
  assert.equal(scan.files.some((file) => file.path === "generated/copy.js"), false);
  assert.equal(scan.files.some((file) => file.path === "old.snapshot"), false);
  assert.equal(scan.files.some((file) => file.path === "important.snapshot"), true);
  assert.ok(scan.diagnostics.kanon_ignored_entries >= 2);
});

test("verify honors an exact nested README target and blocks traversal", () => {
  const root = makeFixture({
    "README.md": "# Root\n\nRun `npm test`.\n",
    "docs/README.md": "# Docs\n\nRun `npm start`.\n",
    "package.json": JSON.stringify({ scripts: { test: "node --test" } })
  });

  const analysis = analyzeRepo(root, {
    readmePath: "docs/README.md",
    runId: "20260725000000001"
  });
  assert.equal(analysis.state.verification.target, "docs/README.md");
  assert.equal(analysis.state.verification.issues.length, 1);
  assert.match(analysis.state.verification.issues[0].claim, /npm start/);
  assert.throws(
    () => analyzeRepo(root, { readmePath: "../README.md" }),
    /must stay inside/
  );
});

test("explicit README verification can inspect a Git-ignored target", (t) => {
  const root = makeFixture({
    ".gitignore": "private/\n",
    "README.md": "# Root\n",
    "private/README.md": "# Private\n\nRun `npm start`.\n",
    "package.json": JSON.stringify({ scripts: { test: "node --test" } })
  });
  if (!git(root, ["init"]).ok) {
    t.skip("Git is not available.");
    return;
  }

  const analysis = analyzeRepo(root, {
    readmePath: "private/README.md",
    runId: "20260725000000010"
  });
  assert.equal(analysis.state.verification.checked, true);
  assert.equal(analysis.state.verification.target, "private/README.md");
  assert.match(analysis.state.verification.issues[0].claim, /npm start/);
});

test("arbitrary questions return unknown instead of unrelated boilerplate", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "package.json": JSON.stringify({ name: "demo" })
  });
  const analysis = analyzeRepo(root, { runId: "20260725000000002" });

  const unknown = answerRepoQuestion(analysis, "Which database does this repo use?");
  assert.equal(unknown.confidence, "unknown");
  assert.match(unknown.summary, /No repository evidence/);

  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo", dependencies: { "better-sqlite3": "^12.0.0" } }),
    "utf8"
  );
  const withDatabaseSignal = answerRepoQuestion(
    analyzeRepo(root, { runId: "20260725000000003" }),
    "Which database does this repo use?"
  );
  assert.equal(withDatabaseSignal.confidence, "likely");
  assert.match(withDatabaseSignal.summary, /sqlite/);
  assert.ok(withDatabaseSignal.evidence.some((item) => item.path === "package.json"));
});

test("refresh preserves user config, TODO, and custom ignore rules", () => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    ".kanon/config.json": `${JSON.stringify({ version: 1, custom: true }, null, 2)}\n`,
    ".kanon/.gitignore": "# custom\nprivate-note.md\n",
    ".kanon/TODO.md": "# Kanon TODO\n\n- [ ] Preserve me\n"
  });
  const beforeConfig = fs.readFileSync(path.join(root, ".kanon", "config.json"), "utf8");
  const beforeTodo = fs.readFileSync(path.join(root, ".kanon", "TODO.md"), "utf8");

  writeKanonOutputs(analyzeRepo(root, { runId: "20260725000000004" }));

  assert.equal(fs.readFileSync(path.join(root, ".kanon", "config.json"), "utf8"), beforeConfig);
  assert.equal(fs.readFileSync(path.join(root, ".kanon", "TODO.md"), "utf8"), beforeTodo);
  assert.deepEqual(readKanonConfig(root), { version: 1, custom: true });
  const ignore = fs.readFileSync(path.join(root, ".kanon", ".gitignore"), "utf8");
  assert.match(ignore, /private-note\.md/);
  assert.match(ignore, /!KANON\.md/);
  assert.deepEqual(
    fs.readdirSync(path.join(root, ".kanon")).filter((name) => name.endsWith(".tmp")),
    []
  );
});

test("scan limits can be configured without editing the skill", () => {
  const root = makeFixture({
    ".kanon/config.json": `${JSON.stringify({ scan: { max_files: 1 } }, null, 2)}\n`,
    "README.md": "# Demo\n",
    "src/a.js": "export const a = true;\n",
    "src/b.js": "export const b = true;\n"
  });

  const analysis = analyzeRepo(root, { runId: "20260725000000006" });
  assert.equal(analysis.state.scan.max_files, 1);
  assert.equal(analysis.state.scan.truncated, true);
  assert.ok(
    analysis.state.current_state.unknown.some((item) => item.claim === "Repository scan was incomplete.")
  );
  assert.equal(buildImprovements(analysis).limitations.length, 1);
  const refactor = buildRefactorPlan(analysis, {
    scan: { maxFiles: 1, useGitIgnore: false }
  });
  assert.equal(refactor.summary.scan_complete, false);
  assert.equal(refactor.hotspots.some((item) => item.type === "dead-code-candidate"), false);
});

test("evidence run IDs include milliseconds", () => {
  assert.equal(createRunId(new Date("2026-07-25T12:34:56.789Z")), "20260725123456789");
  assert.notEqual(createRunId(), createRunId());
});

test("persisted state accepts legacy schema and rejects future schema", () => {
  const root = makeFixture({
    ".kanon/STATE.json": `${JSON.stringify({ repo: { name: "legacy" } })}\n`
  });
  assert.equal(readPreviousState(root).schema_version, 1);

  fs.writeFileSync(
    path.join(root, ".kanon", "STATE.json"),
    `${JSON.stringify({ schema_version: 999, repo: { name: "future" } })}\n`,
    "utf8"
  );
  assert.equal(readPreviousState(root), null);
});

test("git evidence reports branch and dirty working tree without executing repo code", (t) => {
  const root = makeFixture({
    "README.md": "# Demo\n",
    "src/index.js": "export const value = 1;\n"
  });
  if (!git(root, ["init"]).ok) {
    t.skip("Git is not available.");
    return;
  }
  git(root, ["add", "."]);
  const commit = git(root, [
    "-c",
    "user.name=Kanon Test",
    "-c",
    "user.email=kanon@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "Initial fixture"
  ]);
  assert.equal(commit.ok, true, commit.stderr);
  fs.appendFileSync(path.join(root, "src/index.js"), "export const changed = true;\n", "utf8");

  const analysis = analyzeRepo(root, { runId: "20260725000000005" });
  assert.equal(analysis.state.git.found, true);
  assert.equal(analysis.state.git.dirty, true);
  assert.equal(analysis.state.git.change_count, 1);
  assert.ok(analysis.state.git.changes.some((item) => item.path === "src/index.js"));
  assert.ok(analysis.state.git.head);
});

test("git evidence redacts sensitive changed paths", (t) => {
  const root = makeFixture({ "README.md": "# Demo\n", ".env": "TOKEN=initial\n" });
  if (!git(root, ["init"]).ok) {
    t.skip("Git is not available.");
    return;
  }
  git(root, ["add", "-f", "."]);
  const commit = git(root, [
    "-c",
    "user.name=Kanon Test",
    "-c",
    "user.email=kanon@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "Initial fixture"
  ]);
  assert.equal(commit.ok, true, commit.stderr);
  fs.writeFileSync(path.join(root, ".env"), "TOKEN=changed\n", "utf8");

  const analysis = analyzeRepo(root, { runId: "20260725000000008" });
  assert.equal(analysis.state.git.dirty, true);
  assert.equal(analysis.state.git.change_count, 1);
  assert.equal(analysis.state.git.sensitive_changes_skipped, 1);
  assert.deepEqual(analysis.state.git.changes, []);
  assert.equal(JSON.stringify(analysis.state).includes(".env"), false);
});

test("git evidence stays inside a selected repository subdirectory", (t) => {
  const root = makeFixture({
    "outside.txt": "outside\n",
    "target/README.md": "# Target\n",
    "target/inside.txt": "inside\n"
  });
  if (!git(root, ["init"]).ok) {
    t.skip("Git is not available.");
    return;
  }
  git(root, ["add", "."]);
  const commit = git(root, [
    "-c",
    "user.name=Kanon Test",
    "-c",
    "user.email=kanon@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "Initial fixture"
  ]);
  assert.equal(commit.ok, true, commit.stderr);
  fs.appendFileSync(path.join(root, "outside.txt"), "changed\n", "utf8");
  fs.appendFileSync(path.join(root, "target", "inside.txt"), "changed\n", "utf8");

  const analysis = analyzeRepo(path.join(root, "target"), { runId: "20260725000000009" });
  assert.equal(analysis.state.git.change_count, 1);
  assert.deepEqual(analysis.state.git.changes.map((item) => item.path), ["inside.txt"]);
  assert.equal(JSON.stringify(analysis.state.git).includes("outside.txt"), false);
});

test("CLI rejects unknown options", async () => {
  await assert.rejects(() => runCli(["brief", "--bogus"]), /Unknown option/);
});

test("standalone copied skill contains a working runtime", (t) => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanon-standalone-")), "kanon");
  fs.cpSync(skillRoot, target, { recursive: true });

  const runtime = path.join(target, "runtime", "bin", "kanon.js");
  const direct = spawnSync(process.execPath, [runtime, "brief", "--json"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(JSON.parse(direct.stdout).repo.name, path.basename(root));

  if (process.platform === "win32") {
    t.diagnostic("PowerShell wrapper execution is covered by the Windows CI job.");
    return;
  }
  const wrapper = spawnSync(path.join(target, "scripts", "kanon-brief"), ["--json"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(wrapper.status, 0, wrapper.stderr);
  assert.equal(JSON.parse(wrapper.stdout).repo.name, path.basename(root));
});

test("packed npm artifact retains a runnable self-contained skill", { timeout: 60_000 }, () => {
  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-pack-"));
  const pack = runNpm(["pack", "--json", "--pack-destination", packRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" }
  });
  assert.equal(pack.status, 0, pack.error?.stack || pack.stderr);
  const metadata = JSON.parse(pack.stdout);
  const tarball = path.join(packRoot, metadata[0].filename);
  const installRoot = path.join(packRoot, "install");
  const install = runNpm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, tarball],
    { encoding: "utf8" }
  );
  assert.equal(install.status, 0, install.error?.stack || install.stderr);

  const installedSkill = path.join(
    installRoot,
    "node_modules",
    "@mecglandorff",
    "kanon",
    "skills",
    "kanon"
  );
  const fixture = makeFixture({ "README.md": "# Packed Fixture\n" });
  const runtime = path.join(installedSkill, "runtime", "bin", "kanon.js");
  const result = spawnSync(process.execPath, [runtime, "brief", "--json"], {
    cwd: fixture,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).purpose.claim, "Packed Fixture");
});

test("generated skill runtime and wrappers are synchronized", () => {
  const result = spawnSync(process.execPath, ["scripts/build-skill.js", "--check"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
});

function makeFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanon-staff-"));
  for (const [relPath, contents] of Object.entries(files)) {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents, "utf8");
  }
  return root;
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function runNpm(args, options = {}) {
  if (process.env.npm_execpath) {
    return spawnSync(process.execPath, [process.env.npm_execpath, ...args], options);
  }
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm", ...args], options);
  }
  return spawnSync("npm", args, options);
}
