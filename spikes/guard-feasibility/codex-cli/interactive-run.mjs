import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  containedReportPath,
  createMinimalHostEnvironment,
  createScratch,
  readObservations,
  removeScratch,
  resolveTrustedExecutable,
  runProgramAsync,
  sha256,
  summarizeSensitiveProcess,
  writeReport
} from "../lib/runtime.mjs";
import {
  DENIAL_MARKER_NAME,
  MARKETPLACE_NAME,
  PLUGIN_ID,
  PLUGIN_NAME,
  denialProbe,
  fixturePaths,
  marketplaceIdentityMatches,
  parseMarketplaceList,
  parsePluginList,
  pluginIdentityMatches,
  verifyFixtureIdentity
} from "./fixture.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const RUN_A2_BASELINE_COMMIT =
  "17707f3e65dfb2ef309391d363590210199b9d56";
const MAX_INTERACTIVE_MS = 15 * 60 * 1_000;
const MAX_REPORT_PATH_LENGTH = 4_096;
const SUPERVISION_CONFIRMATION =
  "KANON_STATUS_HOOK_AND_TWO_TURNS_CONFIRMED";
const SOURCE_BINDING_FILES = Object.freeze([
  "spikes/guard-feasibility/lib/runtime.mjs",
  "spikes/guard-feasibility/codex-cli/fixture.mjs",
  "spikes/guard-feasibility/codex-cli/interactive-run.mjs",
  "spikes/guard-feasibility/codex-cli/run.mjs",
  "spikes/guard-feasibility/codex-cli/marketplace/.agents/plugins/marketplace.json",
  "spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/.codex-plugin/plugin.json",
  "spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/hooks/hooks.json",
  "spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/scripts/probe-core.mjs",
  "spikes/guard-feasibility/codex-cli/marketplace/plugins/kanon-guard-spike-codex/scripts/probe-hook.mjs"
]);
const SESSION_CONFIG_OVERRIDES = Object.freeze([
  'web_search="disabled"',
  "sandbox_workspace_write.network_access=false",
  'approvals_reviewer="user"',
  "analytics.enabled=false",
  "check_for_update_on_startup=false",
  "features.apps=false",
  "features.enable_mcp_apps=false",
  "features.memories=false",
  "memories.use_memories=false",
  "memories.generate_memories=false",
  "features.multi_agent=false",
  "features.multi_agent_v2=false",
  "features.enable_fanout=false",
  "features.in_app_browser=false",
  "features.browser_use=false",
  "features.browser_use_external=false",
  "features.browser_use_full_cdp_access=false",
  "features.computer_use=false",
  "features.image_generation=false",
  "features.plugin_sharing=false",
  "features.remote_plugin=false",
  "features.skill_mcp_dependency_install=false",
  "features.skill_search=false",
  "features.tool_suggest=false",
  "features.workspace_dependencies=false",
  "mcp_servers={}",
  "features.plugins=true",
  "features.hooks=true"
]);

export function parseInteractiveOptions(argv) {
  if (!Array.isArray(argv) || argv.length !== 3) {
    throw new Error(usage().trim());
  }
  let execute = false;
  let report = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute" && !execute) {
      execute = true;
      continue;
    }
    if (argument === "--report" && report === null) {
      const candidate = argv[++index];
      if (
        typeof candidate !== "string" ||
        candidate.length === 0 ||
        candidate.length > MAX_REPORT_PATH_LENGTH ||
        candidate.includes("\0") ||
        candidate.startsWith("--")
      ) {
        throw new Error("Run A.2 requires one bounded report path.");
      }
      report = candidate;
      continue;
    }
    throw new Error(`Unexpected or duplicate Run A.2 option: ${argument}`);
  }
  if (!execute || !report) throw new Error(usage().trim());
  return { execute, report };
}

export function ensureExclusiveReportTarget(root, value) {
  const target = containedReportPath(root, value);
  try {
    fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return target;
    throw error;
  }
  const error = new Error("Run A.2 report already exists.");
  error.code = "EEXIST";
  throw error;
}

