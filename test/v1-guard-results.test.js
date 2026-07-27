import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const resultsRoot = path.join(
  repoRoot,
  "spikes",
  "guard-feasibility",
  "results"
);
const codexPath = path.join(
  resultsRoot,
  "codex-cli-0.145.0-macos.json"
);
const claudePath = path.join(
  resultsRoot,
  "claude-code-2.1.219-macos.json"
);
const claudeFollowUpPath = path.join(
  resultsRoot,
  "claude-code-2.1.219-macos-run-a1-follow-up.json"
);
const claudeFollowUp2Path = path.join(
  resultsRoot,
  "claude-code-2.1.219-macos-run-a1-follow-up-2.json"
);
const codexFollowUpPath = path.join(
  resultsRoot,
  "codex-cli-0.145.0-macos-run-a1-follow-up-persisted-trust-compaction-preflight.json"
);
const resultDocument = fs.readFileSync(
  path.join(repoRoot, "docs", "v1-guard-feasibility.md"),
  "utf8"
);
const codexText = fs.readFileSync(codexPath, "utf8");
const claudeText = fs.readFileSync(claudePath, "utf8");
const claudeFollowUpText = fs.readFileSync(claudeFollowUpPath, "utf8");
const claudeFollowUp2Text = fs.readFileSync(claudeFollowUp2Path, "utf8");
const codexFollowUpText = fs.readFileSync(codexFollowUpPath, "utf8");
const codex = JSON.parse(codexText);
const claude = JSON.parse(claudeText);
const claudeFollowUp = JSON.parse(claudeFollowUpText);
const claudeFollowUp2 = JSON.parse(claudeFollowUp2Text);
const codexFollowUp = JSON.parse(codexFollowUpText);

test("final Guard reports are hash-bound and retain no raw host payloads", () => {
  for (const [file, contents] of [
    [codexPath, codexText],
    [claudePath, claudeText]
  ]) {
    const digest = crypto
      .createHash("sha256")
      .update(contents)
      .digest("hex");
    assert.match(resultDocument, new RegExp(digest));
    assert.doesNotMatch(contents, new RegExp(escapeRegExp(repoRoot)));
    assert.doesNotMatch(contents, /KANON_GUARD_SPIKE/);
    assert.doesNotMatch(contents, /"stdout":|"stderr":/);
    assert.match(path.basename(file), /\.json$/);
  }
});

test("Codex result preserves every direct proof and every remaining gap", () => {
  assert.equal(codex.host, "codex-cli");
  assert.equal(codex.claimed_surface.cli_version, "codex-cli 0.145.0");
  assert.equal(codex.disposition, "no-go");
  assert.deepEqual(codex.criteria, {
    discovery: "proven",
    untrusted_hook: "likely",
    trusted_hook: "unknown",
    shell_denial: "proven",
    patch_denial: "proven",
    rewrite_schema_and_effect: "proven",
    metadata: "proven",
    resume: "proven",
    compaction: "unknown",
    disabled_hooks: "likely",
    lifecycle_cleanup: "proven",
    scratch_cleanup: "proven",
    execution_completed: "proven"
  });

  const attempts = new Map(
    codex.attempts.map((attempt) => [attempt.name, attempt])
  );
  assert.deepEqual(Array.from(attempts.keys()), [
    "untrusted-hook",
    "shell-deny",
    "patch-deny",
    "shell-rewrite",
    "hooks-disabled",
    "resume-deny",
    "compaction-attempt"
  ]);
  for (const attempt of attempts.values()) {
    assert.equal(attempt.process.status, 0);
    assert.equal(attempt.process.timed_out, false);
    assert.equal(attempt.process.overflowed, false);
  }

  const untrusted = attempts.get("untrusted-hook");
  assert.equal(untrusted.observation_count, 0);
  assert.equal(untrusted.side_effect_exists, true);

  const shell = attempts.get("shell-deny");
  const shellHook = shell.observations.find(
    (entry) => entry.tool_name === "Bash"
  );
  assert.equal(shellHook.decision, "deny");
  assert.equal(shell.side_effect_exists, false);
  assert.equal(shellHook.session_id_present, true);
  assert.equal(shellHook.turn_id_present, true);
  assert.equal(shellHook.cwd_matches_workspace, true);
  assert.equal(shellHook.plugin_root_present, true);
  assert.equal(shellHook.plugin_data_writable, true);
  assert.equal(shellHook.plugin_data_created_directory_count, 2);

  const patch = attempts.get("patch-deny");
  assert.ok(
    patch.observations.some(
      (entry) =>
        entry.tool_name === "apply_patch" &&
        entry.decision === "deny"
    )
  );
  assert.equal(patch.side_effect_exists, false);

  const rewrite = attempts.get("shell-rewrite");
  assert.ok(
    rewrite.observations.some(
      (entry) =>
        entry.tool_name === "Bash" &&
        entry.decision === "rewrite"
    )
  );
  assert.equal(rewrite.original_side_effect_exists, false);
  assert.equal(rewrite.rewritten_side_effect_exists, true);

  const disabled = attempts.get("hooks-disabled");
  assert.equal(disabled.observation_count, 0);
  assert.equal(disabled.side_effect_exists, true);

  const resume = attempts.get("resume-deny");
  assert.ok(
    resume.observations.some(
      (entry) =>
        entry.hook_event_name === "SessionStart" &&
        entry.session_start_source === "resume"
    )
  );
  assert.equal(resume.side_effect_exists, false);

  const compaction = attempts.get("compaction-attempt");
  assert.ok(
    compaction.observations.every(
      (entry) => entry.session_start_source !== "compact"
    )
  );
  assert.ok(
    codex.unknown.some(
      (entry) =>
        entry.includes("compaction") &&
        entry.includes("trusted_hook")
    )
  );
  assert.ok(
    codex.cleanup
      .filter((entry) => entry.process)
      .every((entry) => entry.process.status === 0)
  );
});

