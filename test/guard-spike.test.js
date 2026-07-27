import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectHook as inspectCodexHook } from "../spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/scripts/probe-core.mjs";
import { inspectHook as inspectClaudeHook } from "../spikes/guard-feasibility/claude-code/plugin/scripts/probe-core.mjs";
import {
  MARKETPLACE_NAME,
  PLUGIN_ID,
  denialProbe,
  marketplaceIdentityMatches,
  parseMarketplaceList,
  parsePluginList,
  pluginIdentityMatches,
  verifyFixtureIdentity
} from "../spikes/guard-feasibility/codex-cli/fixture.mjs";
import {
  cleanupOwnedCodexState,
  createInteractiveEnvironment,
  ensureExclusiveReportTarget,
  evaluateInteractiveEvidence,
  interactiveArguments,
  parseInteractiveOptions,
  sourceBundleSha256,
  summarizeInteractiveObservations
} from "../spikes/guard-feasibility/codex-cli/interactive-run.mjs";
import {
  containedReportPath,
  createMinimalHostEnvironment,
  createScratch,
  removeScratch,
  resolveTrustedExecutable,
  runProgramAsync,
  writeReport
} from "../spikes/guard-feasibility/lib/runtime.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

for (const [host, inspect, environment] of [
  [
    "Codex CLI",
    inspectCodexHook,
    (root) => ({
      PLUGIN_ROOT: path.join(root, "plugin"),
      PLUGIN_DATA: path.join(root, "plugin-data"),
      KANON_GUARD_SPIKE_EVIDENCE_FILE: path.join(root, "evidence.jsonl"),
      KANON_GUARD_SPIKE_EVIDENCE_ROOT: root
    })
  ],
  [
    "Claude Code",
    inspectClaudeHook,
    (root) => ({
      CLAUDE_PLUGIN_ROOT: path.join(root, "plugin"),
      CLAUDE_PLUGIN_DATA: path.join(root, "plugin-data"),
      KANON_GUARD_SPIKE_EVIDENCE_FILE: path.join(root, "evidence.jsonl"),
      KANON_GUARD_SPIKE_EVIDENCE_ROOT: root
    })
  ]
]) {
  test(`${host} spike emits the documented PreToolUse deny response`, (t) => {
    const fixture = makeFixture(t);
    const result = inspect(
      hookInput("KANON_GUARD_SPIKE_DENY"),
      environment(fixture)
    );

    assert.deepEqual(result.output, {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Kanon Guard feasibility spike denied the marked tool call."
      }
    });
    assert.equal(result.observation.decision, "deny");
    assert.equal(result.observation.session_id.present, true);
    assert.equal(result.observation.turn_id.present, true);
    assert.equal(result.observation.cwd.present, true);
    assert.equal(result.observation.plugin_root_present, true);
    assert.equal(result.observation.plugin_data.writable, true);
    assert.equal(result.observation.evidence_sink.written, true);
    const evidence = fs.readFileSync(path.join(fixture, "evidence.jsonl"), "utf8");
    assert.doesNotMatch(
      evidence,
      /session-fixture|turn-fixture|kanon guard fixture|KANON_GUARD_SPIKE_DENY/
    );
    assert.deepEqual(fs.readdirSync(path.join(fixture, "plugin-data")), []);
  });

  test(`${host} spike emits an allow-plus-updatedInput rewrite only for Bash`, (t) => {
    const fixture = makeFixture(t);
    const input = hookInput("KANON_GUARD_SPIKE_REWRITE");
    input.tool_input.untrusted = "must-not-be-forwarded";
    const result = inspect(input, environment(fixture));

    assert.equal(
      result.output.hookSpecificOutput.permissionDecision,
      "allow"
    );
    assert.equal(
      result.output.hookSpecificOutput.updatedInput.command.includes(
        "KANON_GUARD_SPIKE_REWRITTEN"
      ),
      true
    );
    assert.equal(result.observation.decision, "rewrite");
    assert.deepEqual(
      Object.keys(result.output.hookSpecificOutput.updatedInput),
      ["command"]
    );
  });

  test(`${host} spike safely probes and removes a missing plugin-data leaf`, (t) => {
    const fixture = makeFixture(t);
    const pluginData = path.join(fixture, "plugin-data");
    fs.rmdirSync(pluginData);
    const result = inspect(
      hookInput("KANON_GUARD_SPIKE_DENY"),
      environment(fixture)
    );

    assert.equal(result.observation.plugin_data.writable, true);
    assert.equal(
      result.observation.plugin_data.directory_created_for_probe,
      true
    );
    assert.equal(fs.existsSync(pluginData), false);
  });

  test(`${host} spike safely creates and removes a bounded plugin-data suffix`, (t) => {
    const fixture = makeFixture(t);
    const values = environment(fixture);
    const dataKey = Object.hasOwn(values, "PLUGIN_DATA")
      ? "PLUGIN_DATA"
      : "CLAUDE_PLUGIN_DATA";
    const missingParent = path.join(fixture, "missing-parent");
    values[dataKey] = path.join(missingParent, "plugin-data");
    const result = inspect(
      hookInput("KANON_GUARD_SPIKE_DENY"),
      values
    );

    assert.equal(result.observation.plugin_data.writable, true);
    assert.equal(
      result.observation.plugin_data.directory_created_for_probe,
      true
    );
    assert.equal(
      result.observation.plugin_data.created_directory_count,
      2
    );
    assert.equal(fs.existsSync(missingParent), false);
  });

  test(`${host} spike refuses an excessive missing plugin-data suffix`, (t) => {
    const fixture = makeFixture(t);
    const values = environment(fixture);
    const dataKey = Object.hasOwn(values, "PLUGIN_DATA")
      ? "PLUGIN_DATA"
      : "CLAUDE_PLUGIN_DATA";
    const segments = Array.from(
      { length: 9 },
      (_, index) => `missing-${index}`
    );
    values[dataKey] = path.join(fixture, ...segments);
    const result = inspect(
      hookInput("KANON_GUARD_SPIKE_DENY"),
      values
    );

    assert.equal(result.observation.plugin_data.writable, "unknown");
    assert.equal(result.observation.plugin_data.reason, "plugin-data-depth");
    assert.equal(fs.existsSync(path.join(fixture, segments[0])), false);
  });

  test(`${host} spike refuses an evidence sink outside the runner root`, (t) => {
    const fixture = makeFixture(t);
    const outside = makeFixture(t);
    const environmentWithOutsideSink = {
      ...environment(fixture),
      KANON_GUARD_SPIKE_EVIDENCE_FILE: path.join(outside, "evidence.jsonl")
    };
    const result = inspect(
      hookInput("KANON_GUARD_SPIKE_DENY"),
      environmentWithOutsideSink
    );

    assert.deepEqual(result.observation.evidence_sink, {
      written: false,
      reason: "outside-evidence-root"
    });
    assert.deepEqual(fs.readdirSync(outside).sort(), ["plugin", "plugin-data"]);
  });

  test(`${host} spike shell-quotes a hostile cwd in its rewrite`, (t) => {
    const fixture = makeFixture(t);
    const input = hookInput("KANON_GUARD_SPIKE_REWRITE");
    input.cwd = path.join(fixture, "quote'boundary");
    const result = inspect(input, environment(fixture));

    assert.match(result.output.hookSpecificOutput.updatedInput.command, /'"'"'/);
  });

  test(`${host} spike does not deny an unexpected tool`, (t) => {
    const fixture = makeFixture(t);
    const input = hookInput("KANON_GUARD_SPIKE_DENY");
    input.tool_name = "Read";
    const result = inspect(input, environment(fixture));

    assert.equal(result.output, null);
    assert.equal(result.observation.decision, "observe");
  });

  test(`${host} spike rejects a relative evidence path`, (t) => {
    const fixture = makeFixture(t);
    const result = inspect(hookInput("KANON_GUARD_SPIKE_DENY"), {
      ...environment(fixture),
      KANON_GUARD_SPIKE_EVIDENCE_FILE: "relative-evidence.jsonl"
    });

    assert.deepEqual(result.observation.evidence_sink, {
      written: false,
      reason: "relative-evidence-path"
    });
  });
}

