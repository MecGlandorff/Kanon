import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { invokeCodexSkill } from "../src/v1/adapters/codex.js";
import {
  createContextReceipt,
  isContextReceipt,
  isReceiptHostEvidence,
  inspectReceiptStatus,
  verifyContextReceipt,
  RECEIPT_RETENTION_MS
} from "../src/v1/core/receipt.js";
import {
  readContextReceiptStore
} from "../src/v1/core/receipt-store.js";
import { makeFixture } from "./helpers.js";

const NOW = Date.parse("2026-07-28T10:00:00.000Z");
const PACKAGE_NAME = "@mecglandorff/kanon";
const PACKAGE_VERSION = "0.4.0-rc.1";
const RECEIPT_FILE = "context-receipts-v1.json";

test("explicit orient persists only bounded hashes and verify reloads them", async () => {
  const root = makeRepository("receipt persistence fixture");
  const pluginData = makePluginData();
  const task = "verify the bounded receipt lifecycle";
  const context = receiptContext(pluginData);
  const before = snapshotTree(root);

  const oriented = await invokeCodexSkill(
    invocation("orient", root, { task }),
    context
  );
  assert.equal(oriented.report.ok, true);
  assert.equal(oriented.report.read_only, false);
  assert.equal(oriented.report.repository_read_only, true);
  assert.equal(oriented.report.receipt.schema, "kanon-context-receipt-v2");
  assert.equal(oriented.report.receipt.enforcement, false);
  assert.equal(oriented.report.receipt.provenance, "explicit-orient");
  assert.equal(oriented.report.receipt_storage.status, "Known");
  assert.equal(oriented.report.receipt_storage.medium, "plugin-data");
  assert.equal(oriented.report.receipt_storage.operation, "created");
  assert.equal(oriented.report.receipt_storage.recovery, "none");
  assert.equal(isContextReceipt(oriented.report.receipt), true);
  assert.deepEqual(snapshotTree(root), before);

  const storedText = fs.readFileSync(
    path.join(pluginData, RECEIPT_FILE),
    "utf8"
  );
  const stored = JSON.parse(storedText);
  assert.equal(stored.schema, "kanon-context-receipt-store-v1");
  assert.equal(stored.receipts.length, 1);
  assert.deepEqual(stored.receipts[0], oriented.report.receipt);
  assert.ok(Buffer.byteLength(storedText) <= 16 * 1024);
  for (const forbidden of [
    root,
    task,
    "receipt persistence fixture",
    "session-secret-value",
    "compaction-secret-value",
    "lifecycle-secret-value"
  ]) {
    assert.doesNotMatch(storedText, new RegExp(escapeRegExp(forbidden)));
  }

  const verified = await invokeCodexSkill(
    invocation("verify", root, {
      task,
      target: "README.md"
    }),
    context
  );
  assert.equal(verified.report.receipt_source.status, "Known");
  assert.equal(verified.report.receipt_source.medium, "plugin-data");
  assert.deepEqual(verified.report.receipt, {
    status: "Known",
    freshness: "Current",
    diagnostic:
      "Receipt root, task, evidence, session, compaction, lifecycle, and host bindings match current observations."
  });

  const status = await invokeCodexSkill(
    invocation("status", root),
    context
  );
  assert.equal(status.report.receipt_source.status, "Known");
  assert.equal(status.report.receipt_source.medium, "plugin-data");
  assert.equal(status.report.receipt.status, "Available");
  assert.equal(status.report.receipt.freshness, "Unknown");
  assert.match(status.report.receipt.diagnostic, /does not rescan/);
  assert.deepEqual(snapshotTree(root), before);
});

test("receipt classification limits Stale to direct root, task, or evidence contradiction", async () => {
  const root = makeRepository("classification fixture");
  const pluginData = makePluginData();
  const task = "verify README.md";
  const context = receiptContext(pluginData);
  await invokeCodexSkill(
    invocation("orient", root, { task }),
    context
  );

  const changedTask = await invokeCodexSkill(
    invocation("verify", root, {
      task: "verify a different task",
      target: "README.md"
    }),
    context
  );
  assert.equal(changedTask.report.receipt.status, "Stale");
  assert.match(
    changedTask.report.receipt.diagnostic,
    /root, task, or evidence/
  );

  const differentHostEvidence = await invokeCodexSkill(
    invocation("verify", root, {
      task,
      target: "README.md"
    }),
    {
      ...context,
      receipt_host_evidence: {
        ...context.receipt_host_evidence,
        session_id: "different-session"
      }
    }
  );
  assert.equal(differentHostEvidence.report.receipt.status, "Unknown");
  assert.match(
    differentHostEvidence.report.receipt.diagnostic,
    /does not promote that observation to Stale/
  );

  const missingHostEvidence = await invokeCodexSkill(
    invocation("verify", root, {
      task,
      target: "README.md"
    }),
    {
      ...context,
      receipt_host_evidence: undefined
    }
  );
  assert.equal(missingHostEvidence.report.receipt.status, "Unknown");
  assert.match(
    missingHostEvidence.report.receipt.diagnostic,
    /session, compaction, lifecycle, or host evidence is unavailable/
  );

  fs.writeFileSync(path.join(root, "README.md"), "# Changed evidence\n");
  const changedEvidence = await invokeCodexSkill(
    invocation("verify", root, {
      task,
      target: "README.md"
    }),
    context
  );
  assert.equal(changedEvidence.report.receipt.status, "Stale");
});

