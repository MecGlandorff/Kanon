import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectHook as inspectCodexHook } from "../spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/scripts/probe-core.mjs";
import { inspectHook as inspectClaudeHook } from "../spikes/guard-feasibility/claude-code/plugin/scripts/probe-core.mjs";
import {
  containedReportPath,
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
    path.join(repoRoot, "spikes/guard-feasibility/codex-cli/marketplace/marketplace.json"),
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
