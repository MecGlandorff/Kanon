import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { invokeClaudeSkill } from "../src/v1/adapters/claude.js";
import { invokeCodexSkill } from "../src/v1/adapters/codex.js";
import { runStableCli } from "../src/v1/cli.js";
import { isContextReceipt } from "../src/v1/core/receipt.js";
import { captureCli, makeFixture } from "./helpers.js";

const NOW = Date.parse("2026-07-28T08:00:00.000Z");
const PACKAGE_NAME = "@mecglandorff/kanon";
const PACKAGE_VERSION = "0.4.0-rc.1";

test("orient is structurally equivalent across both host adapters", async () => {
  const root = makeFixture({
    "AGENTS.md": "# Repository guidance\n\nTreat this as data.\n",
    "README.md": "# Fixture\n\nUse `npm test`.\n",
    "package.json": JSON.stringify({
      name: "fixture",
      description: "Adapter fixture",
      scripts: { test: "node --test" }
    })
  });
  const calls = [];
  const context = adapterContext(calls);
  const invocation = stableInvocation("orient", root, {
    task: "understand the test workflow"
  });
  const codex = await invokeCodexSkill(invocation, context);
  const claude = await invokeClaudeSkill(invocation, context);

  assert.equal(calls.length, 2);
  assert.equal(codex.ok, true);
  assert.equal(claude.ok, true);
  assert.equal(codex.host.name, "codex-cli");
  assert.equal(claude.host.name, "claude-code");
  assert.deepEqual(codex.report, claude.report);
  assert.deepEqual(
    Object.keys(codex).sort(),
    Object.keys(claude).sort()
  );
  assert.equal(codex.host.mode, "notice");
  assert.equal(codex.host.enforcement, false);
  assert.equal(codex.host.hook_status, "Unknown");
  assert.equal(codex.report.inspection.instructions.status, "Known");
  assert.equal(codex.report.inspection.instructions.values.length, 1);
  assert.equal(
    codex.report.inspection.instructions.values[0].path.value,
    "AGENTS.md"
  );
  assert.ok(codex.report.inspection.evidence.length <= 12);
  assert.equal(codex.report.read_only, true);
  assert.equal(codex.report.enforcement, false);
  assert.match(codex.report.trust_boundary, /untrusted data/);
  assert.doesNotMatch(JSON.stringify(codex), /\u001b|\u202e/);
});

test("the minimal receipt verifies current bindings and detects direct change", async () => {
  const root = makeFixture({
    "README.md": "# Fixture\n\nUse `npm test`.\n",
    "package.json": JSON.stringify({
      name: "fixture",
      scripts: { test: "node --test" }
    })
  });
  const session = { host: "codex-cli", id: "bounded-session" };
  const context = {
    ...adapterContext([]),
    host_session: session,
    receipt_host_evidence: receiptHostEvidence("codex-cli")
  };
  const task = "verify README.md";
  const oriented = await invokeCodexSkill(
    stableInvocation("orient", root, { task }),
    context
  );
  assert.equal(oriented.report.ok, true);
  const receipt = oriented.report.receipt;
  assert.equal(isContextReceipt(receipt), true);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "enforcement",
    "evidence_sha256",
    "host_evidence_sha256",
    "issued_at",
    "provenance",
    "root_sha256",
    "schema",
    "task_sha256"
  ]);
  assert.equal(receipt.schema, "kanon-context-receipt-v2");
  assert.equal(receipt.enforcement, false);
  assert.equal(receipt.provenance, "explicit-orient");
  assert.equal(receipt.issued_at, NOW);
  assert.match(receipt.host_evidence_sha256, /^[0-9a-f]{64}$/);
  assert.equal(fs.existsSync(path.join(root, ".kanon")), false);

  const verified = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task,
      target: "README.md",
      receipt
    }),
    context
  );
  assert.equal(verified.report.ok, true);
  assert.deepEqual(verified.report.receipt, {
    status: "Known",
    freshness: "Current",
    diagnostic:
      "Receipt root, task, evidence, session, compaction, lifecycle, and host bindings match current observations."
  });

  fs.writeFileSync(
    path.join(root, "README.md"),
    "# Changed fixture\n\nUse `npm test`.\n"
  );
  const stale = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task,
      target: "README.md",
      receipt
    }),
    context
  );
  assert.equal(stale.report.receipt.status, "Stale");
  assert.match(
    stale.report.receipt.diagnostic,
    /directly contradicts current/
  );
  assert.equal(fs.existsSync(path.join(root, ".kanon")), false);
});