test("unsafe plugin-data scope falls back to in-memory without repository receipt files", async () => {
  const root = makeRepository("unsafe storage fixture");
  const repositoryData = path.join(root, "plugin-data");
  fs.mkdirSync(repositoryData, { mode: 0o700 });
  const before = snapshotTree(root);
  const oriented = await invokeCodexSkill(
    invocation("orient", root, {
      task: "do not persist inside the repository"
    }),
    receiptContext(repositoryData)
  );

  assert.equal(oriented.report.ok, true);
  assert.equal(oriented.report.receipt_storage.status, "Unknown");
  assert.equal(oriented.report.receipt_storage.medium, "in-memory");
  assert.equal(oriented.report.receipt_storage.operation, "not-persisted");
  assert.equal(
    fs.existsSync(path.join(repositoryData, RECEIPT_FILE)),
    false
  );
  assert.deepEqual(snapshotTree(root), before);

  const resumed = await invokeCodexSkill(
    invocation("resume", root, { task: "remain read only" }),
    receiptContext(repositoryData)
  );
  assert.equal(resumed.report.read_only, true);
  assert.deepEqual(snapshotTree(root), before);
});

test("receipt store enforces record and retention bounds", async () => {
  const pluginData = makePluginData();
  const roots = [];
  for (let index = 0; index < 9; index += 1) {
    const root = makeRepository(`bounded fixture ${index}`);
    roots.push(root);
    const oriented = await invokeCodexSkill(
      invocation("orient", root, {
        task: `bounded receipt ${index}`
      }),
      receiptContext(pluginData, NOW + index)
    );
    assert.equal(oriented.report.receipt_storage.status, "Known");
  }
  const document = JSON.parse(
    fs.readFileSync(path.join(pluginData, RECEIPT_FILE), "utf8")
  );
  assert.equal(document.receipts.length, 8);
  assert.equal(
    document.receipts.some(
      (receipt) => receipt.issued_at === NOW
    ),
    false
  );
  assert.equal(
    document.receipts.some(
      (receipt) => receipt.issued_at === NOW + 8
    ),
    true
  );

  const expired = readContextReceiptStore(
    pluginData,
    fs.realpathSync(roots[8]),
    NOW + 8 + RECEIPT_RETENTION_MS + 1
  );
  assert.equal(expired.ok, true);
  assert.equal(expired.found, false);
  assert.match(expired.diagnostic, /No retained/);
});

test("malformed store recovers only through orient and linked store fails closed", async (t) => {
  const root = makeRepository("malformed storage fixture");
  const pluginData = makePluginData();
  fs.writeFileSync(path.join(pluginData, RECEIPT_FILE), "{malformed");

  const status = await invokeCodexSkill(
    invocation("status", root),
    receiptContext(pluginData)
  );
  assert.equal(status.report.receipt_source.status, "Unknown");
  assert.equal(status.report.receipt.status, "Unknown");

  const oriented = await invokeCodexSkill(
    invocation("orient", root, { task: "explicit recovery" }),
    receiptContext(pluginData)
  );
  assert.equal(oriented.report.receipt_storage.status, "Known");
  assert.equal(
    oriented.report.receipt_storage.recovery,
    "invalid-store-replaced"
  );
  assert.match(
    oriented.report.receipt_storage.diagnostic,
    /replaced invalid receipt plugin data/
  );
  assert.doesNotThrow(() =>
    JSON.parse(fs.readFileSync(path.join(pluginData, RECEIPT_FILE), "utf8"))
  );

  const outside = makePluginData();
  const outsideFile = path.join(outside, "outside-receipts.json");
  fs.writeFileSync(outsideFile, "OUTSIDE_MUST_NOT_CHANGE");
  fs.unlinkSync(path.join(pluginData, RECEIPT_FILE));
  try {
    fs.symlinkSync(outsideFile, path.join(pluginData, RECEIPT_FILE));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "EPERM" || error.code === "EACCES")
    ) {
      t.skip("Symbolic links are unavailable on this platform.");
      return;
    }
    throw error;
  }
  const linked = await invokeCodexSkill(
    invocation("orient", root, { task: "reject linked storage" }),
    receiptContext(pluginData, NOW + 1)
  );
  assert.equal(linked.report.receipt_storage.status, "Unknown");
  assert.equal(fs.readFileSync(outsideFile, "utf8"), "OUTSIDE_MUST_NOT_CHANGE");
  assert.equal(fs.lstatSync(path.join(pluginData, RECEIPT_FILE)).isSymbolicLink(), true);
});