export function createInteractiveEnvironment({
  baseEnvironment,
  scratch
}) {
  const environment = Object.assign(Object.create(null), baseEnvironment, {
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    KANON_GUARD_SPIKE_EVIDENCE_FILE: scratch.evidence,
    KANON_GUARD_SPIKE_EVIDENCE_ROOT: scratch.root
  });
  return environment;
}

export function interactiveArguments(workspace) {
  if (!path.isAbsolute(workspace)) {
    throw new Error("Run A.2 requires an absolute scratch workspace.");
  }
  const args = [
    "--strict-config",
    "--no-alt-screen",
    "--cd",
    workspace,
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "on-request"
  ];
  for (const override of SESSION_CONFIG_OVERRIDES) {
    args.push("--config", override);
  }
  if (
    args.length > 64 ||
    args.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length === 0 ||
        argument.length > MAX_REPORT_PATH_LENGTH
    ) ||
    args.includes("--dangerously-bypass-hook-trust") ||
    args.includes("--dangerously-bypass-approvals-and-sandbox")
  ) {
    throw new Error("Run A.2 interactive arguments exceeded their bounds.");
  }
  return args;
}

export function sourceBundleSha256(root) {
  const chunks = [];
  for (const relative of SOURCE_BINDING_FILES) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      fs.realpathSync(absolute) !== absolute
    ) {
      throw new Error(`Unsafe source binding file: ${relative}`);
    }
    chunks.push(`${relative}\0${sha256(fs.readFileSync(absolute))}\n`);
  }
  return sha256(chunks.sort().join(""));
}

export function summarizeInteractiveObservations(observations, workspace) {
  if (!Array.isArray(observations) || observations.length > 64) {
    throw new Error("Run A.2 observation count exceeded its bound.");
  }
  const workspaceSha256 = sha256(workspace);
  return observations.map((event) => {
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      event.schema !== "kanon-guard-feasibility-observation-v1" ||
      event.host !== "codex-cli"
    ) {
      throw new Error("Run A.2 received an unexpected observation schema.");
    }
    return {
      hook_event_name: boundedObservationString(event.hook_event_name, 80),
      session_start_source:
        boundedObservationString(event.session_start_source, 80),
      tool_name: boundedObservationString(event.tool_name, 160),
      marker: boundedObservationString(event.marker, 40),
      decision: boundedObservationString(event.decision, 40),
      session_id_present: event.session_id?.present === true,
      turn_id_present: event.turn_id?.present === true,
      cwd_matches_workspace: event.cwd?.sha256 === workspaceSha256,
      plugin_root_present: event.plugin_root_present === true,
      plugin_data_writable: event.plugin_data?.writable === true,
      evidence_written: true
    };
  });
}

export function evaluateInteractiveEvidence({
  observations,
  markerAbsent,
  supervisionConfirmed,
  launchArgs,
  interactiveProcess
}) {
  const preTool = observations.filter(
    (event) => event.hook_event_name === "PreToolUse"
  );
  const denial = preTool.find(
    (event) =>
      event.tool_name === "Bash" &&
      event.marker === "deny" &&
      event.decision === "deny" &&
      event.cwd_matches_workspace &&
      event.session_id_present &&
      event.turn_id_present &&
      event.plugin_root_present &&
      event.plugin_data_writable &&
      event.evidence_written
  );
  const compact = observations.find(
    (event) =>
      event.hook_event_name === "SessionStart" &&
      event.session_start_source === "compact" &&
      event.cwd_matches_workspace &&
      event.session_id_present &&
      event.plugin_root_present &&
      event.evidence_written
  );
  const safeLaunch =
    launchArgs.includes("workspace-write") &&
    launchArgs.includes("on-request") &&
    !launchArgs.includes("--dangerously-bypass-hook-trust") &&
    !launchArgs.includes("--dangerously-bypass-approvals-and-sandbox");
  return {
    preToolUseDenial:
      Boolean(denial) &&
      preTool.length === 1,
    markerAbsent,
    actualCompaction: Boolean(compact),
    persistedExactHashTrust:
      supervisionConfirmed &&
      Boolean(denial) &&
      safeLaunch,
    executionBounds:
      supervisionConfirmed &&
      preTool.length === 1 &&
      interactiveProcess?.status === 0 &&
      interactiveProcess?.timed_out === false &&
      interactiveProcess?.aborted === false &&
      safeLaunch
  };
}