test("the receipt evidence binding includes observed Git state", async () => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  let head = "a".repeat(40);
  const gitRunner = (_root, args) => {
    if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
      return gitSuccess("true\n");
    }
    if (args[0] === "branch") {
      return gitSuccess("main\n");
    }
    if (args[0] === "rev-parse") {
      return gitSuccess(`${head}\n`);
    }
    if (args[0] === "log") {
      return gitSuccess(
        `${head}\u00002026-07-28\u0000fixture commit\u0000`
      );
    }
    return gitSuccess("");
  };
  const context = {
    ...adapterContext([]),
    host_session: {
      host: "codex-cli",
      id: "git-binding-session"
    },
    receipt_host_evidence: receiptHostEvidence("codex-cli"),
    git_runner: gitRunner
  };
  const task = "verify README.md";
  const oriented = await invokeCodexSkill(
    stableInvocation("orient", root, { task }),
    context
  );

  head = "b".repeat(40);
  const verified = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task,
      target: "README.md",
      receipt: oriented.report.receipt
    }),
    context
  );
  assert.equal(verified.report.receipt.status, "Stale");
  assert.match(
    verified.report.receipt.diagnostic,
    /directly contradicts current/
  );
});

test("resume uses the shared continuity engine and leaves the repository unchanged", async () => {
  const root = makeFixture({
    "README.md": "# Live purpose\n",
    ".kanon/STATE.json": "",
    "plugin-data/placeholder": ""
  });
  const oldText = "# Prior purpose\n";
  const previous = {
    repo: { root: fs.realpathSync(root) },
    generated_at: "2026-07-27T08:00:00.000Z",
    files: {
      fingerprints: [
        {
          path: "README.md",
          size: Buffer.byteLength(oldText),
          sha256: sha256(oldText)
        }
      ]
    },
    scan: { complete: true, budgets_reached: [] },
    git: {
      found: true,
      observation_complete: true,
      branch: "main",
      head: "a".repeat(40),
      recent_commits: []
    },
    purpose: { claim: "Prior purpose" },
    verification: { issues: [] }
  };
  fs.writeFileSync(
    path.join(root, ".kanon", "STATE.json"),
    `${JSON.stringify(previous)}\n`
  );
  const before = snapshotTree(root);
  const resumed = await invokeCodexSkill(
    stableInvocation("resume", root, {
      task: "continue the documented work"
    }),
    {
      ...adapterContext([]),
      now: NOW,
      host_session: {
        host: "codex-cli",
        id: "read-only-resume-session"
      },
      plugin_data_root: path.join(root, "plugin-data")
    }
  );
  const after = snapshotTree(root);

  assert.deepEqual(after, before);
  assert.equal(resumed.report.ok, true);
  assert.equal(resumed.report.read_only, true);
  assert.equal(
    resumed.report.continuity.schema,
    "kanon-continuity-report-v1"
  );
  assert.equal(resumed.report.continuity.authority, "live");
  assert.ok(
    resumed.report.continuity.observations.changed.some(
      (item) => item.path === "README.md"
    ),
    JSON.stringify(resumed.report.continuity)
  );
  assert.ok(
    resumed.report.continuity.observations.contradicted.some(
      (item) => /purpose claim differs/.test(item.claim)
    ),
    JSON.stringify(resumed.report.continuity.observations)
  );
});

