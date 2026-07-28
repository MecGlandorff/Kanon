import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { invokeClaudeSkill } from "../src/v1/adapters/claude.js";
import { invokeCodexSkill } from "../src/v1/adapters/codex.js";
import { runStableCli } from "../src/v1/cli.js";
import {
  canSymlink,
  captureCli,
  makeFixture
} from "./helpers.js";

const NOW = Date.parse("2026-07-28T19:30:00.000Z");
const PACKAGE_NAME = "@mecglandorff/kanon";
const PACKAGE_VERSION = "0.4.0-rc.1";

test("aswitch asks for a target and offers exactly three bounded modes", async () => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const result = await invokeCodexSkill(
    invocation(root, selectionRequest()),
    context(fixedGitRunner())
  );

  assert.equal(result.ok, true);
  assert.equal(result.report.stage, "AwaitingTarget");
  assert.equal(result.report.automatic_launch, false);
  assert.equal(result.report.authorization, false);
  assert.deepEqual(
    result.report.payload_options.map((option) => option.mode),
    ["last-plan", "compacted", "full-history"]
  );
  assert.equal(result.report.payload_options[0].default, true);
  assert.equal(result.report.payload_options[1].recommended, true);
  assert.equal(result.report.payload_options[2].experimental, true);
  assert.equal(result.report.payload_options[2].availability, "Unknown");
});

test("last-plan preview gates one external write and returns only a manual fallback", async () => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const destination = privateDirectory("kanon-aswitch-destination-");
  const before = snapshotTree(root);
  const previewRequest = request({
    target_host: "claude-code",
    payload_mode: "last-plan",
    destination_root: destination,
    last_plan: steerRequest()
  });
  const preview = await invokeCodexSkill(
    invocation(root, previewRequest),
    context(fixedGitRunner())
  );

  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(preview.report.stage, "AwaitingApproval");
  assert.equal(preview.report.read_only, true);
  assert.equal(preview.report.preview.plan.mode, "last-plan");
  assert.equal(
    preview.report.preview.destination.privacy.status,
    process.platform === "win32" ? "Unknown" : "Known"
  );
  assert.equal(
    preview.report.preview.plan.payload.plan.authorization,
    false
  );
  assert.equal(fs.readdirSync(destination).length, 0);
  assert.deepEqual(snapshotTree(root), before);

  const missingApproval = await invokeCodexSkill(
    invocation(root, {
      ...previewRequest,
      operation: "write"
    }),
    context(fixedGitRunner())
  );
  assert.equal(missingApproval.ok, false);
  assert.equal(fs.readdirSync(destination).length, 0);

  const wrongApproval = await invokeCodexSkill(
    invocation(root, {
      ...previewRequest,
      operation: "write",
      approval: approval("0".repeat(64))
    }),
    context(fixedGitRunner())
  );
  assert.equal(wrongApproval.ok, false);
  assert.equal(wrongApproval.report.stage, "ApprovalUnavailable");
  assert.equal(fs.readdirSync(destination).length, 0);

  const written = await invokeCodexSkill(
    invocation(root, {
      ...previewRequest,
      operation: "write",
      approval: approval(preview.report.preview.preview_sha256)
    }),
    context(fixedGitRunner())
  );
  assert.equal(written.ok, true);
  assert.equal(written.report.stage, "HandoffWritten");
  assert.equal(written.report.repository_read_only, true);
  assert.equal(written.report.manual_launch.status, "Suggested");
  assert.equal(written.report.manual_launch.automatic_launch, false);
  assert.equal(
    written.report.manual_launch.executable.resolution,
    "Unknown"
  );
  assert.equal(
    written.report.manual_launch.raw_handoff_content_in_arguments,
    false
  );
  assert.equal(written.report.write.source_history_deleted, false);
  assert.equal(written.report.write.source_agent_stopped, false);
  assert.equal(written.report.write.repository_ownership_claimed, false);
  assert.match(
    written.report.write.path,
    /kanon-agent-handoff-[0-9a-f]{64}\.json$/
  );
  assert.equal(fs.existsSync(written.report.write.path), true);
  assert.equal(
    JSON.stringify(written.report.manual_launch.arguments).includes(
      "Deliver one verified slice"
    ),
    false
  );
  assert.deepEqual(snapshotTree(root), before);
});

