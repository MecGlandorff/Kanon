import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containedReportPath,
  createMinimalHostEnvironment,
  createScratch,
  extractSessionIdentifier,
  observationsSince,
  parseExecutionOptions,
  readObservations,
  removeScratch,
  resolveTrustedExecutable,
  runProgramAsync,
  sha256,
  summarizeProcess,
  summarizeSensitiveProcess,
  writeReport
} from "../lib/runtime.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const pluginRoot = path.join(
  repoRoot,
  "spikes/guard-feasibility/claude-code/plugin"
);
const options = parseExecutionOptions(process.argv.slice(2), usage());
const reportPath = containedReportPath(repoRoot, options.report);
const report = {
  schema: "kanon-guard-feasibility-report-v2",
  follow_up: "run-a1-hardened",
  host: "claude-code",
  generated_at: new Date().toISOString(),
  claimed_surface: {
    cli: "claude --plugin-dir",
    operating_system: process.platform,
    architecture: process.arch,
    terminal_surface: "non-interactive local CLI",
    permission_contract:
      "dontAsk, one built-in tool, and an exact Bash allow rule only when a fixed scratch command must be observable",
    model_alias: "haiku",
    effort: "low",
    max_budget_usd_per_attempt: 0.05,
    max_model_attempts: 6,
    max_budget_usd_total: 0.3,
    timeout_ms_per_attempt: 180_000,
    max_output_bytes_per_stream: 8 * 1024 * 1024
  },
  known: [],
  likely: [],
  unknown: [],
  stale_or_suspicious: [],
  suggested: [],
  setup: [],
  attempts: [],
  criteria: {
    discovery: "unknown",
    untrusted_hook: "unknown",
    trusted_hook: "unknown",
    shell_denial: "unknown",
    patch_denial: "unknown",
    rewrite_schema_and_effect: "unknown",
    metadata: "unknown",
    resume: "unknown",
    compaction: "unknown",
    disabled_hooks: "unknown",
    scratch_cleanup: "unknown",
    execution_completed: "unknown"
  },
  cleanup: [],
  disposition: "no-go"
};
let scratch = null;
let hostExecutable = null;
let baseEnvironment = null;
let interruptedSignal = null;
const interruption = new AbortController();
const signalHandlers = new Map(
  ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [
    signal,
    () => handleInterruption(signal)
  ])
);
for (const [signal, handler] of signalHandlers) {
  process.on(signal, handler);
}

try {
  scratch = createScratch("kanon-guard-claude-", { repoRoot });
  hostExecutable = resolveTrustedExecutable("claude", {
    repoRoot,
    environment: process.env
  });
  baseEnvironment = createMinimalHostEnvironment({
    host: "claude-code",
    repoRoot,
    scratchRoot: scratch.root,
    hostExecutable,
    environment: process.env
  });
  report.setup.push({
    name: "trusted-executable-resolution",
    resolved_outside_repository: true,
    ambient_environment_inherited: false
  });

  const version = await runHostProgram(hostExecutable, ["--version"], {
    cwd: scratch.workspace,
    env: baseEnvironment
  });
  report.claimed_surface.cli_version = version.status === 0
    ? parseVersion(version.stdout)
    : null;
  report.setup.push({ name: "claude-version", process: summarizeProcess(version) });

  const auth = await runHostProgram(hostExecutable, ["auth", "status"], {
    cwd: scratch.workspace,
    env: baseEnvironment
  });
  report.setup.push({
    name: "authentication",
    process: summarizeSensitiveProcess(auth),
    logged_in: auth.status === 0 && parseAuthentication(auth.stdout)
  });
  const authenticated = parseAuthentication(auth.stdout);
  if (auth.status !== 0 || authenticated !== true) {
    report.unknown.push("Claude Code authentication was not directly available for a host run.");
  } else {
    await runProbeCases();
  }
} catch (error) {
  if (error?.code !== "EINTERRUPTED") {
    report.unknown.push(`Runner setup failed (${errorIdentifier(error)}).`);
  }
} finally {
  if (scratch) {
    try {
      removeScratch(scratch);
      report.cleanup.push({ name: "scratch-remove", removed: true });
      report.criteria.scratch_cleanup = "proven";
    } catch (error) {
      report.cleanup.push({
        name: "scratch-remove",
        removed: false,
        reason: errorIdentifier(error)
      });
      report.criteria.scratch_cleanup = "unknown";
      report.unknown.push(
        "Disposable Claude scratch cleanup could not be directly verified."
      );
    }
  } else {
    report.criteria.scratch_cleanup = "not-run";
  }
  report.criteria.execution_completed = interruptedSignal
    ? "unknown"
    : "proven";
  finalizeReport();
  writeReport(reportPath, report);
  process.stdout.write(`${JSON.stringify({ disposition: report.disposition, report: reportPath })}\n`);
  for (const [signal, handler] of signalHandlers) {
    process.off(signal, handler);
  }
  if (interruptedSignal) {
    process.exitCode = signalExitCode(interruptedSignal);
  }
}