test("verify separates contradictions, non-observation, and declarations", async () => {
  const root = makeFixture({
    "README.md":
      "# Fixture\n\nRun `npm run deploy` and inspect `src/missing.js`.\n",
    "package.json": JSON.stringify({
      name: "fixture",
      scripts: {
        test: "node --test",
        validate: "npm test"
      }
    }),
    "src/v1/example.js": "export const value = 1;\n",
    "runtime/example.js": "export const value = 2;\n",
    "src/v1/bin/kanon.js": "export const cli = true;\n",
    "runtime/bin/kanon-v1.js": "export const cli = true;\n"
  });
  const result = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task: "verify README.md",
      target: "README.md"
    }),
    adapterContext([])
  );

  assert.equal(result.report.ok, true);
  assert.equal(result.report.status, "Stale");
  assert.equal(result.report.documentation.status, "Stale");
  assert.equal(
    result.report.documentation.scope,
    "observed-target-and-package-script-claims"
  );
  assert.equal(
    result.report.documentation.contradictions[0].classification,
    "direct-contradiction"
  );
  assert.equal(result.report.documentation.claims_truncated, false);
  assert.ok(
    result.report.documentation.non_observations.some(
      (item) => item.classification === "non-observation"
    )
  );
  assert.equal(result.report.generated_artifacts.status, "Stale");
  assert.equal(result.report.generated_artifacts.compared, 2);
  assert.equal(result.report.generated_artifacts.matching, 1);
  assert.equal(
    result.report.generated_artifacts.contradictions[0].classification,
    "direct-contradiction"
  );
  assert.equal(result.report.declared_validation.status, "Known");
  assert.equal(
    result.report.declared_validation.scope,
    "conventional-package-scripts"
  );
  assert.equal(
    result.report.declared_validation.execution_status,
    "Unknown"
  );
  assert.match(
    result.report.declared_validation.diagnostic,
    /did not execute/
  );
  assert.equal(result.report.receipt.status, "Unknown");

  const missingTarget = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task: "verify docs/missing.md",
      target: "docs/missing.md"
    }),
    adapterContext([])
  );
  assert.equal(missingTarget.report.documentation.status, "Unknown");
  assert.equal(
    missingTarget.report.documentation.contradictions.length,
    0
  );
  assert.equal(
    missingTarget.report.documentation.non_observations[0]
      .repository_value.value,
    "docs/missing.md"
  );
});

test("declared-validation Unknown prevents an aggregate Known claim", async () => {
  const scripts = Object.fromEntries(
    Array.from(
      { length: 17 },
      (_, index) => [`test:${index}`, `node --test test-${index}.js`]
    )
  );
  const root = makeFixture({
    "README.md": "# Fixture\n",
    "package.json": JSON.stringify({
      name: "fixture",
      version: "1.2.3",
      scripts
    }),
    "runtime/build-metadata.json": JSON.stringify({
      package_version: "1.2.3"
    }),
    "src/v1/example.js": "export const value = 1;\n",
    "runtime/example.js": "export const value = 1;\n"
  });
  const task = "verify README.md";
  const context = {
    ...adapterContext([]),
    host_session: {
      host: "codex-cli",
      id: "declared-validation-session"
    },
    receipt_host_evidence: receiptHostEvidence("codex-cli")
  };
  const oriented = await invokeCodexSkill(
    stableInvocation("orient", root, { task }),
    context
  );
  const result = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task,
      target: "README.md",
      receipt: oriented.report.receipt
    }),
    context
  );

  assert.equal(result.report.documentation.status, "Known");
  assert.equal(result.report.generated_artifacts.status, "Known");
  assert.equal(result.report.continuity.status, "Known");
  assert.equal(result.report.receipt.status, "Known");
  assert.equal(result.report.declared_validation.status, "Unknown");
  assert.equal(
    result.report.declared_validation.declarations.length,
    16
  );
  assert.equal(
    result.report.declared_validation.declarations_truncated,
    true
  );
  assert.equal(result.report.status, "Unknown");
});

test("unobserved declared-validation execution prevents aggregate Known", async () => {
  const root = makeFixture({
    "README.md": "# Fixture\n",
    "package.json": JSON.stringify({
      name: "fixture",
      version: "1.2.3",
      scripts: {
        test: "node --test",
        validate: "npm test"
      }
    }),
    "runtime/build-metadata.json": JSON.stringify({
      package_version: "1.2.3"
    }),
    "src/v1/example.js": "export const value = 1;\n",
    "runtime/example.js": "export const value = 1;\n"
  });
  const task = "verify README.md";
  const context = {
    ...adapterContext([]),
    host_session: {
      host: "codex-cli",
      id: "declared-execution-session"
    },
    receipt_host_evidence: receiptHostEvidence("codex-cli")
  };
  const oriented = await invokeCodexSkill(
    stableInvocation("orient", root, { task }),
    context
  );
  const result = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task,
      target: "README.md",
      receipt: oriented.report.receipt
    }),
    context
  );

  assert.equal(result.report.documentation.status, "Known");
  assert.equal(result.report.generated_artifacts.status, "Known");
  assert.equal(result.report.continuity.status, "Known");
  assert.equal(result.report.receipt.status, "Known");
  assert.equal(result.report.declared_validation.status, "Known");
  assert.equal(
    result.report.declared_validation.declarations.length,
    2
  );
  assert.equal(
    result.report.declared_validation.execution_status,
    "Unknown"
  );
  assert.equal(result.report.status, "Unknown");
});