test("receiving validation distinguishes Current, Stale, and Unknown", async () => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const destination = privateDirectory("kanon-aswitch-receive-");
  const git = fixedGitRunner();
  const previewRequest = request({
    target_host: "claude-code",
    payload_mode: "last-plan",
    destination_root: destination,
    last_plan: steerRequest()
  });
  const preview = await invokeCodexSkill(
    invocation(root, previewRequest),
    context(git)
  );
  const written = await invokeCodexSkill(
    invocation(root, {
      ...previewRequest,
      operation: "write",
      approval: approval(preview.report.preview.preview_sha256)
    }),
    context(git)
  );
  const handoffPath = written.report.write.path;

  const current = await invokeClaudeSkill(
    invocation(root, receiveRequest(handoffPath)),
    context(git)
  );
  assert.equal(current.ok, true);
  assert.equal(current.report.classification, "Current");
  assert.deepEqual(current.report.comparisons, {
    checksum: "Known",
    target_host: "Known",
    canonical_root: "Known",
    recorded_commit: "Known",
    change_set: "Known"
  });
  assert.equal(
    current.report.requires_refresh_or_explicit_approval,
    false
  );

  const original = fs.readFileSync(handoffPath, "utf8");
  const tampered = JSON.parse(original);
  tampered.payload.plan.desired_outcome.value = "tampered";
  fs.writeFileSync(handoffPath, `${JSON.stringify(tampered)}\n`);
  const checksumStale = await invokeClaudeSkill(
    invocation(root, receiveRequest(handoffPath)),
    context(git)
  );
  assert.equal(checksumStale.ok, false);
  assert.equal(checksumStale.report.classification, "Stale");
  fs.writeFileSync(handoffPath, original);

  const otherRoot = makeFixture({ "README.md": "# Other\n" });
  const rootStale = await invokeClaudeSkill(
    invocation(otherRoot, receiveRequest(handoffPath)),
    context(git)
  );
  assert.equal(rootStale.report.classification, "Stale");
  assert.equal(rootStale.report.comparisons.canonical_root, "Stale");

  const commitStale = await invokeClaudeSkill(
    invocation(root, receiveRequest(handoffPath)),
    context(fixedGitRunner({ head: "c".repeat(40) }))
  );
  assert.equal(commitStale.report.classification, "Stale");
  assert.equal(commitStale.report.comparisons.recorded_commit, "Stale");

  const changesStale = await invokeClaudeSkill(
    invocation(root, receiveRequest(handoffPath)),
    context(fixedGitRunner({ status: " M src/changed.js\0" }))
  );
  assert.equal(changesStale.report.classification, "Stale");
  assert.equal(changesStale.report.comparisons.change_set, "Stale");

  const unknown = await invokeClaudeSkill(
    invocation(root, receiveRequest(handoffPath)),
    context(fixedGitRunner({ failStatus: true }))
  );
  assert.equal(unknown.ok, false);
  assert.equal(unknown.report.classification, "Unknown");
  assert.equal(unknown.report.comparisons.recorded_commit, "Unknown");
  assert.equal(unknown.report.comparisons.change_set, "Unknown");

  const wrongHost = await invokeCodexSkill(
    invocation(root, receiveRequest(handoffPath)),
    context(git)
  );
  assert.equal(wrongHost.report.classification, "Stale");
  assert.equal(wrongHost.report.comparisons.target_host, "Stale");
});

