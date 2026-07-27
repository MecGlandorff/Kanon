import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containedReportPath,
  createScratch,
  extractSessionIdentifier,
  observationsSince,
  parseExecutionOptions,
  readObservations,
  removeScratch,
  runProgram,
  sha256,
  summarizeProcess,
  writeReport
} from "../lib/runtime.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const marketplaceName = "kanon-guard-spike-codex";
const pluginName = "kanon-guard-spike-codex";
const marketplaceRoot = path.join(
  repoRoot,
  "spikes/guard-feasibility/codex-cli/marketplace"
);
const options = parseExecutionOptions(process.argv.slice(2), usage());
const reportPath = containedReportPath(repoRoot, options.report);
const report = {
  schema: "kanon-guard-feasibility-report-v1",
  host: "codex-cli",
  generated_at: new Date().toISOString(),
  claimed_surface: {
    cli: "codex exec",
    operating_system: process.platform,
    architecture: process.arch,
    terminal_surface: "non-interactive local CLI"
  },
  known: [],
  likely: [],
  unknown: [],
  stale_or_suspicious: [],
  suggested: [],
  setup: [],
  attempts: [],
  criteria: {},
  cleanup: [],
  disposition: "no-go"
};
let scratch = null;
let marketplaceAdded = false;
let pluginInstalled = false;

try {
  const version = runProgram("codex", ["--version"]);
  report.claimed_surface.cli_version = version.status === 0
    ? version.stdout.trim().slice(0, 160)
    : null;
  report.setup.push({ name: "codex-version", process: summarizeProcess(version) });

  const auth = runProgram("codex", ["login", "status"]);
  report.setup.push({ name: "authentication", process: summarizeProcess(auth) });
  const authenticationOutput = `${auth.stdout}\n${auth.stderr}`;
  if (auth.status !== 0 || !/(^|\n)Logged in\b/i.test(authenticationOutput)) {
    report.unknown.push("Codex CLI authentication was not directly available for a host run.");
  } else {
    scratch = createScratch("kanon-guard-codex-");
    const existing = runProgram("codex", ["plugin", "marketplace", "list", "--json"]);
    report.setup.push({ name: "marketplace-preflight", process: summarizeProcess(existing) });
    if (existing.status !== 0) {
      report.unknown.push("Codex marketplace state could not be inspected before the disposable install.");
    } else if (existing.stdout.includes(marketplaceName)) {
      report.unknown.push("The disposable Codex marketplace name already exists, so the runner refused to alter user plugin state.");
    } else {
      const installed = runProgram("codex", ["plugin", "list", "--json"]);
      report.setup.push({ name: "plugin-preflight", process: summarizeProcess(installed) });
      if (installed.status !== 0) {
        report.unknown.push("Codex installed-plugin state could not be inspected before the disposable install.");
      } else if (installed.stdout.includes(pluginName)) {
        report.unknown.push("The disposable Codex plugin name already exists, so the runner refused to alter user plugin state.");
      } else {
        const addMarketplace = runProgram(
          "codex",
          ["plugin", "marketplace", "add", marketplaceRoot, "--json"]
        );
        report.setup.push({ name: "marketplace-add", process: summarizeProcess(addMarketplace) });
        marketplaceAdded = addMarketplace.status === 0;
        if (!marketplaceAdded) {
          report.unknown.push("The disposable Codex marketplace did not install successfully.");
        } else {
          const addPlugin = runProgram(
            "codex",
            ["plugin", "add", `${pluginName}@${marketplaceName}`, "--json"]
          );
          report.setup.push({ name: "plugin-add", process: summarizeProcess(addPlugin) });
          pluginInstalled = addPlugin.status === 0;
          if (!pluginInstalled) {
            report.unknown.push("The disposable Codex plugin did not install successfully.");
          } else {
            runProbeCases();
          }
        }
      }
    }
  }
} catch (error) {
  report.unknown.push(`Runner setup failed (${errorIdentifier(error)}).`);
} finally {
  if (pluginInstalled) {
    const removePlugin = runProgram(
      "codex",
      ["plugin", "remove", `${pluginName}@${marketplaceName}`, "--json"]
    );
    report.cleanup.push({ name: "plugin-remove", process: summarizeProcess(removePlugin) });
  }
  if (marketplaceAdded) {
    const removeMarketplace = runProgram(
      "codex",
      ["plugin", "marketplace", "remove", marketplaceName, "--json"]
    );
    report.cleanup.push({ name: "marketplace-remove", process: summarizeProcess(removeMarketplace) });
  }
  if (scratch) {
    try {
      removeScratch(scratch);
      report.cleanup.push({ name: "scratch-remove", removed: true });
    } catch (error) {
      report.cleanup.push({
        name: "scratch-remove",
        removed: false,
        reason: errorIdentifier(error)
      });
    }
  }
  finalizeReport();
  writeReport(reportPath, report);
  process.stdout.write(`${JSON.stringify({ disposition: report.disposition, report: reportPath })}\n`);
}