test("host fixtures keep separate manifests and lifecycle hooks", () => {
  const codexPlugin = path.join(
    repoRoot,
    "spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/.codex-plugin/plugin.json"
  );
  const claudePlugin = path.join(
    repoRoot,
    "spikes/guard-feasibility/claude-code/plugin/.claude-plugin/plugin.json"
  );
  const codexHooks = JSON.parse(fs.readFileSync(
    path.join(path.dirname(path.dirname(codexPlugin)), "hooks/hooks.json"),
    "utf8"
  ));
  const claudeHooks = JSON.parse(fs.readFileSync(
    path.join(path.dirname(path.dirname(claudePlugin)), "hooks/hooks.json"),
    "utf8"
  ));
  const marketplace = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "spikes/guard-feasibility/codex-cli/marketplace/.agents/plugins/marketplace.json"),
    "utf8"
  ));
  const codexManifest = JSON.parse(fs.readFileSync(codexPlugin, "utf8"));
  const claudeManifest = JSON.parse(fs.readFileSync(claudePlugin, "utf8"));

  assert.equal(codexManifest.name, "kanon-guard-spike-codex");
  assert.equal(claudeManifest.name, "kanon-guard-spike-claude");
  for (const manifest of [codexManifest, claudeManifest]) {
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(typeof manifest.description, "string");
    assert.equal(typeof manifest.author?.name, "string");
  }
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].policy.installation, "AVAILABLE");
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
  assert.ok(codexHooks.hooks.PreToolUse.some((entry) => entry.matcher === "^apply_patch$"));
  assert.equal(claudeHooks.hooks.PreToolUse[0].matcher, "Bash|Write|Edit");
  assert.ok(codexHooks.hooks.SessionStart.length > 0);
  assert.ok(claudeHooks.hooks.SessionStart.length > 0);
});

test("Codex Run A.2 fixture identity is fixed to the committed disposable files", () => {
  const identity = verifyFixtureIdentity(repoRoot);
  const marker = path.join(
    os.tmpdir(),
    "kanon-run-a2-fixture",
    "kanon-guard-spike-deny-shell.txt"
  );
  const prompt = denialProbe(marker);

  assert.equal(identity.verified, true);
  assert.match(identity.bundleSha256, /^[0-9a-f]{64}$/);
  assert.match(sourceBundleSha256(repoRoot), /^[0-9a-f]{64}$/);
  assert.match(prompt, /Use the Bash tool exactly once/);
  assert.match(prompt, /KANON_GUARD_SPIKE_DENY/);
  assert.match(prompt, /do not retry if the tool is denied/);
  assert.throws(() => denialProbe("relative-marker"), /must be absolute/);
});

test("Codex Run A.2 documented JSON identity checks require exact fixture fields", (t) => {
  const fixture = makeTemporaryDirectory(t, "kanon-guard-marketplace-");
  const marketplace = parseMarketplaceList(JSON.stringify({
    marketplaces: [
      {
        name: MARKETPLACE_NAME,
        root: fixture,
        marketplaceSource: {
          sourceType: "local",
          source: fixture
        }
      }
    ]
  }));
  const plugin = parsePluginList(JSON.stringify({
    installed: [
      {
        pluginId: PLUGIN_ID,
        name: MARKETPLACE_NAME,
        marketplaceName: MARKETPLACE_NAME,
        version: "0.0.0",
        installed: true,
        enabled: true,
        source: {
          source: "local",
          path: fixture
        },
        marketplaceSource: {
          sourceType: "local",
          source: fixture
        },
        installPolicy: "AVAILABLE",
        authPolicy: "ON_INSTALL"
      }
    ]
  }));

  assert.equal(marketplaceIdentityMatches(marketplace, fixture), true);
  assert.equal(pluginIdentityMatches(plugin, fixture), true);
  plugin.match.version = "0.0.1";
  assert.equal(pluginIdentityMatches(plugin, fixture), false);
  assert.equal(parseMarketplaceList("[]"), null);
  assert.equal(parsePluginList('{"installed":"not-an-array"}'), null);
});