test("compacted handoff keeps claims untrusted and live changed files separate", async () => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const destination = privateDirectory("kanon-aswitch-compacted-");
  const compacted = compactedInput();
  const result = await invokeClaudeSkill(
    invocation(root, request({
      target_host: "codex-cli",
      payload_mode: "compacted",
      destination_root: destination,
      compacted
    })),
    context(fixedGitRunner({ status: " M src/current.js\0" }))
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  const payload = result.report.preview.plan.payload;
  assert.equal(payload.schema, "kanon-compacted-handoff-v1");
  assert.equal(payload.goal.trust, "caller-untrusted");
  assert.equal(
    payload.decisions[0].provenance,
    "caller-asserted-user-decision"
  );
  assert.equal(payload.evidence_references[0].status, "Unknown");
  assert.equal(payload.completed_validation[0].status, "Unknown");
  assert.equal(payload.changed_files.status, "Known");
  assert.deepEqual(
    payload.changed_files.values.map((item) => item.value),
    ["src/current.js"]
  );
  assert.equal(payload.suggested_next_step.status, "Suggested");

  let toJsonCalled = false;
  const hostile = {
    toJSON() {
      toJsonCalled = true;
      return "must-not-run";
    }
  };
  const rejected = await invokeClaudeSkill(
    invocation(root, request({
      target_host: "codex-cli",
      payload_mode: "compacted",
      destination_root: destination,
      compacted: {
        ...compacted,
        completed_validation: [hostile]
      }
    })),
    context(fixedGitRunner())
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.report.stage, "PayloadUnavailable");
  assert.equal(toJsonCalled, false);

  const hostilePlan = steerRequest();
  Object.defineProperty(hostilePlan, "completion_criteria", {
    enumerable: true,
    get() {
      throw new Error("must not escape the boundary");
    }
  });
  const nested = await invokeClaudeSkill(
    invocation(root, {
      ...selectionRequest(),
      last_plan: hostilePlan
    }),
    context(fixedGitRunner())
  );
  assert.equal(nested.ok, true);
  assert.equal(nested.report.payload_options[0].availability, "Unknown");
});

test("handoff writes reject repository overlap and linked destinations", async (t) => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const overlap = await invokeCodexSkill(
    invocation(root, request({
      target_host: "claude-code",
      payload_mode: "last-plan",
      destination_root: root,
      last_plan: steerRequest()
    })),
    context(fixedGitRunner())
  );
  assert.equal(overlap.ok, false);
  assert.equal(overlap.status, "Unknown");

  const controlled = privateDirectory("kanon-aswitch-controls-");
  const controlledPath = `${controlled}\nspoofed`;
  const controlsRejected = await invokeCodexSkill(
    invocation(root, request({
      target_host: "claude-code",
      payload_mode: "last-plan",
      destination_root: controlledPath,
      last_plan: steerRequest()
    })),
    context(fixedGitRunner())
  );
  assert.equal(controlsRejected.ok, false);

  if (!canSymlink()) {
    t.diagnostic("Symbolic links are unavailable; linked cases skipped.");
    return;
  }
  const parent = privateDirectory("kanon-aswitch-link-parent-");
  const real = privateDirectory("kanon-aswitch-link-real-");
  const linkedRoot = path.join(parent, "linked");
  fs.symlinkSync(real, linkedRoot, "dir");
  const linked = await invokeCodexSkill(
    invocation(root, request({
      target_host: "claude-code",
      payload_mode: "last-plan",
      destination_root: linkedRoot,
      last_plan: steerRequest()
    })),
    context(fixedGitRunner())
  );
  assert.equal(linked.ok, false);

  const destination = privateDirectory("kanon-aswitch-link-file-");
  const previewRequest = request({
    target_host: "claude-code",
    payload_mode: "last-plan",
    destination_root: destination,
    last_plan: steerRequest()
  });
  const preview = await invokeCodexSkill(
    invocation(root, previewRequest),
    context(fixedGitRunner())
  );
  const outside = path.join(
    privateDirectory("kanon-aswitch-outside-"),
    "outside.json"
  );
  fs.writeFileSync(outside, "untouched\n");
  fs.symlinkSync(outside, preview.report.preview.destination.path, "file");
  const write = await invokeCodexSkill(
    invocation(root, {
      ...previewRequest,
      operation: "write",
      approval: approval(preview.report.preview.preview_sha256)
    }),
    context(fixedGitRunner())
  );
  assert.equal(write.ok, false);
  assert.equal(fs.readFileSync(outside, "utf8"), "untouched\n");

  const fullDestination = privateDirectory("kanon-aswitch-capacity-");
  for (let index = 0; index < 8; index += 1) {
    fs.writeFileSync(
      path.join(
        fullDestination,
        `kanon-agent-handoff-${index.toString(16).padStart(64, "0")}.json`
      ),
      "{}\n",
      { mode: 0o600 }
    );
  }
  const overCapacity = await invokeCodexSkill(
    invocation(root, request({
      target_host: "claude-code",
      payload_mode: "last-plan",
      destination_root: fullDestination,
      last_plan: steerRequest()
    })),
    context(fixedGitRunner())
  );
  assert.equal(overCapacity.ok, false);
  assert.equal(fs.readdirSync(fullDestination).length, 8);
});