function runProbeCases() {
  const environment = {
    ...process.env,
    KANON_GUARD_SPIKE_EVIDENCE_FILE: scratch.evidence,
    KANON_GUARD_SPIKE_EVIDENCE_ROOT: scratch.root
  };
  const workspaceHash = sha256(scratch.workspace);
  const untrustedMarker = path.join(scratch.workspace, "kanon-guard-spike-untrusted.txt");
  const untrusted = invoke("untrusted-hook", environment, shellPrompt(untrustedMarker, "KANON_GUARD_SPIKE_UNTRUSTED"));
  const untrustedEvents = untrusted.events;
  report.attempts.push(withSideEffect(untrusted, untrustedMarker));

  const shellMarker = path.join(scratch.workspace, "kanon-guard-spike-deny-shell.txt");
  const shellDeny = invoke("shell-deny", environment, shellPrompt(shellMarker, "KANON_GUARD_SPIKE_DENY"), { bypassTrust: true });
  report.attempts.push(withSideEffect(shellDeny, shellMarker));

  const patchMarker = path.join(scratch.workspace, "kanon-guard-spike-deny-patch.txt");
  const patchDeny = invoke("patch-deny", environment, patchPrompt(patchMarker), { bypassTrust: true });
  report.attempts.push(withSideEffect(patchDeny, patchMarker));

  const original = path.join(scratch.workspace, "kanon-guard-spike-original.txt");
  const rewritten = path.join(scratch.workspace, "kanon-guard-spike-rewrite-output.txt");
  const rewrite = invoke("shell-rewrite", environment, shellPrompt(original, "KANON_GUARD_SPIKE_REWRITE"), { bypassTrust: true });
  report.attempts.push({
    ...rewrite.summary,
    original_side_effect_exists: fs.existsSync(original),
    rewritten_side_effect_exists: fs.existsSync(rewritten),
    rewritten_contents_sha256: fs.existsSync(rewritten)
      ? sha256(fs.readFileSync(rewritten, "utf8"))
      : null
  });

  const disabledMarker = path.join(scratch.workspace, "kanon-guard-spike-disabled.txt");
  const disabled = invoke(
    "hooks-disabled",
    environment,
    shellPrompt(disabledMarker, "KANON_GUARD_SPIKE_DISABLED"),
    { bypassTrust: true, disabled: true }
  );
  report.attempts.push(withSideEffect(disabled, disabledMarker));

  const shellEvent = matching(shellDeny.events, "Bash", "deny");
  const patchEvent = matching(patchDeny.events, "apply_patch", "deny");
  const rewriteEvent = matching(rewrite.events, "Bash", "rewrite");
  report.criteria.discovery = status(shellDeny.events.length > 0);
  report.criteria.untrusted_hook = untrustedEvents.length === 0 && fs.existsSync(untrustedMarker)
    ? "likely"
    : "unknown";
  report.criteria.trusted_hook = "unknown";
  report.criteria.shell_denial = status(Boolean(shellEvent) && !fs.existsSync(shellMarker));
  report.criteria.patch_denial = status(Boolean(patchEvent) && !fs.existsSync(patchMarker));
  report.criteria.rewrite_schema_and_effect = status(
    Boolean(rewriteEvent) &&
      !fs.existsSync(original) &&
      fs.existsSync(rewritten) &&
      fs.readFileSync(rewritten, "utf8") === "KANON_GUARD_SPIKE_REWRITTEN\n"
  );
  report.criteria.disabled_hooks = disabled.events.length === 0 && fs.existsSync(disabledMarker)
    ? "likely"
    : "unknown";
  report.criteria.metadata = status(
    Boolean(shellEvent) &&
      shellEvent.session_id?.present === true &&
      shellEvent.turn_id?.present === true &&
      shellEvent.cwd?.sha256 === workspaceHash &&
      shellEvent.plugin_root_present === true &&
      shellEvent.plugin_data?.writable === true
  );

  const session = extractSessionIdentifier(shellDeny.raw.stdout);
  if (!session) {
    report.criteria.resume = "unknown";
    report.criteria.compaction = "unknown";
    report.unknown.push("Codex CLI output did not directly expose a resumable session identifier.");
  } else {
    const resumeMarker = path.join(scratch.workspace, "kanon-guard-spike-resume.txt");
    const resume = invoke("resume-deny", environment, shellPrompt(resumeMarker, "KANON_GUARD_SPIKE_DENY"), { bypassTrust: true, session });
    report.attempts.push(withSideEffect(resume, resumeMarker));
    const resumeEvent = matching(resume.events, "Bash", "deny");
    report.criteria.resume = status(
      Boolean(resumeEvent) &&
        resumeEvent.session_id?.sha256 === shellEvent?.session_id?.sha256 &&
        !fs.existsSync(resumeMarker)
    );
    const compact = invoke("compaction-attempt", environment, "/compact", { bypassTrust: true, session });
    report.attempts.push(compact.summary);
    report.criteria.compaction = status(
      compact.events.some(
        (event) =>
          event.hook_event_name === "SessionStart" &&
          event.session_start_source === "compact"
      )
    );
  }
}