export async function cleanupOwnedCodexState({
  hostExecutable,
  cwd,
  environment,
  pluginOwned,
  marketplaceOwned,
  run = runProgramAsync
}) {
  const cleanup = [];
  let removalCommandsSucceeded = true;
  if (pluginOwned) {
    const result = await run(
      hostExecutable,
      ["plugin", "remove", PLUGIN_ID, "--json"],
      { cwd, env: environment, timeoutMs: 30_000 }
    );
    cleanup.push({
      name: "plugin-remove",
      process: summarizeSensitiveProcess(result)
    });
    removalCommandsSucceeded &&= result.status === 0;
  }
  if (marketplaceOwned) {
    const result = await run(
      hostExecutable,
      [
        "plugin",
        "marketplace",
        "remove",
        MARKETPLACE_NAME,
        "--json"
      ],
      { cwd, env: environment, timeoutMs: 30_000 }
    );
    cleanup.push({
      name: "marketplace-remove",
      process: summarizeSensitiveProcess(result)
    });
    removalCommandsSucceeded &&= result.status === 0;
  }

  if (!pluginOwned && !marketplaceOwned) {
    return {
      cleanup,
      exactNamesAbsent: false,
      removalCommandsSucceeded: false
    };
  }
  const plugins = await run(
    hostExecutable,
    ["plugin", "list", "--json"],
    { cwd, env: environment, timeoutMs: 30_000 }
  );
  const marketplaces = await run(
    hostExecutable,
    ["plugin", "marketplace", "list", "--json"],
    { cwd, env: environment, timeoutMs: 30_000 }
  );
  const pluginState = parsePluginList(plugins.stdout);
  const marketplaceState = parseMarketplaceList(marketplaces.stdout);
  const pluginAbsent =
    plugins.status === 0 &&
    pluginState !== null &&
    pluginState.exactNamePresent === false &&
    pluginState.duplicateExactNames === false;
  const marketplaceAbsent =
    marketplaces.status === 0 &&
    marketplaceState !== null &&
    marketplaceState.exactNamePresent === false &&
    marketplaceState.duplicateExactNames === false;
  cleanup.push({
    name: "plugin-cleanup-verification",
    process: summarizeSensitiveProcess(plugins),
    output_valid_json: pluginState !== null,
    exact_name_absent: pluginAbsent
  });
  cleanup.push({
    name: "marketplace-cleanup-verification",
    process: summarizeSensitiveProcess(marketplaces),
    output_valid_json: marketplaceState !== null,
    exact_name_absent: marketplaceAbsent
  });
  return {
    cleanup,
    exactNamesAbsent: pluginAbsent && marketplaceAbsent,
    removalCommandsSucceeded
  };
}