test("aswitch CLI accepts only one bounded request on stdin", async () => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const body = `${JSON.stringify(selectionRequest())}\n`;
  const output = await captureCli(
    runStableCli,
    ["aswitch", "--request-stdin", "--json", "--root", root],
    {
      stdin: Readable.from([body]),
      environment: { PLUGIN_ROOT: "/installed/kanon" }
    }
  );
  const parsed = JSON.parse(output);
  assert.equal(parsed.skill, "aswitch");
  assert.equal(parsed.host.name, "codex-cli");
  assert.equal(parsed.report.stage, "AwaitingTarget");

  await assert.rejects(
    () => captureCli(runStableCli, ["aswitch", "--root", root]),
    /requires exactly --request-stdin/
  );
  await assert.rejects(
    () => captureCli(
      runStableCli,
      ["orient", "--request-stdin", "--root", root],
      { stdin: Readable.from([body]) }
    ),
    /available only for aswitch/
  );
  await assert.rejects(
    () => captureCli(
      runStableCli,
      [
        "aswitch",
        "--request-stdin",
        "--state-stdin",
        "--root",
        root
      ],
      { stdin: Readable.from([body]) }
    ),
    /cannot be combined/
  );
  await assert.rejects(
    () => captureCli(
      runStableCli,
      ["aswitch", "--request-stdin", "--root", root],
      { stdin: Readable.from(["{malformed"]) }
    ),
    /Aswitch request input was malformed/
  );
  await assert.rejects(
    () => captureCli(
      runStableCli,
      ["aswitch", "--request-stdin", "--root", root],
      { stdin: Readable.from(["x".repeat(64 * 1024 + 1)]) }
    ),
    /exceeded the 64 KiB limit/
  );
});

/**
 * @param {string} root
 * @param {Record<string, unknown>} aswitchRequest
 * @returns {Record<string, unknown>}
 */