async function runProbeCases() {
  const environment = {
    ...baseEnvironment,
    KANON_GUARD_SPIKE_EVIDENCE_FILE: scratch.evidence,
    KANON_GUARD_SPIKE_EVIDENCE_ROOT: scratch.root
  };
  const workspaceHash = sha256(scratch.workspace);
  const shellMarker = path.join(scratch.workspace, "kanon-guard-spike-deny-shell.txt");
  const shellDenyCase = shellCase(
    shellMarker,
    "KANON_GUARD_SPIKE_DENY"
  );
  const shellDeny = await invoke(
    "shell-deny",
    environment,
    shellDenyCase.prompt,
    { allowedToolRule: shellDenyCase.permissionRule }
  );
  report.attempts.push(withSideEffect(shellDeny, shellMarker));

  const writeMarker = path.join(scratch.workspace, "kanon-guard-spike-deny-write.txt");
  const writeDeny = await invoke(
    "write-deny",
    environment,
    writePrompt(writeMarker),
    { tools: "Write" }
  );
  report.attempts.push(withSideEffect(writeDeny, writeMarker));

  const editMarker = path.join(scratch.workspace, "kanon-guard-spike-deny-edit.txt");
  fs.writeFileSync(editMarker, "ORIGINAL\n", "utf8");
  const editDeny = await invoke(
    "edit-deny",
    environment,
    editPrompt(editMarker),
    { tools: "Edit" }
  );
  report.attempts.push({
    ...editDeny.summary,
    side_effect_preserved: fs.readFileSync(editMarker, "utf8") === "ORIGINAL\n"
  });

  const original = path.join(scratch.workspace, "kanon-guard-spike-original.txt");
  const rewritten = path.join(scratch.workspace, "kanon-guard-spike-rewrite-output.txt");
  const rewriteCase = shellCase(original, "KANON_GUARD_SPIKE_REWRITE");
  const rewrite = await invoke(
    "shell-rewrite",
    environment,
    rewriteCase.prompt,
    { allowedToolRule: rewriteCase.permissionRule }
  );
  report.attempts.push({
    ...rewrite.summary,
    original_side_effect_exists: fs.existsSync(original),
    rewritten_side_effect_exists: fs.existsSync(rewritten),
    rewritten_contents_sha256: fs.existsSync(rewritten)
      ? sha256(fs.readFileSync(rewritten, "utf8"))
      : null
  });

  const disabledMarker = path.join(scratch.workspace, "kanon-guard-spike-disabled.txt");
  const disabledCase = shellCase(
    disabledMarker,
    "KANON_GUARD_SPIKE_DISABLED"
  );
  const disabled = await invoke(
    "hooks-disabled",
    environment,
    disabledCase.prompt,
    {
      safeMode: true,
      allowedToolRule: disabledCase.permissionRule
    }
  );
  report.attempts.push(withSideEffect(disabled, disabledMarker));

  const shellEvent = matching(shellDeny.events, "Bash", "deny");
  const writeEvent = matching(writeDeny.events, "Write", "deny");
  const editEvent = matching(editDeny.events, "Edit", "deny");
  const rewriteEvent = matching(rewrite.events, "Bash", "rewrite");
  report.criteria.discovery = status(shellDeny.events.length > 0);
  report.criteria.untrusted_hook = "unknown";
  report.criteria.trusted_hook = "unknown";
  report.criteria.shell_denial = status(Boolean(shellEvent) && !fs.existsSync(shellMarker));
  report.criteria.patch_denial = status(
    Boolean(writeEvent) &&
      Boolean(editEvent) &&
      !fs.existsSync(writeMarker) &&
      fs.readFileSync(editMarker, "utf8") === "ORIGINAL\n"
  );
  report.criteria.rewrite_schema_and_effect = status(
    Boolean(rewriteEvent) &&
      !fs.existsSync(original) &&
      fs.existsSync(rewritten) &&
      fs.readFileSync(rewritten, "utf8") === "KANON_GUARD_SPIKE_REWRITTEN\n"
  );
  report.criteria.disabled_hooks = status(
    disabled.events.length === 0 && fs.existsSync(disabledMarker)
  );
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
    report.unknown.push("Claude Code output did not directly expose a resumable session identifier.");
  } else {
    const resumeMarker = path.join(scratch.workspace, "kanon-guard-spike-resume.txt");
    const resumeCase = shellCase(
      resumeMarker,
      "KANON_GUARD_SPIKE_DENY"
    );
    const resume = await invoke(
      "resume-deny",
      environment,
      resumeCase.prompt,
      {
        session,
        allowedToolRule: resumeCase.permissionRule
      }
    );
    report.attempts.push(withSideEffect(resume, resumeMarker));
    const resumeEvent = matching(resume.events, "Bash", "deny");
    report.criteria.resume = status(
      Boolean(resumeEvent) &&
        resumeEvent.session_id?.sha256 === shellEvent?.session_id?.sha256 &&
        !fs.existsSync(resumeMarker)
    );
    report.criteria.compaction = "unknown";
    report.unknown.push(
      "Actual Claude compaction requires an interactive slash-command flow; the runner does not send literal /compact text through an incompatible print-mode prompt."
    );
  }
  report.unknown.push("Claude Code exposes no separately inspectable per-plugin hook-trust state in this non-interactive plugin-dir probe.");
}

