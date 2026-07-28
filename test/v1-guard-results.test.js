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
const codexRunA2PreflightPath = path.join(
  resultsRoot,
  "codex-cli-0.145.0-macos-run-a2-persisted-trust-compaction-preflight.json"
);
const codexRunA2LauncherPath = path.join(
  resultsRoot,
  "codex-cli-0.145.0-macos-run-a2-supervised-persisted-trust-real-compaction.json"
);
const codexRunA2PostCleanupPath = path.join(
  resultsRoot,
  "codex-cli-0.145.0-macos-run-a2-post-cleanup.json"
);
const codexRunA2OutcomePath = path.join(
  resultsRoot,
  "codex-cli-0.145.0-macos-run-a2-supervised-outcome.json"
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
const codexRunA2PreflightText = fs.readFileSync(
  codexRunA2PreflightPath,
  "utf8"
);
const codexRunA2LauncherText = fs.readFileSync(
  codexRunA2LauncherPath,
  "utf8"
);
const codexRunA2PostCleanupText = fs.readFileSync(
  codexRunA2PostCleanupPath,
  "utf8"
);
const codexRunA2OutcomeText = fs.readFileSync(
  codexRunA2OutcomePath,
  "utf8"
);
const codex = JSON.parse(codexText);
const claude = JSON.parse(claudeText);
const claudeFollowUp = JSON.parse(claudeFollowUpText);
const claudeFollowUp2 = JSON.parse(claudeFollowUp2Text);
const codexFollowUp = JSON.parse(codexFollowUpText);
const codexRunA2Preflight = JSON.parse(codexRunA2PreflightText);
const codexRunA2Launcher = JSON.parse(codexRunA2LauncherText);
const codexRunA2PostCleanup = JSON.parse(codexRunA2PostCleanupText);
const codexRunA2Outcome = JSON.parse(codexRunA2OutcomeText);

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

test("Run A.2 reports are additive, sanitized, and hash-bound", () => {
  for (const [file, contents] of [
    [codexRunA2PreflightPath, codexRunA2PreflightText],
    [codexRunA2LauncherPath, codexRunA2LauncherText],
    [codexRunA2PostCleanupPath, codexRunA2PostCleanupText],
    [codexRunA2OutcomePath, codexRunA2OutcomeText]
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
    assert.match(path.basename(file), /codex-cli-0\.145\.0-macos-run-a2/);
  }

  assert.equal(
    codexRunA2Outcome.evidence_reports[0].sha256,
    crypto.createHash("sha256").update(codexRunA2PreflightText).digest("hex")
  );
  assert.equal(
    codexRunA2Outcome.evidence_reports[1].sha256,
    crypto.createHash("sha256").update(codexRunA2LauncherText).digest("hex")
  );
  assert.equal(
    codexRunA2Outcome.evidence_reports[2].sha256,
    crypto
      .createHash("sha256")
      .update(codexRunA2PostCleanupText)
      .digest("hex")
  );
});

test("Run A.2 stops safely at unauthorized directory trust and retains no-go", () => {
  assert.equal(codexRunA2Preflight.claimed_surface.max_model_attempts, 0);
  assert.deepEqual(codexRunA2Preflight.attempts, []);
  assert.equal(codexRunA2Preflight.criteria.authentication, "proven");
  assert.equal(
    codexRunA2Preflight.criteria.documented_state_preflight,
    "proven"
  );
  assert.equal(codexRunA2Preflight.criteria.host_state_unchanged, "proven");

  assert.equal(
    codexRunA2Launcher.provenance.source_commit,
    "08de9290db031b49119f1dd33522db65573f2e48"
  );
  assert.equal(
    codexRunA2Launcher.claimed_surface.cli_version,
    "codex-cli 0.145.0"
  );
  assert.equal(codexRunA2Launcher.fixture.exact_identity_verified, true);
  assert.deepEqual(codexRunA2Launcher.criteria, {
    source_binding: "proven",
    authentication: "proven",
    documented_state_preflight: "proven",
    fixture_identity: "proven",
    installed_identity: "proven",
    session_configuration: "unknown",
    persisted_exact_hash_trust: "unknown",
    pretooluse_denial: "unknown",
    marker_absence: "proven",
    actual_compaction: "unknown",
    execution_bounds: "unknown",
    documented_cleanup: "proven",
    scratch_cleanup: "proven",
    execution_completed: "proven"
  });
  assert.equal(codexRunA2Launcher.interactive.observation_count, 0);
  assert.deepEqual(codexRunA2Launcher.interactive.observations, []);
  assert.equal(codexRunA2Launcher.interactive.marker_absent, true);
  assert.equal(codexRunA2Launcher.disposition, "no-go");
  for (const name of [
    "plugin-remove",
    "marketplace-remove",
    "plugin-cleanup-verification",
    "marketplace-cleanup-verification"
  ]) {
    const cleanup = codexRunA2Launcher.cleanup.find(
      (entry) => entry.name === name
    );
    assert.equal(cleanup.process.status, 0);
  }
  assert.equal(
    codexRunA2Launcher.cleanup.find(
      (entry) => entry.name === "plugin-cleanup-verification"
    ).exact_name_absent,
    true
  );
  assert.equal(
    codexRunA2Launcher.cleanup.find(
      (entry) => entry.name === "marketplace-cleanup-verification"
    ).exact_name_absent,
    true
  );
  assert.equal(codexRunA2Launcher.cleanup.at(-1).removed, true);

  assert.equal(
    codexRunA2Outcome.direct_observations.unexpected_project_trust_prompt_observed,
    true
  );
  assert.equal(codexRunA2Outcome.direct_observations.project_trust_declined, true);
  assert.equal(
    codexRunA2Outcome.direct_observations.project_trust_persisted_by_run,
    false
  );
  assert.equal(codexRunA2Outcome.direct_observations.model_turns_submitted, 0);
  assert.equal(codexRunA2Outcome.direct_observations.hooks_ui_reached, false);
  assert.equal(
    codexRunA2Outcome.direct_observations.denial_probe_submitted,
    false
  );
  assert.equal(
    codexRunA2Outcome.direct_observations.real_compact_invoked,
    false
  );
  assert.equal(codexRunA2Outcome.criteria.persisted_exact_hash_trust, "unknown");
  assert.equal(codexRunA2Outcome.criteria.pretooluse_denial, "unknown");
  assert.equal(codexRunA2Outcome.criteria.marker_absence, "proven");
  assert.equal(codexRunA2Outcome.criteria.actual_compaction, "unknown");
  assert.equal(codexRunA2Outcome.criteria.documented_cleanup, "proven");
  assert.equal(
    codexRunA2Outcome.direct_observations.cleanup_completed_before_wrapper_interrupt,
    true
  );
  assert.equal(
    codexRunA2Outcome.direct_observations.report_emitted_before_wrapper_interrupt,
    true
  );
  assert.equal(
    codexRunA2Outcome.direct_observations.launcher_wrapper_terminal_exit_normal,
    false
  );
  assert.equal(codexRunA2Outcome.disposition, "no-go");
  assert.ok(
    codexRunA2Outcome.stale_or_suspicious.some((entry) =>
      entry.includes("intended-sequence label")
    )
  );
});

test("Run A.2 post-cleanup independently proves exact-name absence", () => {
  assert.equal(codexRunA2PostCleanup.claimed_surface.max_model_attempts, 0);
  assert.deepEqual(codexRunA2PostCleanup.attempts, []);
  assert.equal(
    codexRunA2PostCleanup.criteria.documented_state_preflight,
    "proven"
  );
  assert.equal(codexRunA2PostCleanup.criteria.host_state_unchanged, "proven");
  assert.equal(codexRunA2PostCleanup.criteria.scratch_cleanup, "proven");
  for (const name of ["marketplace-preflight", "plugin-preflight"]) {
    const check = codexRunA2PostCleanup.setup.find(
      (entry) => entry.name === name
    );
    assert.equal(check.output_valid_json, true);
    assert.equal(check.exact_name_absent, true);
  }
  assert.match(
    codexRunA2Outcome.required_decision_before_run_b,
    /select a documented notice-mode revision/
  );
  assert.match(resultDocument, /Run A\.2 ends here regardless of\s+outcome/);
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

test("Run B additively selects advisory notice without rewriting host evidence", () => {
  assert.match(resultDocument, /Run B approved notice-mode product decision/);
  assert.match(resultDocument, /\| Codex CLI \| `notice` \| `false` \|/);
  assert.match(resultDocument, /\| Claude Code CLI \| `notice` \| `false` \|/);
  assert.match(
    resultDocument,
    /surfaces context readiness and available receipt state through\s+> advisory notice/
  );
  assert.match(
    resultDocument,
    /must never deny, rewrite, suppress, or\s+auto-approve a host operation/
  );
  assert.match(
    resultDocument,
    /unobservable hook state remains `Unknown`/
  );
  assert.match(
    resultDocument,
    /Hard Guard remains future experimental work outside the public v1 capability\s+contract/
  );
  assert.match(
    resultDocument,
    /historical result files remain immutable/
  );

  for (const [contents, digest] of [
    [codexText, "47dad5a64845242ed99ea3873c024ef285350cb3b2e154c50549c748bfb51ec1"],
    [claudeText, "8a12575b0f0841cc30c880ce8855364cae8b9a9de3485fc26f2029e7cbdf5182"],
    [claudeFollowUpText, "537bcc0791cf0ed7b4b1da3305169e4e67cdc0064c86f4b5ae9a97d03ead8c6b"],
    [claudeFollowUp2Text, "85225891fb1f0106c0daf0bef05aff504abe02adb3a605771ad4564e30b647c4"],
    [codexFollowUpText, "3950b7db9a89e8c34e056e9fbec56f944cb9325aa4910f9a9c362d3664b168d6"],
    [codexRunA2PreflightText, "05e354743e58ec902602f19de29d415a8ac25a21fc68a59b23f73c744768b693"],
    [codexRunA2LauncherText, "cb9fb5ad3973f7f7f305a29cf93c378d594a22547f05d2a3e9c3e47f08295b2d"],
    [codexRunA2PostCleanupText, "067810ce08aa022ebbe385cc3e1065fcf689f33a015cda63dd6ddc74d39b4537"],
    [codexRunA2OutcomeText, "456be74f897b3a30cf8828db96ca8db639432f51765423dadf5a79724b5dbfc9"]
  ]) {
    assert.equal(
      crypto.createHash("sha256").update(contents).digest("hex"),
      digest
    );
  }
});

test("Run B recovery removes automatic lifecycle notice without rewriting evidence", () => {
  assert.match(resultDocument, /Run B recovery lifecycle-notice amendment/);
  assert.match(resultDocument, /\*\*Date:\*\* 2026-07-28/);
  assert.match(
    resultDocument,
    /lifecycle-hook declarations are optional and host-specific/
  );
  assert.match(
    resultDocument,
    /production artifact ships no automatic lifecycle notice for Codex CLI\s+or Claude Code/
  );
  assert.match(
    resultDocument,
    /notice appears only in explicit skill and status output/
  );
  assert.match(
    resultDocument,
    /unavailable host hook introspection remains `Unknown`/
  );
  assert.match(
    resultDocument,
    /historical result files remain immutable|does not alter\s+the Run A, A\.1, or A\.2 reports/
  );
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