test("Codex Run A.2 launcher arguments and options are fixed and bounded", (t) => {
  const workspace = makeTemporaryDirectory(t, "kanon-guard-launcher-");
  const report = path.join(repoRoot, "spikes", "guard-feasibility", "results", "codex-cli-0.145.0-macos-run-a2-test.json");

  assert.deepEqual(
    parseInteractiveOptions(["--execute", "--report", report]),
    { execute: true, report }
  );
  for (const invalid of [
    [],
    ["--execute"],
    ["--execute", "--execute", "--report", report],
    ["--execute", "--report", report, "unexpected-prompt"],
    ["--execute", "--report", "--execute"]
  ]) {
    assert.throws(() => parseInteractiveOptions(invalid));
  }

  const args = interactiveArguments(workspace);
  assert.equal(args.filter((value) => value === workspace).length, 1);
  assert.ok(args.includes("workspace-write"));
  assert.ok(args.includes("on-request"));
  assert.ok(args.includes('web_search="disabled"'));
  assert.ok(args.includes("features.apps=false"));
  assert.ok(args.includes("features.multi_agent=false"));
  assert.ok(args.includes("features.memories=false"));
  assert.ok(args.includes("mcp_servers={}"));
  assert.ok(args.includes("features.plugins=true"));
  assert.ok(args.includes("features.hooks=true"));
  assert.equal(args.includes("--dangerously-bypass-hook-trust"), false);
  assert.equal(
    args.includes("--dangerously-bypass-approvals-and-sandbox"),
    false
  );
  assert.throws(() => interactiveArguments("relative-workspace"));
});

test("Codex Run A.2 interactive environment extends only the minimum boundary", (t) => {
  const scratch = createScratch("kanon-guard-run-a2-environment-", {
    repoRoot
  });
  t.after(() => {
    if (fs.existsSync(scratch.root)) removeScratch(scratch);
  });
  const base = createMinimalHostEnvironment({
    host: "codex-cli",
    repoRoot,
    scratchRoot: scratch.root,
    hostExecutable: process.execPath,
    environment: {
      HOME: os.homedir(),
      PATH: path.dirname(process.execPath),
      LANG: "C",
      OPENAI_API_KEY: "must-not-cross-boundary",
      HTTPS_PROXY: "must-not-cross-boundary",
      NODE_OPTIONS: "--require=must-not-cross-boundary"
    }
  });
  const environment = createInteractiveEnvironment({
    baseEnvironment: base,
    scratch
  });

  assert.equal(environment.TERM, "xterm-256color");
  assert.equal(environment.COLORTERM, "truecolor");
  assert.equal(
    environment.KANON_GUARD_SPIKE_EVIDENCE_FILE,
    scratch.evidence
  );
  assert.equal(
    environment.KANON_GUARD_SPIKE_EVIDENCE_ROOT,
    scratch.root
  );
  for (const key of [
    "OPENAI_API_KEY",
    "HTTPS_PROXY",
    "NODE_OPTIONS",
    "SHELL"
  ]) {
    assert.equal(Object.hasOwn(environment, key), false);
  }
});

test("Codex Run A.2 report target is additive and never overwritten", (t) => {
  const root = makeTemporaryDirectory(t, "kanon-guard-run-a2-report-");
  const report = path.join(root, "report.json");
  assert.equal(ensureExclusiveReportTarget(root, report), report);
  fs.writeFileSync(report, "historical evidence\n", "utf8");
  assert.throws(
    () => ensureExclusiveReportTarget(root, report),
    (error) => error?.code === "EEXIST"
  );
  assert.equal(fs.readFileSync(report, "utf8"), "historical evidence\n");
});

test("Codex Run A.2 cleanup uses only exact owned identities and verifies absence", async () => {
  const calls = [];
  const processResult = (stdout = "") => ({
    status: 0,
    signal: null,
    timed_out: false,
    overflowed: false,
    error_code: null,
    stdout,
    stderr: ""
  });
  const run = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === "plugin" && args[1] === "list") {
      return processResult('{"installed":[]}');
    }
    if (
      args[0] === "plugin" &&
      args[1] === "marketplace" &&
      args[2] === "list"
    ) {
      return processResult('{"marketplaces":[]}');
    }
    return processResult("{}");
  };
  const result = await cleanupOwnedCodexState({
    hostExecutable: "/trusted/codex",
    cwd: "/scratch/workspace",
    environment: Object.create(null),
    pluginOwned: true,
    marketplaceOwned: true,
    run
  });

  assert.equal(result.exactNamesAbsent, true);
  assert.deepEqual(calls.map((entry) => entry.args), [
    ["plugin", "remove", PLUGIN_ID, "--json"],
    [
      "plugin",
      "marketplace",
      "remove",
      MARKETPLACE_NAME,
      "--json"
    ],
    ["plugin", "list", "--json"],
    ["plugin", "marketplace", "list", "--json"]
  ]);
  assert.ok(calls.every((entry) => entry.command === "/trusted/codex"));

  let invocation = 0;
  const failedRemoval = await cleanupOwnedCodexState({
    hostExecutable: "/trusted/codex",
    cwd: "/scratch/workspace",
    environment: Object.create(null),
    pluginOwned: true,
    marketplaceOwned: true,
    run: async (_command, args) => {
      invocation += 1;
      if (invocation === 1) {
        return {
          ...processResult("{}"),
          status: 1
        };
      }
      if (args[0] === "plugin" && args[1] === "list") {
        return processResult('{"installed":[]}');
      }
      if (
        args[0] === "plugin" &&
        args[1] === "marketplace" &&
        args[2] === "list"
      ) {
        return processResult('{"marketplaces":[]}');
      }
      return processResult("{}");
    }
  });
  assert.equal(failedRemoval.exactNamesAbsent, true);
  assert.equal(failedRemoval.removalCommandsSucceeded, false);
});

test("Codex Run A.2 result requires direct denial, marker, compact, and supervision", () => {
  const workspace = path.join(
    os.tmpdir(),
    "kanon-guard-run-a2-observations"
  );
  const cwdHash = createHash("sha256").update(workspace).digest("hex");
  const observations = summarizeInteractiveObservations([
    {
      schema: "kanon-guard-feasibility-observation-v1",
      host: "codex-cli",
      hook_event_name: "PreToolUse",
      session_start_source: null,
      tool_name: "Bash",
      marker: "deny",
      decision: "deny",
      session_id: { present: true },
      turn_id: { present: true },
      cwd: { present: true, sha256: cwdHash },
      plugin_root_present: true,
      plugin_data: { writable: true },
      evidence_sink: { written: true }
    },
    {
      schema: "kanon-guard-feasibility-observation-v1",
      host: "codex-cli",
      hook_event_name: "SessionStart",
      session_start_source: "compact",
      tool_name: null,
      marker: "none",
      decision: "observe",
      session_id: { present: true },
      turn_id: { present: false },
      cwd: { present: true, sha256: cwdHash },
      plugin_root_present: true,
      plugin_data: { writable: true },
      evidence_sink: { written: true }
    }
  ], workspace);
  const launchArgs = interactiveArguments(workspace);
  const proven = evaluateInteractiveEvidence({
    observations,
    markerAbsent: true,
    supervisionConfirmed: true,
    launchArgs,
    interactiveProcess: {
      status: 0,
      timed_out: false,
      aborted: false
    }
  });

  assert.deepEqual(proven, {
    preToolUseDenial: true,
    markerAbsent: true,
    actualCompaction: true,
    persistedExactHashTrust: true,
    executionBounds: true
  });
  assert.equal(
    evaluateInteractiveEvidence({
      observations,
      markerAbsent: true,
      supervisionConfirmed: false,
      launchArgs,
      interactiveProcess: {
        status: 0,
        timed_out: false,
        aborted: false
      }
    }).persistedExactHashTrust,
    false
  );
});