async function main() {
  const options = parseInteractiveOptions(process.argv.slice(2));
  const reportPath = ensureExclusiveReportTarget(repoRoot, options.report);
  const report = initialReport();
  let scratch = null;
  let hostExecutable = null;
  let baseEnvironment = null;
  let interactiveEnvironment = null;
  let pluginOwned = false;
  let marketplaceOwned = false;
  let interruptedSignal = null;
  let activeInteractiveChild = null;
  const interruption = new AbortController();
  const signalHandlers = new Map(
    ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => [
      signal,
      () => {
        if (interruptedSignal) return;
        interruptedSignal = signal;
        interruption.abort();
        activeInteractiveChild?.kill("SIGTERM");
      }
    ])
  );
  for (const [signal, handler] of signalHandlers) {
    process.on(signal, handler);
  }

  try {
    scratch = createScratch("kanon-guard-codex-run-a2-", { repoRoot });
    hostExecutable = resolveTrustedExecutable("codex", {
      repoRoot,
      environment: process.env
    });
    const gitExecutable = resolveTrustedExecutable("git", {
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
    const gitEnvironment = Object.assign(Object.create(null), baseEnvironment, {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL:
        process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      GIT_PAGER: "cat"
    });
    interactiveEnvironment = createInteractiveEnvironment({
      baseEnvironment,
      scratch
    });

    const source = await verifySourceBinding(
      gitExecutable,
      gitEnvironment,
      interruption.signal
    );
    report.provenance = {
      baseline_commit: RUN_A2_BASELINE_COMMIT,
      source_commit: source.commit,
      source_sha256: sourceBundleSha256(repoRoot),
      tracked_source_clean: source.trackedClean,
      baseline_is_ancestor: source.baselineIsAncestor
    };
    report.criteria.source_binding = status(
      source.trackedClean && source.baselineIsAncestor
    );
    if (report.criteria.source_binding !== "proven") {
      throw codedError("source-binding");
    }

    const fixture = verifyFixtureIdentity(repoRoot);
    report.fixture = {
      marketplace_name: MARKETPLACE_NAME,
      plugin_id: PLUGIN_ID,
      identity_sha256: fixture.bundleSha256,
      exact_identity_verified: fixture.verified
    };
    report.criteria.fixture_identity = status(fixture.verified);

    report.setup.push({
      name: "trusted-executable-resolution",
      resolved_outside_repository: true,
      ambient_environment_inherited: false
    });
    const version = await runHost(
      hostExecutable,
      ["--version"],
      {
        cwd: scratch.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      },
      interruption.signal
    );
    const cliVersion = parseVersion(version.stdout);
    report.claimed_surface.cli_version = cliVersion;
    report.setup.push({
      name: "codex-version",
      process: summarizeSensitiveProcess(version),
      expected_version: cliVersion === "codex-cli 0.145.0"
    });
    validateReportVersion(reportPath, cliVersion);
    if (version.status !== 0 || cliVersion !== "codex-cli 0.145.0") {
      throw codedError("unexpected-version");
    }

    const auth = await runHost(
      hostExecutable,
      ["login", "status"],
      {
        cwd: scratch.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      },
      interruption.signal
    );
    const authenticated =
      auth.status === 0 &&
      /(^|\n)Logged in\b/i.test(`${auth.stdout}\n${auth.stderr}`);
    report.setup.push({
      name: "authentication",
      process: summarizeSensitiveProcess(auth),
      logged_in: authenticated
    });
    report.criteria.authentication = status(authenticated);
    if (!authenticated) throw codedError("authentication");

    const preflight = await inspectDocumentedState(
      hostExecutable,
      scratch.workspace,
      baseEnvironment,
      interruption.signal
    );
    report.setup.push(...preflight.setup);
    report.session_controls.other_installed_plugins_present =
      preflight.otherInstalledPluginsPresent;
    report.criteria.documented_state_preflight = status(
      preflight.exactNamesAbsent
    );
    if (!preflight.exactNamesAbsent) {
      throw codedError("documented-state-preflight");
    }

    const { marketplaceRoot, pluginRoot } = fixturePaths(repoRoot);
    marketplaceOwned = true;
    const addMarketplace = await runHost(
      hostExecutable,
      ["plugin", "marketplace", "add", marketplaceRoot, "--json"],
      {
        cwd: scratch.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      },
      interruption.signal
    );
    report.setup.push({
      name: "marketplace-add",
      process: summarizeSensitiveProcess(addMarketplace)
    });
    if (addMarketplace.status !== 0) {
      throw codedError("marketplace-add");
    }

    const marketplaceVerification = await runHost(
      hostExecutable,
      ["plugin", "marketplace", "list", "--json"],
      {
        cwd: scratch.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      },
      interruption.signal
    );
    const marketplaceState = parseMarketplaceList(
      marketplaceVerification.stdout
    );
    const exactMarketplace =
      marketplaceVerification.status === 0 &&
      marketplaceIdentityMatches(marketplaceState, marketplaceRoot);
    report.setup.push({
      name: "marketplace-identity",
      process: summarizeSensitiveProcess(marketplaceVerification),
      exact_identity: exactMarketplace
    });
    if (!exactMarketplace) throw codedError("marketplace-identity");

    pluginOwned = true;
    const addPlugin = await runHost(
      hostExecutable,
      ["plugin", "add", PLUGIN_ID, "--json"],
      {
        cwd: scratch.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      },
      interruption.signal
    );
    report.setup.push({
      name: "plugin-add",
      process: summarizeSensitiveProcess(addPlugin)
    });
    if (addPlugin.status !== 0) throw codedError("plugin-add");

    const pluginVerification = await runHost(
      hostExecutable,
      ["plugin", "list", "--json"],
      {
        cwd: scratch.workspace,
        env: baseEnvironment,
        timeoutMs: 30_000
      },
      interruption.signal
    );
    const pluginState = parsePluginList(pluginVerification.stdout);
    const exactPlugin =
      pluginVerification.status === 0 &&
      pluginIdentityMatches(pluginState, pluginRoot);
    report.setup.push({
      name: "plugin-identity",
      process: summarizeSensitiveProcess(pluginVerification),
      exact_identity: exactPlugin
    });
    report.criteria.installed_identity = status(
      exactMarketplace && exactPlugin
    );
    if (!exactPlugin) throw codedError("plugin-identity");

    const marker = path.join(scratch.workspace, DENIAL_MARKER_NAME);
    const prompt = denialProbe(marker);
    const launchArgs = interactiveArguments(scratch.workspace);
    report.interactive.launch = {
      executable: "codex",
      arguments: sanitizeLaunchArguments(launchArgs, scratch.workspace),
      cwd: "<scratch-workspace>",
      no_initial_prompt: true,
      prompt_sha256: sha256(prompt),
      maximum_model_turns: 2,
      timeout_ms: MAX_INTERACTIVE_MS
    };
    report.criteria.session_configuration = "unknown";
    printSupervisionBoundary({
      cliVersion,
      workspace: scratch.workspace,
      marker,
      prompt
    });

    const interactiveProcess = await runInteractiveProgram(
      hostExecutable,
      launchArgs,
      {
        cwd: scratch.workspace,
        env: interactiveEnvironment,
        timeoutMs: MAX_INTERACTIVE_MS,
        signal: interruption.signal,
        onChild: (child) => {
          activeInteractiveChild = child;
        }
      }
    );
    activeInteractiveChild = null;
    report.interactive.process = {
      status: interactiveProcess.status,
      signal: interactiveProcess.signal,
      timed_out: interactiveProcess.timed_out,
      aborted: interactiveProcess.aborted,
      error_code: interactiveProcess.error_code
    };

    const supervisionConfirmed =
      interactiveProcess.status === 0 &&
      !interactiveProcess.timed_out &&
      !interactiveProcess.aborted &&
      await collectSupervisionConfirmation();
    report.interactive.supervised_ui = {
      expected_version_confirmed: supervisionConfirmed,
      scratch_cwd_confirmed: supervisionConfirmed,
      workspace_write_confirmed: supervisionConfirmed,
      on_request_approvals_confirmed: supervisionConfirmed,
      exact_plugin_source_confirmed: supervisionConfirmed,
      exact_hook_definition_reviewed: supervisionConfirmed,
      persisted_trust_selected_without_bypass: supervisionConfirmed,
      exactly_one_denial_turn_then_real_compact: supervisionConfirmed,
      no_third_model_turn: supervisionConfirmed,
      no_unexpected_matching_hook_source: supervisionConfirmed
    };
    report.criteria.session_configuration = status(supervisionConfirmed);

    const rawObservations = readObservations(scratch.evidence);
    const observations = summarizeInteractiveObservations(
      rawObservations,
      scratch.workspace
    );
    report.interactive.observation_count = observations.length;
    report.interactive.observations = observations;
    const evaluated = evaluateInteractiveEvidence({
      observations,
      markerAbsent: !fs.existsSync(marker),
      supervisionConfirmed,
      launchArgs,
      interactiveProcess
    });
    report.interactive.marker_absent = evaluated.markerAbsent;
    report.criteria.persisted_exact_hash_trust = status(
      evaluated.persistedExactHashTrust
    );
    report.criteria.pretooluse_denial = status(
      evaluated.preToolUseDenial
    );
    report.criteria.marker_absence = status(evaluated.markerAbsent);
    report.criteria.actual_compaction = status(
      evaluated.actualCompaction
    );
    report.criteria.execution_bounds = status(
      evaluated.executionBounds
    );
  } catch (error) {
    report.errors.push(errorIdentifier(error));
  } finally {
    const cleanupResult =
      hostExecutable && baseEnvironment && scratch
        ? await cleanupOwnedCodexState({
            hostExecutable,
            cwd: scratch.workspace,
            environment: baseEnvironment,
            pluginOwned,
            marketplaceOwned
          })
        : { cleanup: [], exactNamesAbsent: false };
    report.cleanup.push(...cleanupResult.cleanup);
    report.criteria.documented_cleanup = status(
      pluginOwned &&
      marketplaceOwned &&
      cleanupResult.removalCommandsSucceeded &&
      cleanupResult.exactNamesAbsent
    );

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
      }
    }
    report.criteria.execution_completed = interruptedSignal
      ? "unknown"
      : "proven";
    finalizeReport(report);
    writeReport(reportPath, report);
    process.stdout.write(
      `${JSON.stringify({
        disposition: report.disposition,
        report: reportPath
      })}\n`
    );
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
    if (interruptedSignal) {
      process.exitCode = signalExitCode(interruptedSignal);
    } else if (report.disposition !== "go") {
      process.exitCode = 1;
    }
  }
}