test("verify target establishes deterministic nested instruction scope", async () => {
  const root = makeFixture({
    "AGENTS.md": "root instruction\n",
    "nested/AGENTS.md": "nested instruction\n",
    "nested/README.md": "# Nested fixture\n"
  });
  const result = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task: "custom verification request",
      target: "nested/README.md"
    }),
    adapterContext([])
  );

  assert.deepEqual(
    result.report.live.instructions.values.map(
      (item) => item.path.value
    ),
    ["AGENTS.md", "nested/AGENTS.md"]
  );
  assert.equal(
    result.report.live.instructions.values[1].excerpt.value,
    "nested instruction"
  );
});

test("generated-artifact comparison limits remain explicitly Unknown", async () => {
  /** @type {Record<string, string>} */
  const files = {
    "README.md": "# Fixture\n"
  };
  for (let index = 0; index < 65; index += 1) {
    const name = `pair-${String(index).padStart(2, "0")}.js`;
    files[`src/v1/${name}`] = `export const value = ${index};\n`;
    files[`runtime/${name}`] = files[`src/v1/${name}`];
  }
  const root = makeFixture(files);
  const result = await invokeCodexSkill(
    stableInvocation("verify", root, {
      task: "verify README.md",
      target: "README.md"
    }),
    adapterContext([])
  );

  assert.equal(result.report.generated_artifacts.compared, 64);
  assert.equal(result.report.generated_artifacts.matching, 64);
  assert.equal(result.report.generated_artifacts.status, "Unknown");
  assert.equal(
    result.report.generated_artifacts.contradictions_truncated,
    false
  );
  assert.match(
    result.report.generated_artifacts.non_observations.join(" "),
    /comparison limit was reached/
  );
});

test("status reports exact embedded capability state without inventing hook introspection", async () => {
  const root = makeFixture({ "README.md": "# Fixture\n" });
  const receiptResult = await invokeCodexSkill(
    stableInvocation("orient", root, { task: "status fixture" }),
    adapterContext([])
  );
  const receipt = receiptResult.report.receipt;
  const codex = await invokeCodexSkill(
    stableInvocation("status", root, { receipt }),
    adapterContext([])
  );
  const claude = await invokeClaudeSkill(
    stableInvocation("status", root, { receipt }),
    adapterContext([])
  );

  for (const result of [codex, claude]) {
    assert.equal(result.report.ok, true);
    assert.equal(result.report.embedded_version.status, "Known");
    assert.equal(result.report.repository_root.status, "Known");
    assert.equal(
      result.report.repository_root.value.trust,
      "repository-untrusted"
    );
    assert.equal(
      result.report.embedded_version.package_version,
      PACKAGE_VERSION
    );
    assert.equal(result.report.deprecation_status, "Current");
    assert.equal(result.report.hosts["codex-cli"].mode, "notice");
    assert.equal(result.report.hosts["codex-cli"].enforcement, false);
    assert.equal(result.report.hosts["codex-cli"].hook_status, "Unknown");
    assert.equal(result.report.hosts["claude-code"].mode, "notice");
    assert.equal(result.report.receipt.status, "Available");
    assert.equal(result.report.receipt.freshness, "Unknown");
    assert.match(result.report.receipt.diagnostic, /does not rescan/);
  }
  assert.deepEqual(
    Object.keys(codex.report).sort(),
    Object.keys(claude.report).sort()
  );
});