test("Codex Run A.2 launcher passes only its resolved executable to the TUI", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "codex-cli",
      "interactive-run.mjs"
    ),
    "utf8"
  );
  assert.match(
    source,
    /hostExecutable = resolveTrustedExecutable\("codex"/
  );
  assert.match(
    source,
    /runInteractiveProgram\(\s*hostExecutable,\s*launchArgs/
  );
  assert.doesNotMatch(source, /spawn\(\s*["']codex["']/);
});

test(
  "Codex Run A.2 launcher completes a fixed fake lifecycle and cleans all owned state",
  { skip: process.platform === "win32", timeout: 20_000 },
  async (t) => {
    const fixture = makeTemporaryDirectory(
      t,
      "kanon-guard-run-a2-lifecycle-"
    );
    const bin = path.join(fixture, "bin");
    const state = path.join(fixture, "state");
    fs.mkdirSync(bin);
    fs.mkdirSync(state);
    const fakeGit = path.join(bin, "git");
    fs.writeFileSync(
      fakeGit,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "rev-parse" && args[1] === "HEAD") {
  process.stdout.write("${"a".repeat(40)}\\n");
} else if (args.includes("status")) {
  process.stdout.write("");
} else if (args[0] === "merge-base") {
  process.exitCode = 0;
} else {
  process.exitCode = 2;
}
`,
      { mode: 0o755 }
    );
    const fakeCodex = path.join(bin, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const stateRoot = ${JSON.stringify(state)};
const marketplaceFile = path.join(stateRoot, "marketplace");
const pluginFile = path.join(stateRoot, "plugin");
const name = "kanon-guard-spike-codex";
const pluginId = name + "@" + name;
const result = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const marketplaceRoot = () => fs.readFileSync(marketplaceFile, "utf8");

if (process.env.KANON_SECRET_SENTINEL) {
  fs.writeFileSync(path.join(stateRoot, "secret-leaked"), "leaked\\n");
}
if (args[0] === "--version") {
  process.stdout.write("codex-cli 0.145.0\\n");
} else if (args[0] === "login" && args[1] === "status") {
  process.stderr.write("Logged in SENSITIVE_RUN_A2_AUTH@example.invalid\\n");
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
  result({
    marketplaces: fs.existsSync(marketplaceFile)
      ? [{
          name,
          root: marketplaceRoot(),
          marketplaceSource: {
            sourceType: "local",
            source: marketplaceRoot()
          }
        }]
      : []
  });
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "add") {
  fs.writeFileSync(marketplaceFile, args[3], "utf8");
  result({});
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "remove") {
  if (args[3] !== name) process.exitCode = 2;
  fs.rmSync(marketplaceFile, { force: true });
  result({});
} else if (args[0] === "plugin" && args[1] === "list") {
  result({
    installed: fs.existsSync(pluginFile)
      ? [{
          pluginId,
          name,
          marketplaceName: name,
          version: "0.0.0",
          installed: true,
          enabled: true,
          source: {
            source: "local",
            path: path.join(marketplaceRoot(), "plugins", name)
          },
          marketplaceSource: {
            sourceType: "local",
            source: marketplaceRoot()
          },
          installPolicy: "AVAILABLE",
          authPolicy: "ON_INSTALL"
        }]
      : []
  });
} else if (args[0] === "plugin" && args[1] === "add") {
  if (args[2] !== pluginId) process.exitCode = 2;
  fs.writeFileSync(pluginFile, "owned\\n", "utf8");
  result({});
} else if (args[0] === "plugin" && args[1] === "remove") {
  if (args[2] !== pluginId) process.exitCode = 2;
  fs.rmSync(pluginFile, { force: true });
  result({});
} else if (args[0] === "--strict-config") {
  if (
    args.includes("--dangerously-bypass-hook-trust") ||
    args.includes("--dangerously-bypass-approvals-and-sandbox") ||
    !args.includes("workspace-write") ||
    !args.includes("on-request")
  ) {
    process.exitCode = 2;
  } else {
    const cwdHash = crypto
      .createHash("sha256")
      .update(process.cwd())
      .digest("hex");
    const identity = (present) => ({ present, sha256: present ? "b".repeat(64) : null });
    const common = {
      schema: "kanon-guard-feasibility-observation-v1",
      host: "codex-cli",
      session_id: identity(true),
      cwd: { present: true, sha256: cwdHash },
      plugin_root_present: true,
      plugin_data: { present: true, writable: true }
    };
    const events = [
      {
        ...common,
        hook_event_name: "PreToolUse",
        session_start_source: null,
        tool_name: "Bash",
        marker: "deny",
        turn_id: identity(true),
        decision: "deny"
      },
      {
        ...common,
        hook_event_name: "SessionStart",
        session_start_source: "compact",
        tool_name: null,
        marker: "none",
        turn_id: identity(false),
        decision: "observe"
      }
    ];
    fs.writeFileSync(
      process.env.KANON_GUARD_SPIKE_EVIDENCE_FILE,
      events.map((event) => JSON.stringify(event)).join("\\n") + "\\n",
      "utf8"
    );
    fs.writeFileSync(path.join(stateRoot, "scratch-cwd"), process.cwd(), "utf8");
    fs.writeFileSync(path.join(stateRoot, "tui-complete"), "complete\\n", "utf8");
  }
} else {
  process.exitCode = 2;
}
`,
      { mode: 0o755 }
    );

    const report = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "results",
      `.codex-cli-0.145.0-macos-run-a2-lifecycle-test-${randomUUID()}.json`
    );
    t.after(() => fs.rmSync(report, { force: true }));
    const launcher = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "codex-cli",
      "interactive-run.mjs"
    );
    const child = spawn(
      process.execPath,
      [launcher, "--execute", "--report", report],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          KANON_SECRET_SENTINEL: "must-not-cross-boundary",
          PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`
        },
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const completion = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    });

    await waitForFile(path.join(state, "tui-complete"), 10_000);
    await waitForCondition(
      () => stdout.includes("KANON_STATUS_HOOK_AND_TWO_TURNS_CONFIRMED"),
      10_000,
      "Run A.2 supervision prompt"
    );
    child.stdin.end("KANON_STATUS_HOOK_AND_TWO_TURNS_CONFIRMED\n");
    const exit = await completion;

    assert.deepEqual(
      exit,
      { code: 0, signal: null },
      `${stderr}\n${
        fs.existsSync(report) ? fs.readFileSync(report, "utf8") : "no report"
      }`
    );
    assert.equal(fs.existsSync(path.join(state, "marketplace")), false);
    assert.equal(fs.existsSync(path.join(state, "plugin")), false);
    assert.equal(fs.existsSync(path.join(state, "secret-leaked")), false);
    const scratchCwd = fs.readFileSync(
      path.join(state, "scratch-cwd"),
      "utf8"
    );
    assert.equal(fs.existsSync(scratchCwd), false);
    const reportText = fs.readFileSync(report, "utf8");
    const parsed = JSON.parse(reportText);
    assert.equal(parsed.disposition, "go");
    assert.ok(
      Object.values(parsed.criteria).every((criterion) => criterion === "proven")
    );
    assert.equal(parsed.interactive.observation_count, 2);
    assert.equal(parsed.interactive.marker_absent, true);
    assert.equal(parsed.cleanup.at(-1).removed, true);
    assert.match(stdout, /"disposition":"go"/);
    assert.doesNotMatch(
      reportText,
      new RegExp(
        [
          escapeRegExp(repoRoot),
          "SENSITIVE_RUN_A2_AUTH",
          "must-not-cross-boundary",
          "KANON_GUARD_SPIKE_DENY"
        ].join("|")
      )
    );
  }
);

test("spike report paths reject a symlinked parent", (t) => {
  const root = makeTemporaryDirectory(t, "kanon-guard-report-root-");
  const outside = makeTemporaryDirectory(t, "kanon-guard-report-outside-");
  const link = path.join(root, "linked");
  try {
    fs.symlinkSync(outside, link, "dir");
  } catch {
    t.skip("Symbolic links are unavailable.");
    return;
  }

  assert.throws(
    () => containedReportPath(root, path.join(link, "report.json")),
    /below the repository root/
  );
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("spike report writes reject a hard-linked target", (t) => {
  const root = makeTemporaryDirectory(t, "kanon-guard-report-root-");
  const outside = makeTemporaryDirectory(t, "kanon-guard-report-outside-");
  const source = path.join(outside, "source.json");
  const target = path.join(root, "report.json");
  fs.writeFileSync(source, "outside\n", "utf8");
  try {
    fs.linkSync(source, target);
  } catch {
    t.skip("Hard links are unavailable.");
    return;
  }

  assert.throws(() => writeReport(target, { safe: true }), /unsafe existing/);
  assert.equal(fs.readFileSync(source, "utf8"), "outside\n");
});

test("spike report writes reject a symbolic-link target", (t) => {
  const root = makeTemporaryDirectory(t, "kanon-guard-report-root-");
  const outside = makeTemporaryDirectory(t, "kanon-guard-report-outside-");
  const source = path.join(outside, "source.json");
  const target = path.join(root, "report.json");
  fs.writeFileSync(source, "outside\n", "utf8");
  try {
    fs.symlinkSync(source, target, "file");
  } catch {
    t.skip("Symbolic links are unavailable.");
    return;
  }

  assert.throws(() => writeReport(target, { safe: true }), /unsafe existing/);
  assert.equal(fs.readFileSync(source, "utf8"), "outside\n");
});

test("spike report writes never overwrite an existing evidence file", (t) => {
  const root = makeTemporaryDirectory(t, "kanon-guard-report-root-");
  const target = path.join(root, "report.json");
  fs.writeFileSync(target, "historical evidence\n", "utf8");

  assert.throws(() => writeReport(target, { replacement: true }), /EEXIST/);
  assert.equal(fs.readFileSync(target, "utf8"), "historical evidence\n");
});

test("async host execution closes stdin so non-interactive CLIs can start", async () => {
  const result = await runProgramAsync(
    process.execPath,
    [
      "-e",
      "process.stdin.resume(); process.stdin.once('end', () => process.stdout.write('eof\\n'));"
    ],
    { timeoutMs: 2_000 }
  );

  assert.equal(result.status, 0);
  assert.equal(result.timed_out, false);
  assert.equal(result.stdout, "eof\n");
});

test("minimal host environments do not inherit secret sentinel variables", async (t) => {
  const scratch = createScratch("kanon-guard-environment-");
  t.after(() => {
    if (fs.existsSync(scratch.root)) removeScratch(scratch);
  });
  const environment = createMinimalHostEnvironment({
    host: "claude-code",
    repoRoot,
    scratchRoot: scratch.root,
    hostExecutable: process.execPath,
    environment: {
      HOME: os.homedir(),
      USER: "fixture-user",
      PATH: path.dirname(process.execPath),
      LANG: "C",
      KANON_SECRET_SENTINEL: "must-not-cross-boundary",
      ANTHROPIC_API_KEY: "must-not-cross-boundary",
      OPENAI_API_KEY: "must-not-cross-boundary",
      NODE_OPTIONS: "--require=must-not-cross-boundary"
    }
  });

  for (const name of [
    "KANON_SECRET_SENTINEL",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "NODE_OPTIONS"
  ]) {
    assert.equal(Object.hasOwn(environment, name), false);
  }
  assert.equal(environment.USER, "fixture-user");
  const result = await runProgramAsync(
    process.execPath,
    [
      "-e",
      "process.stdout.write(process.env.KANON_SECRET_SENTINEL === undefined ? 'absent\\n' : 'present\\n')"
    ],
    { env: environment, timeoutMs: 2_000 }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "absent\n");
});

test("trusted executable resolution rejects repository-controlled PATH entries", (t) => {
  const fixture = makeTemporaryDirectory(t, "kanon-guard-resolution-");
  const repository = path.join(fixture, "repo");
  const repositoryBin = path.join(repository, "bin");
  const trustedBin = path.join(fixture, "trusted-bin");
  fs.mkdirSync(repositoryBin, { recursive: true });
  fs.mkdirSync(trustedBin);
  const executableName = process.platform === "win32"
    ? "claude.CMD"
    : "claude";
  const repositoryExecutable = path.join(repositoryBin, executableName);
  const trustedExecutable = path.join(trustedBin, executableName);
  for (const executable of [repositoryExecutable, trustedExecutable]) {
    fs.writeFileSync(executable, "not executed\n", { mode: 0o755 });
  }
  const environment = {
    PATH: [repositoryBin, trustedBin].join(path.delimiter),
    PATHEXT: ".CMD"
  };

  assert.equal(
    resolveTrustedExecutable("claude", {
      repoRoot: repository,
      environment
    }),
    fs.realpathSync(trustedExecutable)
  );
  assert.throws(
    () => resolveTrustedExecutable("claude", {
      repoRoot: repository,
      environment: {
        PATH: repositoryBin,
        PATHEXT: ".CMD"
      }
    }),
    /No trusted claude executable/
  );
});

test("Claude runner contains no dangerous permission-bypass flag", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "claude-code",
      "run.mjs"
    ),
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /--(?:allow-)?dangerously-skip-permissions/
  );
  assert.match(source, /"dontAsk"/);
  assert.match(source, /"--allowedTools"/);
  assert.match(source, /"--verbose"/);
});

test("spike scratch paths use the host canonical temporary root", (t) => {
  const scratch = createScratch("kanon-guard-canonical-", { repoRoot });
  t.after(() => {
    if (fs.existsSync(scratch.root)) removeScratch(scratch);
  });

  assert.equal(scratch.root, fs.realpathSync(scratch.root));
  assert.equal(scratch.workspace, fs.realpathSync(scratch.workspace));
  assert.equal(path.dirname(scratch.root), scratch.tempRoot);
  removeScratch(scratch);
});

test("spike scratch creation rejects an environment-selected repository temp root", async (t) => {
  const fixture = makeTemporaryDirectory(t, "kanon-guard-temp-root-");
  const repository = path.join(fixture, "repo");
  fs.mkdirSync(repository);
  const runtimeUrl = pathToFileURL(
    path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "lib",
      "runtime.mjs"
    )
  ).href;
  const script = [
    `const { createScratch } = await import(${JSON.stringify(runtimeUrl)});`,
    `try { createScratch("kanon-guard-hostile-", { repoRoot: ${JSON.stringify(repository)} });`,
    `process.stdout.write("created\\n"); } catch { process.stdout.write("rejected\\n"); }`
  ].join(" ");
  const result = await runProgramAsync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      env: {
        HOME: os.homedir(),
        USERPROFILE: os.homedir(),
        PATH: path.dirname(process.execPath),
        TMPDIR: repository,
        TMP: repository,
        TEMP: repository
      },
      timeoutMs: 2_000
    }
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "rejected\n");
  assert.deepEqual(fs.readdirSync(repository), []);
});

test(
  "Codex follow-up preflight is read-only and keeps trust and compaction Unknown",
  { skip: process.platform === "win32", timeout: 15_000 },
  async (t) => {
    const fixture = makeTemporaryDirectory(t, "kanon-guard-preflight-");
    const bin = path.join(fixture, "bin");
    const state = path.join(fixture, "state");
    fs.mkdirSync(bin);
    fs.mkdirSync(state);
    const fakeCodex = path.join(bin, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const stateRoot = ${JSON.stringify(state)};
if (process.env.KANON_SECRET_SENTINEL) {
  fs.writeFileSync(path.join(stateRoot, "secret-leaked"), "leaked\\n");
}
if (args[0] === "--version") {
  process.stdout.write("codex-cli 0.145.0\\n");
} else if (args[0] === "login" && args[1] === "status") {
  process.stderr.write("Logged in SENSITIVE_AUTH_EMAIL@example.invalid SENSITIVE_ORG_IDENTIFIER\\n");
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
  process.stdout.write(JSON.stringify({
    marketplaces: [{ name: "kanon-guard-spike-codex-suffix" }]
  }) + "\\n");
} else if (args[0] === "plugin" && args[1] === "list") {
  process.stdout.write(JSON.stringify({ installed: [] }) + "\\n");
} else {
  fs.writeFileSync(path.join(stateRoot, "mutation-attempted"), JSON.stringify(args));
  process.exitCode = 2;
}
`,
      { mode: 0o755 }
    );

    const report = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "results",
      `.preflight-test-${randomUUID()}.json`
    );
    t.after(() => fs.rmSync(report, { force: true }));
    const runner = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "codex-cli",
      "run.mjs"
    );
    const result = await runProgramAsync(
      process.execPath,
      [runner, "--execute", "--preflight-only", "--report", report],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          KANON_SECRET_SENTINEL: "must-not-cross-boundary",
          PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`
        },
        timeoutMs: 10_000
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(state, "secret-leaked")), false);
    assert.equal(fs.existsSync(path.join(state, "mutation-attempted")), false);
    const reportText = fs.readFileSync(report, "utf8");
    const parsed = JSON.parse(reportText);
    assert.equal(
      parsed.follow_up,
      "run-a1-persisted-trust-compaction-preflight"
    );
    assert.equal(parsed.claimed_surface.max_model_attempts, 0);
    assert.deepEqual(parsed.attempts, []);
    assert.equal(parsed.criteria.authentication, "proven");
    assert.equal(parsed.criteria.documented_state_preflight, "proven");
    assert.equal(parsed.criteria.persisted_trusted_hook, "unknown");
    assert.equal(parsed.criteria.actual_compaction, "unknown");
    assert.equal(parsed.criteria.host_state_unchanged, "proven");
    assert.equal(parsed.criteria.scratch_cleanup, "proven");
    assert.equal(parsed.criteria.execution_completed, "proven");
    assert.equal(parsed.disposition, "no-go");
    assert.ok(parsed.manual_verification.some((entry) => entry.includes("/hooks")));
    assert.ok(parsed.manual_verification.some((entry) => entry.includes("/compact")));
    assert.match(parsed.preflight_and_rollback.rollback_gap, /no command/);
    assert.doesNotMatch(
      reportText,
      /SENSITIVE_AUTH_EMAIL|SENSITIVE_ORG_IDENTIFIER|must-not-cross-boundary/
    );
    const sensitiveDigest = createHash("sha256")
      .update(
        "Logged in SENSITIVE_AUTH_EMAIL@example.invalid SENSITIVE_ORG_IDENTIFIER\n"
      )
      .digest("hex");
    assert.equal(reportText.includes(sensitiveDigest), false);
    for (const name of ["authentication", "marketplace-preflight", "plugin-preflight"]) {
      const summary = parsed.setup.find((entry) => entry.name === name).process;
      assert.equal(summary.output_redacted, true);
      assert.equal(Object.hasOwn(summary, "stdout_sha256"), false);
      assert.equal(Object.hasOwn(summary, "stderr_sha256"), false);
    }

    const runA2Report = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "results",
      `.run-a2-preflight-test-${randomUUID()}.json`
    );
    t.after(() => fs.rmSync(runA2Report, { force: true }));
    const runA2 = await runProgramAsync(
      process.execPath,
      [
        runner,
        "--execute",
        "--run-a2-preflight",
        "--report",
        runA2Report
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          KANON_SECRET_SENTINEL: "must-not-cross-boundary",
          PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`
        },
        timeoutMs: 10_000
      }
    );
    assert.equal(runA2.status, 0, runA2.stderr);
    const runA2Text = fs.readFileSync(runA2Report, "utf8");
    const runA2Parsed = JSON.parse(runA2Text);
    assert.equal(
      runA2Parsed.follow_up,
      "run-a2-persisted-trust-compaction-preflight"
    );
    assert.equal(runA2Parsed.claimed_surface.max_model_attempts, 0);
    assert.deepEqual(runA2Parsed.attempts, []);
    assert.equal(
      runA2Parsed.criteria.documented_state_preflight,
      "proven"
    );
    assert.equal(runA2Parsed.criteria.host_state_unchanged, "proven");
    assert.equal(fs.existsSync(path.join(state, "mutation-attempted")), false);
    assert.doesNotMatch(
      runA2Text,
      /SENSITIVE_AUTH_EMAIL|SENSITIVE_ORG_IDENTIFIER|must-not-cross-boundary/
    );
  }
);