function initialReport() {
  return {
    schema: "kanon-guard-feasibility-report-v3",
    run: "run-a2-supervised-persisted-trust-real-compaction",
    host: "codex-cli",
    generated_at: new Date().toISOString(),
    provenance: null,
    claimed_surface: {
      cli: "interactive Codex CLI",
      operating_system: process.platform,
      architecture: process.arch,
      terminal_surface: "supervised local TUI",
      permission_contract:
        "workspace-write sandbox, ordinary on-request approvals, fixed disposable plugin, no trust or sandbox bypass",
      max_model_turns: 2,
      timeout_ms: MAX_INTERACTIVE_MS,
      max_output_bytes_per_noninteractive_stream: 8 * 1024 * 1024,
      cli_version: null
    },
    fixture: null,
    session_controls: {
      web_search_disabled: true,
      apps_and_connectors_disabled: true,
      configured_mcp_servers_disabled: true,
      memories_disabled: true,
      multi_agent_disabled: true,
      browser_and_computer_use_disabled: true,
      plugin_sharing_disabled: true,
      unrelated_plugin_include_only_supported: false,
      unrelated_plugin_persistent_state_mutated: false,
      other_installed_plugins_present: null
    },
    known: [],
    likely: [],
    unknown: [],
    stale_or_suspicious: [],
    residual_risks: [
      "This result is restricted to the exact reported Codex CLI version, macOS arm64 interactive CLI, Bash tool, and committed disposable fixture.",
      "The run is not installed-artifact, cross-platform, IDE, desktop, web, production Guard, receipt, or notice proof.",
      "Ordinary Codex session records remain untouched.",
      "One inert persisted trust decision for the exact disposable hook hash may remain because no documented removal command was used.",
      "The CLI exposes no documented session-only include-list for installed local plugins; unrelated persistent plugin state is not changed."
    ],
    setup: [],
    interactive: {
      launch: null,
      process: null,
      supervised_ui: null,
      observation_count: 0,
      observations: [],
      marker_absent: false
    },
    criteria: {
      source_binding: "unknown",
      authentication: "unknown",
      documented_state_preflight: "unknown",
      fixture_identity: "unknown",
      installed_identity: "unknown",
      session_configuration: "unknown",
      persisted_exact_hash_trust: "unknown",
      pretooluse_denial: "unknown",
      marker_absence: "unknown",
      actual_compaction: "unknown",
      execution_bounds: "unknown",
      documented_cleanup: "unknown",
      scratch_cleanup: "unknown",
      execution_completed: "unknown"
    },
    cleanup: [],
    accepted_residual_user_state: {
      ordinary_session_records_left_untouched: true,
      exact_disposable_hook_hash_trust_may_remain: true,
      undocumented_state_inspected_or_modified: false
    },
    bounded_model_usage: {
      maximum_model_turns: 2,
      observed_sequence:
        "one fixed Bash-denial turn followed by one real interactive /compact operation",
      third_model_turn_permitted: false
    },
    errors: [],
    disposition: "no-go"
  };
}