test("Claude result keeps authentication-blocked behavior Unknown", () => {
  assert.equal(claude.host, "claude-code");
  assert.equal(
    claude.claimed_surface.cli_version,
    "2.1.219 (Claude Code)"
  );
  assert.equal(claude.disposition, "no-go");
  assert.deepEqual(claude.attempts, []);
  assert.deepEqual(claude.cleanup, []);
  assert.equal(
    claude.setup.find((entry) => entry.name === "authentication")
      .process.status,
    1
  );
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
    "disabled_hooks"
  ]) {
    assert.equal(claude.criteria[criterion], "unknown");
  }
  assert.equal(claude.criteria.scratch_cleanup, "not-run");
  assert.equal(claude.criteria.execution_completed, "proven");
  assert.match(
    resultDocument,
    /Authentication blocked observation; it is not evidence that Claude Code cannot/
  );
});

test("Run A.1 follow-up reports are additive, redacted, and hash-bound", () => {
  for (const [file, contents, report] of [
    [claudeFollowUpPath, claudeFollowUpText, claudeFollowUp],
    [claudeFollowUp2Path, claudeFollowUp2Text, claudeFollowUp2],
    [codexFollowUpPath, codexFollowUpText, codexFollowUp]
  ]) {
    const digest = crypto
      .createHash("sha256")
      .update(contents)
      .digest("hex");
    assert.match(resultDocument, new RegExp(digest));
    assert.doesNotMatch(contents, new RegExp(escapeRegExp(repoRoot)));
    assert.doesNotMatch(contents, /KANON_GUARD_SPIKE/);
    assert.doesNotMatch(contents, /"stdout":|"stderr":/);
    assert.doesNotMatch(
      contents,
      /email|organization(?:Id|_id)|credential|access[_-]?token/i
    );
    assert.equal(report.schema, "kanon-guard-feasibility-report-v2");
    assert.equal(report.disposition, "no-go");
    assert.match(path.basename(file), /0\.145\.0|2\.1\.219/);
    const auth = report.setup.find((entry) => entry.name === "authentication");
    assert.equal(auth.process.output_redacted, true);
    assert.equal(Object.hasOwn(auth.process, "stdout_sha256"), false);
    assert.equal(Object.hasOwn(auth.process, "stderr_sha256"), false);
  }

  assert.equal(claudeFollowUp.host, "claude-code");
  assert.equal(claudeFollowUp.setup.find(
    (entry) => entry.name === "authentication"
  ).logged_in, true);
  assert.equal(claudeFollowUp.criteria.discovery, "proven");
  assert.equal(claudeFollowUp.criteria.scratch_cleanup, "proven");
  assert.equal(claudeFollowUp.attempts.length, 5);

  assert.equal(claudeFollowUp2.host, "claude-code");
  assert.equal(claudeFollowUp2.setup.find(
    (entry) => entry.name === "authentication"
  ).logged_in, true);
  assert.equal(claudeFollowUp2.criteria.discovery, "proven");
  assert.equal(claudeFollowUp2.criteria.scratch_cleanup, "proven");
  assert.equal(claudeFollowUp2.criteria.shell_denial, "unknown");
  assert.equal(claudeFollowUp2.criteria.patch_denial, "unknown");
  assert.equal(claudeFollowUp2.criteria.compaction, "unknown");
  assert.equal(claudeFollowUp2.attempts.length, 6);

  assert.equal(codexFollowUp.host, "codex-cli");
  assert.equal(codexFollowUp.claimed_surface.max_model_attempts, 0);
  assert.deepEqual(codexFollowUp.attempts, []);
  assert.equal(codexFollowUp.criteria.authentication, "proven");
  assert.equal(
    codexFollowUp.criteria.documented_state_preflight,
    "proven"
  );
  assert.equal(codexFollowUp.criteria.host_state_unchanged, "proven");
  assert.equal(codexFollowUp.criteria.persisted_trusted_hook, "unknown");
  assert.equal(codexFollowUp.criteria.actual_compaction, "unknown");
  assert.match(codexFollowUp.preflight_and_rollback.rollback_gap, /no command/);
  assert.ok(
    codexFollowUp.manual_verification.some((entry) => entry.includes("/hooks"))
  );
  assert.ok(
    codexFollowUp.manual_verification.some((entry) => entry.includes("/compact"))
  );
  assert.match(
    resultDocument,
    /codex plugin add kanon-guard-spike-codex@kanon-guard-spike-codex --json/
  );
  assert.match(
    resultDocument,
    /codex plugin remove kanon-guard-spike-codex@kanon-guard-spike-codex --json/
  );
  assert.match(
    resultDocument,
    /launching the TUI directly from a broad shell environment is not approved/
  );
});

test("slice 3 selects neither Guard nor notice and stops before slice 4", () => {
  assert.match(resultDocument, /No `guard` claim is made for either host/);
  assert.match(resultDocument, /No `notice` mode is selected/);
  assert.match(resultDocument, /Slices 1 through 3 are complete/);
  assert.match(
    resultDocument,
    /Do not begin the dual-manifest production plugin skeleton/
  );
  assert.match(resultDocument, /Run A\.1 hard stop/);
  assert.match(resultDocument, /does not start product slice 4/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