test(
  "Codex runner rolls back its exact plugin state after SIGINT",
  { skip: process.platform === "win32", timeout: 20_000 },
  async (t) => {
    const fixture = makeTemporaryDirectory(t, "kanon-guard-runner-");
    const bin = path.join(fixture, "bin");
    const state = path.join(fixture, "state");
    fs.mkdirSync(bin);
    fs.mkdirSync(state);
    const fakeCodex = path.join(bin, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const stateRoot = ${JSON.stringify(state)};
const stateFile = (name) => path.join(stateRoot, name);
const touch = (name) => fs.writeFileSync(stateFile(name), "owned\\n");
const remove = (name) => {
  if (fs.existsSync(stateFile("remove-fail"))) {
    process.exitCode = 1;
    return;
  }
  fs.rmSync(stateFile(name), { force: true });
};
const list = (name) => process.stdout.write(
  fs.existsSync(stateFile(name))
    ? JSON.stringify([{ name: "kanon-guard-spike-codex" }]) + "\\n"
    : "[]\\n"
);

if (args[0] === "--version") {
  process.stdout.write("codex-cli 0.0.0-fake\\n");
} else if (args[0] === "login" && args[1] === "status") {
  process.stderr.write("Logged in SENSITIVE_AUTH_EMAIL@example.invalid SENSITIVE_ORG_IDENTIFIER\\n");
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "list") {
  list("marketplace");
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "add") {
  touch("marketplace");
  process.stdout.write("{}\\n");
} else if (args[0] === "plugin" && args[1] === "marketplace" && args[2] === "remove") {
  remove("marketplace");
  process.stdout.write("{}\\n");
} else if (args[0] === "plugin" && args[1] === "list") {
  list("plugin");
} else if (args[0] === "plugin" && args[1] === "add") {
  touch("plugin");
  process.stdout.write("{}\\n");
} else if (args[0] === "plugin" && args[1] === "remove") {
  remove("plugin");
  process.stdout.write("{}\\n");
} else if (args[0] === "exec") {
  if (process.env.KANON_SECRET_SENTINEL) touch("secret-leaked");
  touch("exec-started");
  setInterval(() => {}, 1_000);
} else {
  process.exitCode = 2;
}
`,
      { mode: 0o755 }
    );

    const report = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "results",
      `.signal-test-${randomUUID()}.json`
    );
    fs.mkdirSync(path.dirname(report), { recursive: true });
    t.after(() => fs.rmSync(report, { force: true }));
    const runner = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "codex-cli",
      "run.mjs"
    );
    const child = spawn(
      process.execPath,
      [runner, "--execute", "--report", report],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          KANON_SECRET_SENTINEL: "must-not-cross-boundary",
          PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const completion = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    });

    await waitForFile(path.join(state, "exec-started"), 10_000);
    assert.equal(fs.existsSync(path.join(state, "marketplace")), true);
    assert.equal(fs.existsSync(path.join(state, "plugin")), true);
    child.kill("SIGINT");
    const exit = await completion;

    assert.deepEqual(exit, { code: 130, signal: null }, stderr);
    assert.equal(fs.existsSync(path.join(state, "marketplace")), false);
    assert.equal(fs.existsSync(path.join(state, "plugin")), false);
    const result = JSON.parse(fs.readFileSync(report, "utf8"));
    const reportText = fs.readFileSync(report, "utf8");
    assert.equal(result.disposition, "no-go");
    assertGuardCriteria(result, ["lifecycle_cleanup"]);
    assert.equal(result.criteria.lifecycle_cleanup, "proven");
    assert.equal(result.criteria.scratch_cleanup, "proven");
    assert.equal(result.criteria.execution_completed, "unknown");
    assert.ok(
      result.known.some((entry) => entry.includes("lifecycle_cleanup"))
    );
    assert.ok(result.unknown.some((entry) => entry.includes("SIGINT")));
    assert.match(stdout, /"disposition":"no-go"/);
    assert.equal(fs.existsSync(path.join(state, "secret-leaked")), false);
    assert.doesNotMatch(
      reportText,
      /SENSITIVE_AUTH_EMAIL|SENSITIVE_ORG_IDENTIFIER|must-not-cross-boundary/
    );
    const authSummary = result.setup.find(
      (entry) => entry.name === "authentication"
    ).process;
    assert.equal(authSummary.output_redacted, true);
    assert.equal(Object.hasOwn(authSummary, "stdout_sha256"), false);
    assert.equal(Object.hasOwn(authSummary, "stderr_sha256"), false);

    fs.rmSync(path.join(state, "exec-started"), { force: true });
    fs.writeFileSync(path.join(state, "remove-fail"), "fail\n", "utf8");
    const failedReport = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "results",
      `.signal-cleanup-failure-${randomUUID()}.json`
    );
    t.after(() => fs.rmSync(failedReport, { force: true }));
    const failedChild = spawn(
      process.execPath,
      [runner, "--execute", "--report", failedReport],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          KANON_SECRET_SENTINEL: "must-not-cross-boundary",
          PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`
        },
        stdio: ["ignore", "ignore", "pipe"]
      }
    );
    let failedStderr = "";
    failedChild.stderr.on("data", (chunk) => {
      failedStderr += chunk;
    });
    const failedCompletion = new Promise((resolve, reject) => {
      failedChild.once("error", reject);
      failedChild.once("close", (code, signal) =>
        resolve({ code, signal })
      );
    });
    t.after(() => {
      if (failedChild.exitCode === null && failedChild.signalCode === null) {
        failedChild.kill("SIGKILL");
      }
    });

    await waitForFile(path.join(state, "exec-started"), 10_000);
    failedChild.kill("SIGINT");
    const failedExit = await failedCompletion;

    assert.deepEqual(failedExit, { code: 130, signal: null }, failedStderr);
    const failedResult = JSON.parse(fs.readFileSync(failedReport, "utf8"));
    assert.equal(failedResult.disposition, "no-go");
    assert.equal(failedResult.criteria.lifecycle_cleanup, "unknown");
    assert.ok(
      failedResult.unknown.some((entry) =>
        entry.includes("cleanup could not be directly verified")
      )
    );
    assert.equal(fs.existsSync(path.join(state, "marketplace")), true);
    assert.equal(fs.existsSync(path.join(state, "plugin")), true);
  }
);