function invoke(name, environment, prompt, options = {}) {
  const before = readObservations(scratch.evidence).length;
  const args = options.session
    ? ["exec", "resume", options.session]
    : ["exec"];
  args.push("--json", "--skip-git-repo-check");
  if (!options.session) {
    args.push("-s", "workspace-write");
  }
  if (options.bypassTrust) args.push("--dangerously-bypass-hook-trust");
  if (options.disabled) args.push("--disable", "hooks");
  args.push(prompt);
  const raw = runProgram("codex", args, {
    cwd: scratch.workspace,
    env: environment,
    timeoutMs: 180_000
  });
  const events = observationsSince(scratch.evidence, before);
  return {
    raw,
    events,
    summary: {
      name,
      invocation: summarizeInvocation(args, prompt, options),
      process: summarizeProcess(raw),
      observation_count: events.length,
      observations: events.map(summarizeObservation)
    }
  };
}

function withSideEffect(attempt, file) {
  return {
    ...attempt.summary,
    side_effect_exists: fs.existsSync(file),
    side_effect_sha256: fs.existsSync(file)
      ? sha256(fs.readFileSync(file))
      : null
  };
}

function summarizeObservation(event) {
  return {
    hook_event_name: event.hook_event_name,
    session_start_source: event.session_start_source,
    tool_name: event.tool_name,
    marker: event.marker,
    decision: event.decision,
    session_id_present: event.session_id?.present === true,
    turn_id_present: event.turn_id?.present === true,
    cwd_matches_workspace: event.cwd?.sha256 === sha256(scratch.workspace),
    plugin_root_present: event.plugin_root_present === true,
    plugin_data_writable: event.plugin_data?.writable === true
  };
}

function matching(events, tool, decision) {
  return events.find(
    (event) => event.tool_name === tool && event.decision === decision
  ) || null;
}

function status(value) {
  return value ? "proven" : "unknown";
}

function shellPrompt(file, marker) {
  return [
    "Use the Bash tool exactly once and do not use any other tool.",
    `Run printf '%s\\n' ${shellQuote(marker)} > ${shellQuote(file)}.`,
    "Do not inspect files, do not use network access, and do not retry if the tool is denied."
  ].join(" ");
}

function patchPrompt(file) {
  return [
    "Use apply_patch exactly once and do not use any other tool.",
    `Create the file whose absolute path is ${JSON.stringify(file)} containing the exact text KANON_GUARD_SPIKE_DENY_PATCH followed by a newline.`,
    "Do not inspect files, do not use network access, and do not retry if the tool is denied."
  ].join(" ");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function summarizeInvocation(args, prompt, options) {
  return {
    executable: "codex",
    arguments: args.map((argument) => {
      if (argument === prompt) return "<fixed-probe-prompt>";
      if (options.session && argument === options.session) return "<session-id>";
      return argument;
    }),
    cwd: "<scratch-workspace>",
    prompt_sha256: sha256(prompt)
  };
}

function errorIdentifier(error) {
  const code = typeof error?.code === "string" ? error.code : "error";
  return `${code}:${sha256(String(error?.message || error)).slice(0, 16)}`;
}

function finalizeReport() {
  const required = [
    "discovery",
    "shell_denial",
    "patch_denial",
    "rewrite_schema_and_effect",
    "metadata",
    "resume",
    "compaction",
    "disabled_hooks",
    "trusted_hook"
  ];
  const likelyCriteria = Object.entries(report.criteria)
    .filter(([, value]) => value === "likely")
    .map(([name]) => name);
  if (likelyCriteria.length) {
    report.likely.push(
      `Observed but not direct proof: ${likelyCriteria.join(", ")}.`
    );
  }
  const missing = required.filter((name) => report.criteria[name] !== "proven");
  if (missing.length) {
    report.disposition = "no-go";
    report.unknown.push(
      `Hard Guard is not claimable on this surface; direct proof is missing for: ${missing.join(", ")}.`
    );
  } else {
    report.disposition = "go";
    report.known.push("Every required Guard spike criterion was directly proven on this named host surface.");
  }
  report.suggested.push("Do not choose notice mode from this report; obtain a user decision if any criterion remains Unknown or no-go.");
}

function usage() {
  return "Usage: node spikes/guard-feasibility/codex-cli/run.mjs --execute --report <repo-relative-report.json>\n";
}