test("receipt store rejects oversized and publicly writable plugin-data state", async () => {
  const root = makeRepository("hostile plugin data fixture");
  const oversizedData = makePluginData();
  fs.writeFileSync(
    path.join(oversizedData, RECEIPT_FILE),
    "x".repeat(16 * 1024 + 1)
  );
  const oversized = await invokeCodexSkill(
    invocation("status", root),
    receiptContext(oversizedData)
  );
  assert.equal(oversized.report.receipt_source.status, "Unknown");
  assert.equal(oversized.report.receipt.status, "Unknown");

  const invalidUtf8Data = makePluginData();
  fs.writeFileSync(
    path.join(invalidUtf8Data, RECEIPT_FILE),
    Buffer.from([0xff, 0xfe])
  );
  const invalidUtf8 = await invokeCodexSkill(
    invocation("status", root),
    receiptContext(invalidUtf8Data)
  );
  assert.equal(invalidUtf8.report.receipt_source.status, "Unknown");

  const hardLinkData = makePluginData();
  const hardLinkOutside = path.join(makePluginData(), "outside.json");
  fs.writeFileSync(hardLinkOutside, "HARD_LINK_MUST_NOT_CHANGE");
  fs.linkSync(hardLinkOutside, path.join(hardLinkData, RECEIPT_FILE));
  const hardLinked = await invokeCodexSkill(
    invocation("orient", root, { task: "reject hard-linked storage" }),
    receiptContext(hardLinkData)
  );
  assert.equal(hardLinked.report.receipt_storage.status, "Unknown");
  assert.equal(
    fs.readFileSync(hardLinkOutside, "utf8"),
    "HARD_LINK_MUST_NOT_CHANGE"
  );

  if (process.platform !== "win32") {
    for (const mode of [0o770, 0o777]) {
      const publicData = makePluginData();
      fs.chmodSync(publicData, mode);
      const oriented = await invokeCodexSkill(
        invocation("orient", root, {
          task: `reject shared plugin data ${mode.toString(8)}`
        }),
        receiptContext(publicData)
      );
      assert.equal(oriented.report.receipt_storage.status, "Unknown");
      assert.equal(fs.existsSync(path.join(publicData, RECEIPT_FILE)), false);
    }
  }
});

test("receipt runtime schemas reject ambiguous or malformed hostile values", () => {
  const hostEvidence = {
    host: "codex-cli",
    session_id: "session",
    compaction_id: "compaction",
    lifecycle_id: "lifecycle"
  };
  assert.equal(isReceiptHostEvidence(hostEvidence), true);
  for (const value of [
    { ...hostEvidence, session_id: "a\0b" },
    { ...hostEvidence, lifecycle_id: "hidden\u202evalue" },
    { ...hostEvidence, extra: true },
    { ...hostEvidence, host: "other" }
  ]) {
    assert.equal(isReceiptHostEvidence(value), false);
  }

  const receipt = createContextReceipt({
    root: "/bounded/root",
    task: "bounded task",
    evidence_sha256: "a".repeat(64),
    host_evidence: hostEvidence,
    now: NOW
  });
  for (const current of [
    null,
    {},
    {
      root: 1,
      task: "bounded task",
      evidence_sha256: "a".repeat(64),
      evidence_complete: true,
      now: NOW
    },
    {
      root: "/bounded/root",
      task: "bounded task",
      evidence_sha256: "not-a-digest",
      evidence_complete: true,
      now: NOW
    }
  ]) {
    assert.doesNotThrow(() => verifyContextReceipt(receipt, current));
    assert.equal(
      verifyContextReceipt(receipt, current).status,
      "Unknown"
    );
  }
  assert.doesNotThrow(() =>
    inspectReceiptStatus(receipt, 1, NOW)
  );
  assert.equal(
    inspectReceiptStatus(receipt, 1, NOW).status,
    "Unknown"
  );
});

/**
 * @param {string} description
 * @returns {string}
 */
function makeRepository(description) {
  return makeFixture({
    "README.md": `# ${description}\n`,
    "package.json": JSON.stringify({
      name: "receipt-fixture",
      description,
      scripts: { test: "node --test" }
    })
  });
}

/**
 * @returns {string}
 */
function makePluginData() {
  return fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "kanon-receipt-data-"))
  );
}

/**
 * @param {string} pluginData
 * @param {number} [now]
 * @returns {Record<string, unknown>}
 */
function receiptContext(pluginData, now = NOW) {
  return {
    now,
    plugin_data_root: pluginData,
    receipt_host_evidence: {
      host: "codex-cli",
      session_id: "session-secret-value",
      compaction_id: "compaction-secret-value",
      lifecycle_id: "lifecycle-secret-value"
    },
    git_runner: fixedGitRunner,
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
 * @param {string} skill
 * @param {string} root
 * @param {Record<string, unknown>} [fields]
 * @returns {Record<string, unknown>}
 */
function invocation(skill, root, fields = {}) {
  return {
    schema: "kanon-stable-invocation-v1",
    skill,
    root,
    ...fields
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
    stdout = `${"c".repeat(40)}\n`;
  } else if (args[0] === "branch") {
    stdout = "release/v.1.0.0\n";
  } else if (args[0] === "log") {
    stdout =
      `${"c".repeat(40)}\u00002026-07-28\u0000fixture commit\u0000`;
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

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