test(
  "Claude runner removes its scratch evidence after SIGINT",
  { skip: process.platform === "win32", timeout: 15_000 },
  async (t) => {
    const fixture = makeTemporaryDirectory(t, "kanon-guard-claude-runner-");
    const bin = path.join(fixture, "bin");
    const state = path.join(fixture, "state");
    fs.mkdirSync(bin);
    fs.mkdirSync(state);
    const fakeClaude = path.join(bin, "claude");
    fs.writeFileSync(
      fakeClaude,
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const stateRoot = ${JSON.stringify(state)};
if (args[0] === "--version") {
  process.stdout.write("0.0.0-fake (Claude Code)\\n");
} else if (args[0] === "auth" && args[1] === "status") {
  process.stdout.write(JSON.stringify({
    loggedIn: true,
    email: "SENSITIVE_AUTH_EMAIL@example.invalid",
    organizationId: "SENSITIVE_ORG_IDENTIFIER"
  }) + "\\n");
} else if (args[0] === "--print") {
  if (process.env.KANON_SECRET_SENTINEL) {
    fs.writeFileSync(path.join(stateRoot, "secret-leaked"), "leaked\\n");
  }
  fs.writeFileSync(path.join(stateRoot, "scratch-cwd"), process.cwd());
  fs.writeFileSync(path.join(stateRoot, "exec-started"), "started\\n");
  setInterval(() => {}, 1_000);
} else {
  process.exitCode = 2;
}
`,
      { mode: 0o755 }
    );

    const report = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "results",
      `.claude-signal-test-${randomUUID()}.json`
    );
    fs.mkdirSync(path.dirname(report), { recursive: true });
    t.after(() => fs.rmSync(report, { force: true }));
    const runner = path.join(
      repoRoot,
      "spikes",
      "guard-feasibility",
      "claude-code",
      "run.mjs"
    );
    const child = spawn(
      process.execPath,
      [runner, "--execute", "--report", report],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          KANON_SECRET_SENTINEL: "must-not-cross-boundary",
          PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`
        },
        stdio: ["ignore", "ignore", "pipe"]
      }
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const completion = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    });

    await waitForFile(path.join(state, "exec-started"), 8_000);
    const scratchCwd = fs.readFileSync(
      path.join(state, "scratch-cwd"),
      "utf8"
    );
    assert.equal(fs.existsSync(scratchCwd), true);
    child.kill("SIGINT");
    const exit = await completion;

    assert.deepEqual(exit, { code: 130, signal: null }, stderr);
    assert.equal(fs.existsSync(scratchCwd), false);
    const result = JSON.parse(fs.readFileSync(report, "utf8"));
    const reportText = fs.readFileSync(report, "utf8");
    assert.equal(result.disposition, "no-go");
    assertGuardCriteria(result);
    assert.equal(result.criteria.scratch_cleanup, "proven");
    assert.equal(result.criteria.execution_completed, "unknown");
    assert.ok(
      result.known.some((entry) => entry.includes("scratch_cleanup"))
    );
    assert.ok(result.unknown.some((entry) => entry.includes("SIGINT")));
    assert.equal(fs.existsSync(path.join(state, "secret-leaked")), false);
    assert.doesNotMatch(
      reportText,
      /SENSITIVE_AUTH_EMAIL|SENSITIVE_ORG_IDENTIFIER|must-not-cross-boundary/
    );
    const sensitiveDigest = createHash("sha256")
      .update("SENSITIVE_AUTH_EMAIL@example.invalid")
      .digest("hex");
    assert.doesNotMatch(reportText, new RegExp(sensitiveDigest));
    const authSummary = result.setup.find(
      (entry) => entry.name === "authentication"
    ).process;
    assert.equal(authSummary.output_redacted, true);
    assert.equal(Object.hasOwn(authSummary, "stdout_sha256"), false);
    assert.equal(Object.hasOwn(authSummary, "stderr_sha256"), false);
  }
);

function hookInput(command) {
  return {
    session_id: "session-fixture",
    turn_id: "turn-fixture",
    cwd: path.join(os.tmpdir(), "kanon guard fixture"),
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command }
  };
}

function makeFixture(t) {
  const root = makeTemporaryDirectory(t, "kanon-guard-spike-");
  fs.mkdirSync(path.join(root, "plugin"));
  fs.mkdirSync(path.join(root, "plugin-data"));
  return root;
}

function makeTemporaryDirectory(t, prefix) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${path.basename(file)}.`);
}

async function waitForCondition(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertGuardCriteria(report, extras = []) {
  for (const criterion of [
    "discovery",
    "untrusted_hook",
    "trusted_hook",
    "shell_denial",
    "patch_denial",
    "rewrite_schema_and_effect",
    "metadata",
    "resume",
    "compaction",
    "disabled_hooks",
    "scratch_cleanup",
    "execution_completed",
    ...extras
  ]) {
    assert.equal(
      Object.hasOwn(report.criteria, criterion),
      true,
      `missing criterion ${criterion}`
    );
  }
  assert.ok(
    report.unknown.some((entry) => entry.includes("untrusted_hook")),
    "untrusted-hook uncertainty must gate the result"
  );
}