async function inspectDocumentedState(
  hostExecutable,
  cwd,
  environment,
  signal
) {
  const marketplaces = await runHost(
    hostExecutable,
    ["plugin", "marketplace", "list", "--json"],
    { cwd, env: environment, timeoutMs: 30_000 },
    signal
  );
  const marketplaceState = parseMarketplaceList(marketplaces.stdout);
  const plugins = await runHost(
    hostExecutable,
    ["plugin", "list", "--json"],
    { cwd, env: environment, timeoutMs: 30_000 },
    signal
  );
  const pluginState = parsePluginList(plugins.stdout);
  const marketplaceAbsent =
    marketplaces.status === 0 &&
    marketplaceState !== null &&
    marketplaceState.exactNamePresent === false &&
    marketplaceState.duplicateExactNames === false;
  const pluginAbsent =
    plugins.status === 0 &&
    pluginState !== null &&
    pluginState.exactNamePresent === false &&
    pluginState.duplicateExactNames === false;
  return {
    exactNamesAbsent: marketplaceAbsent && pluginAbsent,
    otherInstalledPluginsPresent:
      pluginState?.otherInstalledPluginsPresent === true,
    setup: [
      {
        name: "marketplace-preflight",
        process: summarizeSensitiveProcess(marketplaces),
        output_valid_json: marketplaceState !== null,
        exact_name_absent: marketplaceAbsent
      },
      {
        name: "plugin-preflight",
        process: summarizeSensitiveProcess(plugins),
        output_valid_json: pluginState !== null,
        exact_name_absent: pluginAbsent
      }
    ]
  };
}