function invocation(root, aswitchRequest) {
  return {
    schema: "kanon-stable-invocation-v1",
    skill: "aswitch",
    root,
    aswitch_request: aswitchRequest
  };
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function request(overrides = {}) {
  return {
    ...selectionRequest(),
    ...overrides
  };
}

/**
 * @returns {Record<string, unknown>}
 */
function selectionRequest() {
  return {
    schema: "kanon-aswitch-request-v1",
    operation: "preview",
    target_host: null,
    payload_mode: null,
    destination_root: null,
    last_plan: null,
    compacted: null,
    approval: null
  };
}

/**
 * @param {string} handoffPath
 * @returns {Record<string, unknown>}
 */
function receiveRequest(handoffPath) {
  return {
    schema: "kanon-aswitch-request-v1",
    operation: "receive",
    handoff_path: handoffPath
  };
}

/**
 * @param {string} previewSha256
 * @returns {Record<string, unknown>}
 */
function approval(previewSha256) {
  return {
    schema: "kanon-aswitch-approval-v1",
    approved: true,
    preview_sha256: previewSha256
  };
}

/**
 * @returns {Record<string, unknown>}
 */
function steerRequest() {
  return {
    schema: "kanon-steer-request-v1",
    phase: "understand",
    desired_outcome: "Deliver one verified slice",
    completion_criteria: ["The bounded acceptance checks pass."],
    constraints: ["Do not execute repository-controlled code."],
    user_decisions: ["Use a manual handoff fallback."],
    evidence_references: ["caller-supplied validation report"],
    unknowns: ["Target executable resolution is unproven."],
    next_slice: {
      objective: "Transfer only the last bounded plan.",
      boundaries: ["No launch", "No ownership claim"]
    },
    required_verification: ["Validate the receiving repository identity."],
    stop_or_redirect_reasons: []
  };
}

/**
 * @returns {Record<string, unknown>}
 */
function compactedInput() {
  return {
    schema: "kanon-compacted-handoff-input-v1",
    goal: "Complete one bounded handoff.",
    decisions: ["The user selected a manual fallback."],
    constraints: ["Do not launch a process."],
    live_work_state: "One explicit preview is ready.",
    evidence_references: ["caller report A"],
    completed_validation: ["focused tests reportedly passed"],
    unknowns: ["Target executable resolution remains unavailable."],
    remaining_plan: ["Receive and revalidate the handoff."],
    suggested_next_step: "Inspect the receiving classification."
  };
}

/**
 * @param {ReturnType<typeof fixedGitRunner>} runner
 * @returns {Record<string, unknown>}
 */
function context(runner) {
  return {
    now: NOW,
    git_runner: runner,
    transport: async () => ({
      ok: true,
      status_code: 200,
      content_type: "application/json",
      body: JSON.stringify({
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION
      })
    })
  };
}

/**
 * @param {{
 *   head?: string,
 *   status?: string,
 *   failStatus?: boolean
 * }} [options]
 * @returns {(root: string, args: string[]) => Record<string, unknown>}
 */
function fixedGitRunner(options = {}) {
  return (_root, args) => {
    if (
      options.failStatus &&
      args[0] === "status"
    ) {
      return {
        ok: false,
        status: 1,
        stdout: "",
        stderr: "",
        timeout: false,
        overflow: false,
        diagnostic: "status unavailable"
      };
    }
    let stdout = "";
    if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
      stdout = "true\n";
    } else if (args[0] === "rev-parse") {
      stdout = `${options.head || "b".repeat(40)}\n`;
    } else if (args[0] === "branch") {
      stdout = "release/v.1.0.0\n";
    } else if (args[0] === "status") {
      stdout = options.status || "";
    } else if (args[0] === "log") {
      stdout =
        `${options.head || "b".repeat(40)}\u00002026-07-28\u0000fixture commit\u0000`;
    }
    return {
      ok: true,
      status: 0,
      stdout,
      stderr: "",
      timeout: false,
      overflow: false
    };
  };
}

/**
 * @param {string} prefix
 * @returns {string}
 */
function privateDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  if (process.platform !== "win32") {
    fs.chmodSync(directory, 0o700);
  }
  return fs.realpathSync(directory);
}

/**
 * @param {string} root
 * @returns {Record<string, string>}
 */
function snapshotTree(root) {
  /** @type {Record<string, string>} */
  const output = {};
  visit(root, "");
  return output;

  /**
   * @param {string} directory
   * @param {string} prefix
   * @returns {void}
   */
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute, relative);
      } else {
        output[relative] = fs.readFileSync(absolute).toString("base64");
      }
    }
  }
}