async function invoke(name, environment, prompt, options = {}) {
  const before = readObservations(scratch.evidence).length;
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-hook-events",
    "--plugin-dir",
    pluginRoot,
    "--max-budget-usd",
    "0.05",
    "--model",
    "haiku",
    "--effort",
    "low",
    "--permission-mode",
    "dontAsk",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    "{\"mcpServers\":{}}",
    "--no-chrome",
    "--tools",
    options.tools || "Bash"
  ];
  if (options.allowedToolRule) {
    args.push("--allowedTools", options.allowedToolRule);
  }
  if (options.session) args.push("--resume", options.session);
  if (options.safeMode) args.push("--safe-mode");
  args.push(prompt);
  const raw = await runHostProgram(hostExecutable, args, {
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
    cwd_present: event.cwd?.present === true,
    cwd_matches_workspace: event.cwd?.sha256 === sha256(scratch.workspace),
    plugin_root_present: event.plugin_root_present === true,
    plugin_data_present: event.plugin_data?.present === true,
    plugin_data_writable: event.plugin_data?.writable || "unknown",
    plugin_data_reason: event.plugin_data?.reason || null,
    plugin_data_directory_created_for_probe:
      event.plugin_data?.directory_created_for_probe === true,
    plugin_data_created_directory_count:
      Number.isInteger(event.plugin_data?.created_directory_count)
        ? event.plugin_data.created_directory_count
        : 0,
    tool_input_shape: event.tool_input_shape || null
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

function parseAuthentication(output) {
  try {
    return JSON.parse(output).loggedIn === true;
  } catch {
    return false;
  }
}

function parseVersion(output) {
  const match = output.trim().match(/^(\d+\.\d+\.\d+) \(Claude Code\)$/);
  return match ? `${match[1]} (Claude Code)` : null;
}

function shellCase(file, marker) {
  const command = `printf '%s\\n' ${shellQuote(marker)} > ${shellQuote(file)}`;
  return {
    permissionRule: `Bash(${command})`,
    prompt: [
    "Use the Bash tool exactly once and do not use any other tool.",
    `Run ${command}.`,
    "Do not inspect files, do not use network access, and do not retry if the tool is denied."
    ].join(" ")
  };
}

function writePrompt(file) {
  return [
    "Use the Write tool exactly once and do not use any other tool.",
    `Write KANON_GUARD_SPIKE_DENY_WRITE followed by a newline to the absolute path ${JSON.stringify(file)}.`,
    "Do not inspect files, do not use network access, and do not retry if the tool is denied."
  ].join(" ");
}

function editPrompt(file) {
  return [
    "Use the Edit tool exactly once and do not use any other tool.",
    `Replace ORIGINAL with KANON_GUARD_SPIKE_DENY_EDIT in the absolute path ${JSON.stringify(file)}.`,
    "Do not inspect files, do not use network access, and do not retry if the tool is denied."
  ].join(" ");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function summarizeInvocation(args, prompt, options) {
  return {
    executable: "claude",
    arguments: args.map((argument) => {
      if (argument === prompt) return "<fixed-probe-prompt>";
      if (argument === pluginRoot) return "<disposable-plugin-root>";
      if (options.session && argument === options.session) return "<session-id>";
      if (
        options.allowedToolRule &&
        argument === options.allowedToolRule
      ) {
        return "<exact-scratch-command-permission-rule>";
      }
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

async function runHostProgram(command, args, options = {}) {
  const result = await runProgramAsync(command, args, {
    ...options,
    signal: interruption.signal
  });
  if (interruptedSignal) {
    const error = new Error(`Runner interrupted by ${interruptedSignal}.`);
    error.code = "EINTERRUPTED";
    throw error;
  }
  return result;
}

function handleInterruption(signal) {
  if (interruptedSignal) return;
  interruptedSignal = signal;
  report.unknown.push(
    `Runner received ${signal}; the interrupted host observation is Unknown.`
  );
  interruption.abort();
}

function signalExitCode(signal) {
  return {
    SIGHUP: 129,
    SIGINT: 130,
    SIGTERM: 143
  }[signal] || 1;
}

function finalizeReport() {
  const required = [
    "discovery",
    "untrusted_hook",
    "shell_denial",
    "patch_denial",
    "rewrite_schema_and_effect",
    "metadata",
    "resume",
    "compaction",
    "disabled_hooks",
    "trusted_hook",
    "scratch_cleanup",
    "execution_completed"
  ];
  const provenCriteria = Object.entries(report.criteria)
    .filter(([, value]) => value === "proven")
    .map(([name]) => name);
  if (provenCriteria.length) {
    report.known.push(
      `Directly proven on this named surface: ${provenCriteria.join(", ")}.`
    );
  }
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
  }
  report.suggested.push("Do not choose notice mode from this report; obtain a user decision if any criterion remains Unknown or no-go.");
}

function usage() {
  return "Usage: node spikes/guard-feasibility/claude-code/run.mjs --execute --report <repo-relative-report.json>\n";
}