async function verifySourceBinding(gitExecutable, environment, signal) {
  const commitResult = await runHost(
    gitExecutable,
    ["rev-parse", "HEAD"],
    { cwd: repoRoot, env: environment, timeoutMs: 30_000 },
    signal
  );
  const commit = commitResult.stdout.trim();
  if (commitResult.status !== 0 || !/^[0-9a-f]{40}$/.test(commit)) {
    throw codedError("source-commit");
  }
  const statusResult = await runHost(
    gitExecutable,
    [
      "-c",
      "core.fsmonitor=false",
      "-c",
      `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
      "status",
      "--porcelain=v1",
      "--untracked-files=no"
    ],
    { cwd: repoRoot, env: environment, timeoutMs: 30_000 },
    signal
  );
  const ancestry = await runHost(
    gitExecutable,
    [
      "merge-base",
      "--is-ancestor",
      RUN_A2_BASELINE_COMMIT,
      commit
    ],
    { cwd: repoRoot, env: environment, timeoutMs: 30_000 },
    signal
  );
  return {
    commit,
    trackedClean:
      statusResult.status === 0 && statusResult.stdout.trim() === "",
    baselineIsAncestor: ancestry.status === 0
  };
}

async function runHost(command, args, options, signal) {
  const result = await runProgramAsync(command, args, {
    ...options,
    signal
  });
  if (signal?.aborted) throw codedError("interrupted");
  return result;
}

function runInteractiveProgram(command, args, options) {
  return new Promise((resolve) => {
    let child;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let killTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const stop = (reason) => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      if (reason === "timeout") timedOut = true;
      if (reason === "abort") aborted = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 2_000);
      killTimer.unref();
    };
    const abort = () => stop("abort");
    let timeout = null;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: "inherit",
        windowsHide: true
      });
      options.onChild?.(child);
      child.once("error", (error) => {
        finish({
          status: null,
          signal: null,
          timed_out: timedOut,
          aborted,
          error_code:
            typeof error?.code === "string" ? error.code : "SPAWN_ERROR"
        });
      });
      child.once("exit", (code, signal) => {
        finish({
          status: Number.isInteger(code) ? code : null,
          signal: signal || null,
          timed_out: timedOut,
          aborted,
          error_code:
            aborted
              ? "ABORT_ERR"
              : timedOut
                ? "ETIMEDOUT"
                : null
        });
      });
      options.signal?.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(() => stop("timeout"), options.timeoutMs);
      timeout.unref();
    } catch (error) {
      finish({
        status: null,
        signal: null,
        timed_out: false,
        aborted: false,
        error_code:
          typeof error?.code === "string" ? error.code : "SPAWN_ERROR"
      });
    }
  });
}

function collectSupervisionConfirmation() {
  process.stdout.write(
    [
      "\nAfter direct review, type the exact confirmation only if /status matched,",
      " /hooks showed and trusted only the committed disposable definition,",
      " and the sole model sequence was the fixed denial turn then real /compact",
      ` with no third turn:\n${SUPERVISION_CONFIRMATION}\n> `
    ].join("")
  );
  return new Promise((resolve) => {
    let input = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      resolve(value);
    };
    const onData = (chunk) => {
      input += String(chunk);
      if (Buffer.byteLength(input) > 256) {
        finish(false);
      } else if (input.includes("\n") || input.includes("\r")) {
        finish(input.trim() === SUPERVISION_CONFIRMATION);
      }
    };
    const onEnd = () => finish(false);
    const timeout = setTimeout(() => finish(false), 60_000);
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.resume();
  });
}

function printSupervisionBoundary({ cliVersion, workspace, marker, prompt }) {
  process.stdout.write(
    [
      "\nKanon Run A.2 supervised boundary",
      `CLI: ${cliVersion}`,
      `Scratch workspace: ${workspace}`,
      "Sandbox: workspace-write",
      "Approvals: on-request, user-reviewed",
      `Disposable plugin: ${PLUGIN_ID}`,
      `Exact marker: ${marker}`,
      "No initial prompt was supplied by the launcher.",
      "Use /status, then /hooks. Inspect the plugin source and exact hook definition before trusting it.",
      "After trust, submit exactly this one fixed first-turn probe:",
      prompt,
      "After that turn completes, enter /compact as the second and final model operation, then /exit.",
      ""
    ].join("\n")
  );
}

function sanitizeLaunchArguments(args, workspace) {
  return args.map((argument) =>
    argument === workspace ? "<scratch-workspace>" : argument
  );
}

function validateReportVersion(reportPath, cliVersion) {
  const match = cliVersion?.match(/^codex-cli (\d+\.\d+\.\d+)$/);
  if (
    !match ||
    !path.basename(reportPath).includes(`codex-cli-${match[1]}-`) ||
    !path.basename(reportPath).includes("run-a2")
  ) {
    throw codedError("report-version-identity");
  }
}

function parseVersion(output) {
  const match = output.trim().match(/^codex-cli (\d+\.\d+\.\d+)$/);
  return match ? `codex-cli ${match[1]}` : null;
}

function finalizeReport(report) {
  const required = Object.keys(report.criteria);
  const proven = required.filter(
    (name) => report.criteria[name] === "proven"
  );
  if (proven.length) {
    report.known.push(
      `Directly proven on this exact named surface: ${proven.join(", ")}.`
    );
  }
  const missing = required.filter(
    (name) => report.criteria[name] !== "proven"
  );
  for (const name of missing) {
    report.unknown.push(
      `${name} is Unknown because direct Run A.2 proof was not retained.`
    );
  }
  report.disposition = missing.length === 0 ? "go" : "no-go";
}

function status(value) {
  return value ? "proven" : "unknown";
}

function boundedObservationString(value, limit) {
  return typeof value === "string" && value.length <= limit
    ? value
    : null;
}

function errorIdentifier(error) {
  const code =
    typeof error?.code === "string" && /^[A-Z0-9_-]{1,80}$/i.test(error.code)
      ? error.code
      : "error";
  return `${code}:${crypto
    .createHash("sha256")
    .update(String(error?.message || error))
    .digest("hex")
    .slice(0, 16)}`;
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function signalExitCode(signal) {
  return {
    SIGHUP: 129,
    SIGINT: 130,
    SIGTERM: 143
  }[signal] || 1;
}

function usage() {
  return "Usage: node spikes/guard-feasibility/codex-cli/interactive-run.mjs --execute --report <new-run-a2-report.json>\n";
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
