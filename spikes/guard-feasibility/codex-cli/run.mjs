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
import {
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  parseMarketplaceList,
  parsePluginList
} from "./fixture.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const marketplaceName = MARKETPLACE_NAME;
const pluginName = PLUGIN_NAME;
const marketplaceRoot = path.join(
  repoRoot,
  "spikes/guard-feasibility/codex-cli/marketplace"
);
const options = parseCodexExecutionOptions(process.argv.slice(2));
const reportPath = containedReportPath(repoRoot, options.report);
const report = {
  schema: "kanon-guard-feasibility-report-v2",
  follow_up: "run-a1-hardened",
  host: "codex-cli",
  generated_at: new Date().toISOString(),
  claimed_surface: {
    cli: "codex exec",
    operating_system: process.platform,
    architecture: process.arch,
    terminal_surface: "non-interactive local CLI",
    permission_contract:
      "workspace-write sandbox, never-ask approval policy, user config and rules ignored, fixed single-tool prompts",
    max_model_attempts: 6,
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
    lifecycle_cleanup: "unknown",
    scratch_cleanup: "unknown",
    execution_completed: "unknown"
  },
  cleanup: [],
  disposition: "no-go"
};
if (options.preflightKind) {
  report.follow_up = options.preflightKind === "run-a2"
    ? "run-a2-persisted-trust-compaction-preflight"
    : "run-a1-persisted-trust-compaction-preflight";
  report.claimed_surface = {
    cli: "codex documented status and plugin-list commands",
    operating_system: process.platform,
    architecture: process.arch,
    terminal_surface: "non-interactive read-only preflight",
    permission_contract:
      "no model call, no hook-trust bypass, no plugin mutation, and no interactive host flow",
    max_model_attempts: 0,
    timeout_ms_per_command: 30_000,
    max_output_bytes_per_stream: 8 * 1024 * 1024
  };
  report.criteria = {
    authentication: "unknown",
    documented_state_preflight: "unknown",
    persisted_trusted_hook: "unknown",
    actual_compaction: "unknown",
    host_state_unchanged: "unknown",
    scratch_cleanup: "unknown",
    execution_completed: "unknown"
  };
  report.preflight_and_rollback = {
    preflight:
      "Resolve a trusted executable, reduce authentication to a boolean, and verify the exact disposable marketplace and plugin names are absent.",
    proposed_changes:
      "Install only the exact disposable marketplace and plugin, then use interactive /hooks and /compact in a fresh scratch workspace.",
    documented_rollback:
      "Remove the exact plugin and marketplace, verify both names are absent, and remove runner-owned scratch state.",
    rollback_gap:
      "Current CLI help and official host documentation expose no command to remove a persisted hook-hash trust decision without inspecting undocumented internals.",
    automated_action: "not-run"
  };
  report.manual_verification = [
    options.preflightKind === "run-a2"
      ? "Run A.2 authorization accepts the bounded exact-hash trust residue and at most two authenticated model turns."
      : "Obtain explicit approval for the exact host-state changes, the unresolved persisted-trust rollback gap, and at most two authenticated model turns.",
    "Re-run this read-only preflight and require both exact disposable names to be absent.",
    "Add only the repository's disposable kanon-guard-spike-codex marketplace and plugin using the documented plugin commands.",
    "Open a fresh interactive Codex workspace with workspace-write sandboxing, web search and apps disabled, and the hardened runner's minimum environment.",
    "Use /hooks to review and trust only the exact disposable hook hash; do not use --dangerously-bypass-hook-trust.",
    "Run one fixed marked tool-denial turn and verify the exact scratch marker remains absent.",
    "Use /compact in that same interactive session and verify the documented compaction lifecycle event in the disposable evidence sink.",
    "Exit after those two turns, remove the exact plugin and marketplace, verify both names are absent, and remove only the fresh scratch directory.",
    "Treat the persisted hook-hash trust record as residual user state unless the host documents a supported removal command."
  ];
}
let scratch = null;
let hostExecutable = null;
let baseEnvironment = null;
let marketplaceOwned = false;
let pluginOwned = false;
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
  scratch = createScratch("kanon-guard-codex-", { repoRoot });
  hostExecutable = resolveTrustedExecutable("codex", {
    repoRoot,
    environment: process.env
  });
  baseEnvironment = createMinimalHostEnvironment({
    host: "codex-cli",
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
  report.setup.push({ name: "codex-version", process: summarizeProcess(version) });

  const auth = await runHostProgram(hostExecutable, ["login", "status"], {
    cwd: scratch.workspace,
    env: baseEnvironment
  });
  const authenticationOutput = `${auth.stdout}\n${auth.stderr}`;
  const authenticated =
    auth.status === 0 &&
    /(^|\n)Logged in\b/i.test(authenticationOutput);
  report.setup.push({
    name: "authentication",
    process: summarizeSensitiveProcess(auth),
    logged_in: authenticated
  });
  if (options.preflightKind) {
    await runFollowUpPreflight(authenticated);
  } else if (!authenticated) {
    report.unknown.push("Codex CLI authentication was not directly available for a host run.");
  } else {
    const existing = await runHostProgram(
      hostExecutable,
      ["plugin", "marketplace", "list", "--json"],
      { cwd: scratch.workspace, env: baseEnvironment }
    );
    const marketplaceState = exactJsonStringState(
      existing.stdout,
      marketplaceName
    );
    report.setup.push({
      name: "marketplace-preflight",
      process: summarizeSensitiveProcess(existing),
      output_valid_json: marketplaceState !== null,
      exact_name_absent: marketplaceState === false
    });
    if (existing.status !== 0) {
      report.unknown.push("Codex marketplace state could not be inspected before the disposable install.");
    } else if (marketplaceState === null) {
      report.unknown.push("Codex marketplace state was not valid bounded JSON, so the runner refused to alter user plugin state.");
    } else if (marketplaceState) {
      report.unknown.push("The disposable Codex marketplace name already exists, so the runner refused to alter user plugin state.");
    } else {
      const installed = await runHostProgram(
        hostExecutable,
        ["plugin", "list", "--json"],
        { cwd: scratch.workspace, env: baseEnvironment }
      );
      const pluginState = exactJsonStringState(installed.stdout, pluginName);
      report.setup.push({
        name: "plugin-preflight",
        process: summarizeSensitiveProcess(installed),
        output_valid_json: pluginState !== null,
        exact_name_absent: pluginState === false
      });
      if (installed.status !== 0) {
        report.unknown.push("Codex installed-plugin state could not be inspected before the disposable install.");
      } else if (pluginState === null) {
        report.unknown.push("Codex installed-plugin state was not valid bounded JSON, so the runner refused to alter user plugin state.");
      } else if (pluginState) {
        report.unknown.push("The disposable Codex plugin name already exists, so the runner refused to alter user plugin state.");
      } else {
        marketplaceOwned = true;
        const addMarketplace = await runHostProgram(
          hostExecutable,
          ["plugin", "marketplace", "add", marketplaceRoot, "--json"],
          { cwd: scratch.workspace, env: baseEnvironment }
        );
        report.setup.push({ name: "marketplace-add", process: summarizeProcess(addMarketplace) });
        if (addMarketplace.status !== 0) {
          report.unknown.push("The disposable Codex marketplace did not install successfully.");
        } else {
          pluginOwned = true;
          const addPlugin = await runHostProgram(
            hostExecutable,
            ["plugin", "add", `${pluginName}@${marketplaceName}`, "--json"],
            { cwd: scratch.workspace, env: baseEnvironment }
          );
          report.setup.push({ name: "plugin-add", process: summarizeProcess(addPlugin) });
          if (addPlugin.status !== 0) {
            report.unknown.push("The disposable Codex plugin did not install successfully.");
          } else {
            await runProbeCases();
          }
        }
      }
    }
  }
} catch (error) {
  if (error?.code !== "EINTERRUPTED") {
    report.unknown.push(`Runner setup failed (${errorIdentifier(error)}).`);
  }
} finally {
  if (pluginOwned) {
    const removePlugin = await runProgramAsync(
      hostExecutable,
      ["plugin", "remove", `${pluginName}@${marketplaceName}`, "--json"],
      {
        cwd: scratch?.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      }
    );
    report.cleanup.push({ name: "plugin-remove", process: summarizeProcess(removePlugin) });
  }
  if (marketplaceOwned) {
    const removeMarketplace = await runProgramAsync(
      hostExecutable,
      ["plugin", "marketplace", "remove", marketplaceName, "--json"],
      {
        cwd: scratch?.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      }
    );
    report.cleanup.push({ name: "marketplace-remove", process: summarizeProcess(removeMarketplace) });
  }
  if (options.preflightKind) {
    report.criteria.host_state_unchanged =
      !pluginOwned && !marketplaceOwned ? "proven" : "unknown";
  } else if (pluginOwned || marketplaceOwned) {
    const pluginState = await runProgramAsync(
      hostExecutable,
      ["plugin", "list", "--json"],
      {
        cwd: scratch?.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      }
    );
    const marketplaceState = await runProgramAsync(
      hostExecutable,
      ["plugin", "marketplace", "list", "--json"],
      {
        cwd: scratch?.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      }
    );
    report.cleanup.push({
      name: "plugin-cleanup-verification",
      process: summarizeSensitiveProcess(pluginState),
      output_valid_json:
        exactJsonStringState(pluginState.stdout, pluginName) !== null,
      exact_name_absent:
        exactJsonStringState(pluginState.stdout, pluginName) === false
    });
    report.cleanup.push({
      name: "marketplace-cleanup-verification",
      process: summarizeSensitiveProcess(marketplaceState),
      output_valid_json:
        exactJsonStringState(marketplaceState.stdout, marketplaceName) !== null,
      exact_name_absent:
        exactJsonStringState(marketplaceState.stdout, marketplaceName) === false
    });
    report.criteria.lifecycle_cleanup = status(
      pluginState.status === 0 &&
        marketplaceState.status === 0 &&
        exactJsonStringState(pluginState.stdout, pluginName) === false &&
        exactJsonStringState(marketplaceState.stdout, marketplaceName) === false
    );
    if (report.criteria.lifecycle_cleanup !== "proven") {
      report.unknown.push(
        "Disposable Codex plugin cleanup could not be directly verified."
      );
    }
  } else {
    report.criteria.lifecycle_cleanup = "not-run";
  }
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
        "Disposable Codex scratch cleanup could not be directly verified."
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

async function runFollowUpPreflight(authenticated) {
  report.criteria.authentication = status(authenticated);
  if (!authenticated) {
    report.unknown.push(
      "Codex CLI authentication was not directly available for the persisted-trust and compaction follow-up."
    );
  }

  const marketplace = await runHostProgram(
    hostExecutable,
    ["plugin", "marketplace", "list", "--json"],
    { cwd: scratch.workspace, env: baseEnvironment, timeoutMs: 30_000 }
  );
  const marketplaceList = parseMarketplaceList(marketplace.stdout);
  const marketplaceState = marketplaceList === null
    ? null
    : marketplaceList.exactNamePresent;
  report.setup.push({
    name: "marketplace-preflight",
    process: summarizeSensitiveProcess(marketplace),
    output_valid_json: marketplaceState !== null,
    exact_name_absent:
      marketplaceState === false &&
      marketplaceList?.duplicateExactNames === false
  });

  const plugins = await runHostProgram(
    hostExecutable,
    ["plugin", "list", "--json"],
    { cwd: scratch.workspace, env: baseEnvironment, timeoutMs: 30_000 }
  );
  const pluginList = parsePluginList(plugins.stdout);
  const pluginState = pluginList === null
    ? null
    : pluginList.exactNamePresent;
  report.setup.push({
    name: "plugin-preflight",
    process: summarizeSensitiveProcess(plugins),
    output_valid_json: pluginState !== null,
    exact_name_absent:
      pluginState === false &&
      pluginList?.duplicateExactNames === false,
    unrelated_installed_plugins_present:
      pluginList?.otherInstalledPluginsPresent === true
  });

  report.criteria.documented_state_preflight = status(
    marketplace.status === 0 &&
      plugins.status === 0 &&
      marketplaceState === false &&
      pluginState === false &&
      marketplaceList?.duplicateExactNames === false &&
      pluginList?.duplicateExactNames === false
  );
  if (marketplaceState === true || pluginState === true) {
    report.unknown.push(
      "An exact disposable Codex marketplace or plugin name already exists; no host state was changed."
    );
  } else if (
    marketplace.status !== 0 ||
    plugins.status !== 0 ||
    marketplaceState === null ||
    pluginState === null
  ) {
    report.unknown.push(
      "The documented Codex plugin-state preflight did not produce valid successful JSON; no host state was changed."
    );
  }

  report.criteria.persisted_trusted_hook = "unknown";
  report.criteria.actual_compaction = "unknown";
  report.unknown.push(
    "Persisted hook execution remains Unknown: official host behavior requires interactive /hooks review of the exact hook hash, and this read-only follow-up did not open an interactive flow."
  );
  report.unknown.push(
    "Actual compaction remains Unknown: the documented /compact command is interactive and was not sent as literal text through codex exec."
  );
  report.unknown.push(
    options.preflightKind === "run-a2"
      ? "This zero-model Run A.2 preflight intentionally stops before the separately authorized interactive launcher; it does not itself create persisted trust."
      : "Safe automation stopped at preflight because current CLI help and official host documentation expose no supported command to remove a persisted hook-hash trust decision without inspecting undocumented internals."
  );
}

async function runProbeCases() {
  const environment = {
    ...baseEnvironment,
    KANON_GUARD_SPIKE_EVIDENCE_FILE: scratch.evidence,
    KANON_GUARD_SPIKE_EVIDENCE_ROOT: scratch.root
  };
  const workspaceHash = sha256(scratch.workspace);
  const untrustedMarker = path.join(scratch.workspace, "kanon-guard-spike-untrusted.txt");
  const untrusted = await invoke("untrusted-hook", environment, shellPrompt(untrustedMarker, "KANON_GUARD_SPIKE_UNTRUSTED"));
  const untrustedEvents = untrusted.events;
  report.attempts.push(withSideEffect(untrusted, untrustedMarker));

  const shellMarker = path.join(scratch.workspace, "kanon-guard-spike-deny-shell.txt");
  const shellDeny = await invoke("shell-deny", environment, shellPrompt(shellMarker, "KANON_GUARD_SPIKE_DENY"), { bypassTrust: true });
  report.attempts.push(withSideEffect(shellDeny, shellMarker));

  const patchMarker = path.join(scratch.workspace, "kanon-guard-spike-deny-patch.txt");
  const patchDeny = await invoke("patch-deny", environment, patchPrompt(patchMarker), { bypassTrust: true });
  report.attempts.push(withSideEffect(patchDeny, patchMarker));

  const original = path.join(scratch.workspace, "kanon-guard-spike-original.txt");
  const rewritten = path.join(scratch.workspace, "kanon-guard-spike-rewrite-output.txt");
  const rewrite = await invoke("shell-rewrite", environment, shellPrompt(original, "KANON_GUARD_SPIKE_REWRITE"), { bypassTrust: true });
  report.attempts.push({
    ...rewrite.summary,
    original_side_effect_exists: fs.existsSync(original),
    rewritten_side_effect_exists: fs.existsSync(rewritten),
    rewritten_contents_sha256: fs.existsSync(rewritten)
      ? sha256(fs.readFileSync(rewritten, "utf8"))
      : null
  });

  const disabledMarker = path.join(scratch.workspace, "kanon-guard-spike-disabled.txt");
  const disabled = await invoke(
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
    const resume = await invoke("resume-deny", environment, shellPrompt(resumeMarker, "KANON_GUARD_SPIKE_DENY"), { bypassTrust: true, session });
    report.attempts.push(withSideEffect(resume, resumeMarker));
    const resumeEvent = matching(resume.events, "Bash", "deny");
    report.criteria.resume = status(
      Boolean(resumeEvent) &&
        resumeEvent.session_id?.sha256 === shellEvent?.session_id?.sha256 &&
        !fs.existsSync(resumeMarker)
    );
    report.criteria.compaction = "unknown";
    report.unknown.push(
      "Actual Codex compaction requires the documented interactive /compact flow; the runner does not send literal /compact text through codex exec."
    );
  }
}

async function invoke(name, environment, prompt, options = {}) {
  const before = readObservations(scratch.evidence).length;
  const args = options.session
    ? ["exec", "resume", options.session]
    : ["exec"];
  args.push(
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "-a",
    "never",
    "-c",
    "web_search=\"disabled\"",
    "-c",
    "features.apps=false",
    "-c",
    "features.multi_agent=false"
  );
  if (!options.session) {
    args.push("-s", "workspace-write");
  }
  if (options.bypassTrust) args.push("--dangerously-bypass-hook-trust");
  if (options.disabled) args.push("--disable", "hooks");
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

function parseVersion(output) {
  const match = output.trim().match(/^codex-cli (\d+\.\d+\.\d+)$/);
  return match ? `codex-cli ${match[1]}` : null;
}

function exactJsonStringState(output, expected) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  const pending = [parsed];
  let inspected = 0;
  while (pending.length) {
    inspected += 1;
    if (inspected > 100_000) return null;
    const value = pending.pop();
    if (value === expected) return true;
    if (Array.isArray(value)) {
      for (const entry of value) pending.push(entry);
    } else if (value && typeof value === "object") {
      for (const entry of Object.values(value)) pending.push(entry);
    }
  }
  return false;
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
  const required = options.preflightKind
    ? [
        "authentication",
        "documented_state_preflight",
        "persisted_trusted_hook",
        "actual_compaction",
        "host_state_unchanged",
        "scratch_cleanup",
        "execution_completed"
      ]
    : [
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
        "lifecycle_cleanup",
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

function parseCodexExecutionOptions(argv) {
  const runA1Flags = argv.filter(
    (argument) => argument === "--preflight-only"
  ).length;
  const runA2Flags = argv.filter(
    (argument) => argument === "--run-a2-preflight"
  ).length;
  if (runA1Flags > 1 || runA2Flags > 1) {
    throw new Error("A preflight mode may be specified only once.");
  }
  if (runA1Flags && runA2Flags) {
    throw new Error("Codex preflight modes are mutually exclusive.");
  }
  const parsed = parseExecutionOptions(
    argv.filter(
      (argument) =>
        argument !== "--preflight-only" &&
        argument !== "--run-a2-preflight"
    ),
    usage()
  );
  return {
    ...parsed,
    preflightKind:
      runA2Flags === 1
        ? "run-a2"
        : runA1Flags === 1
          ? "run-a1"
          : null
  };
}

function usage() {
  return "Usage: node spikes/guard-feasibility/codex-cli/run.mjs --execute [--preflight-only | --run-a2-preflight] --report <repo-relative-report.json>\n";
}