test("every stable invocation consults deprecation even when input is malformed", async () => {
  const calls = [];
  for (const skill of ["orient", "resume", "verify", "status"]) {
    const root = makeFixture({ "README.md": "# Fixture\n" });
    await invokeCodexSkill(
      stableInvocation(skill, root),
      adapterContext(calls)
    );
  }
  const malformed = await invokeCodexSkill(
    { schema: "wrong", skill: "orient" },
    adapterContext(calls)
  );
  assert.equal(calls.length, 5);
  assert.equal(malformed.skill, "Unknown");
  assert.equal(malformed.status, "Unknown");
  assert.equal(malformed.report.enforcement, false);
  assert.equal(malformed.deprecation.status, "Current");
});

test("the checked CLI preserves narrow compatibility routes and rejects removed skills", async () => {
  const root = makeFixture({
    "README.md": "# Fixture purpose\n",
    "package.json": JSON.stringify({ name: "fixture" })
  });
  for (const argv of [
    ["brief", "--json", "--root", root],
    ["ask", "what does this repo do?", "--json", "--root", root],
    ["resume", "--json", "--root", root],
    ["verify", "README.md", "--json", "--root", root]
  ]) {
    const output = await captureCli(runStableCli, argv);
    const parsed = JSON.parse(output);
    assert.equal(parsed.schema, "kanon-stable-skill-result-v1");
    assert.equal(parsed.version, PACKAGE_VERSION);
  }
  await assert.rejects(
    () => captureCli(runStableCli, ["steer", "--root", root]),
    /Unknown command/
  );
  await assert.rejects(
    () => captureCli(runStableCli, ["aswitch", "--root", root]),
    /Unknown command/
  );
  await assert.rejects(
    () =>
      captureCli(runStableCli, [
        "ask",
        "what does this repo do and how do I test it?",
        "--root",
        root
      ]),
    /one narrow/
  );
});

/**
 * @param {string} skill
 * @param {string} root
 * @param {Record<string, unknown>} [fields]
 * @returns {Record<string, unknown>}
 */
function stableInvocation(skill, root, fields = {}) {
  return {
    schema: "kanon-stable-invocation-v1",
    skill,
    root,
    ...fields
  };
}

/**
 * @param {unknown[]} calls
 * @returns {Record<string, unknown>}
 */
function adapterContext(calls) {
  return {
    now: NOW,
    git_runner: fixedGitRunner,
    transport: async (request) => {
      calls.push(request);
      return {
        ok: true,
        status_code: 200,
        content_type: "application/json",
        body: JSON.stringify({
          name: PACKAGE_NAME,
          version: PACKAGE_VERSION
        })
      };
    }
  };
}

/**
 * @param {string} _root
 * @param {string[]} args
 * @returns {Record<string, unknown>}
 */
function fixedGitRunner(_root, args) {
  let stdout = "";
  if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
    stdout = "true\n";
  } else if (args[0] === "rev-parse") {
    stdout = `${"b".repeat(40)}\n`;
  } else if (args[0] === "branch") {
    stdout = "main\n";
  } else if (args[0] === "log") {
    stdout = `${"b".repeat(40)}\u00002026-07-28\u0000fixture commit\u0000`;
  }
  return {
    ok: true,
    status: 0,
    stdout,
    stderr: "",
    timeout: false,
    overflow: false
  };
}

/**
 * @param {string} stdout
 * @returns {Record<string, unknown>}
 */
function gitSuccess(stdout) {
  return {
    ok: true,
    status: 0,
    stdout,
    stderr: "",
    timeout: false,
    overflow: false
  };
}

/**
 * @param {"codex-cli" | "claude-code"} host
 * @returns {Record<string, string>}
 */
function receiptHostEvidence(host) {
  return {
    host,
    session_id: "bounded-session",
    compaction_id: "bounded-compaction",
    lifecycle_id: "bounded-lifecycle"
  };
}

/**
 * @param {string} root
 * @returns {Record<string, string>}
 */
function snapshotTree(root) {
  /** @type {Record<string, string>} */
  const values = {};
  walk(root, "");
  return values;

  /**
   * @param {string} directory
   * @param {string} relative
   * @returns {void}
   */
  function walk(directory, relative) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const selected = relative
        ? `${relative}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        walk(target, selected);
      } else {
        values[selected] = fs.readFileSync(target).toString("base64");
      }
    }
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
