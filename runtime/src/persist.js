import path from "node:path";
import { DEFAULT_CONFIG, readKanonConfig } from "./config.js";
import {
  buildContinuityArtifactMetadata,
  buildContinuityReport
} from "./continuity/engine.js";
import { renderBrief } from "./render/brief.js";
import { renderResume } from "./render/continuity.js";
import {
  sanitizeFilenameComponent
} from "./path-security.js";
import {
  appendContained,
  atomicWriteContained,
  containedFileStat,
  ensureContainedDirectory,
  listContainedDirectory,
  readContainedText
} from "./persistence/safe-fs.js";
import {
  inspectPreviousHandoff,
  inspectPreviousState,
  validatePersistedState
} from "./persistence/state.js";
import {
  safeJsonStringify
} from "./trust.js";
import {
  inspectKanonTodos,
  writeKanonGitignore
} from "./v1/compatibility/todo-store.js";

/**
 * @typedef {ReturnType<typeof import("./analyze.js").analyzeRepo>} Analysis
 * @typedef {import("./config.js").KanonConfig["persistence"]}
 *   PersistenceLimits
 */

/**
 * @param {Analysis} analysis
 * @param {{deep?: boolean}} [options]
 */
export function writeKanonOutputs(analysis, options = {}) {
  const root = analysis.root;
  const config = readKanonConfig(root);
  ensureContainedDirectory(root, ".kanon");
  ensureContainedDirectory(root, ".kanon/snapshots");
  const previousInspection = inspectPreviousState(root, {
    maxBytes: config.inputs.max_state_bytes
  });
  const handoffInspection = inspectPreviousHandoff(root);
  const todoInspection = inspectKanonTodos(root, {
    maxBytes: config.inputs.max_todo_bytes
  });
  const continuity = buildContinuityReport({
    artifact_metadata:
      buildContinuityArtifactMetadata(analysis.inspection),
    current: analysis.state,
    previous: previousInspection.state,
    ...(previousInspection.warning
      ? { previous_warning: previousInspection.warning }
      : {}),
    handoff: handoffInspection.handoff
  });
  const snapshotId = sanitizeFilenameComponent(
    analysis.state.run_id ||
      analysis.state.generated_at.replace(/[:.]/g, "-")
  );
  const validation = validatePersistedState(analysis.state);
  if (!validation.valid) {
    throw new Error(
      `Refusing to persist invalid state at ${validation.field}: ${validation.reason}`
    );
  }

  writeKanonGitignore(root);
  atomicWriteContained(
    root,
    ".kanon/KANON.md",
    renderBrief(analysis, options)
  );
  atomicWriteContained(
    root,
    ".kanon/STATE.json",
    `${safeJsonStringify(analysis.state)}\n`
  );
  atomicWriteContained(
    root,
    ".kanon/HANDOFF.md",
    renderResume(analysis, previousInspection.state, {
      todos: todoInspection.todos,
      stateWarning: previousInspection.warning,
      todoWarning: todoInspection.warning,
      handoff: handoffInspection.handoff,
      handoffWarning: handoffInspection.warning,
      continuity
    })
  );
  ensureKanonConfig(root);

  /** @type {string[]} */
  const warnings = [
    previousInspection.warning,
    todoInspection.warning,
    handoffInspection.warning
  ].filter((warning) => typeof warning === "string");
  const snapshotPath = writeSnapshot(
    root,
    snapshotId,
    analysis.state,
    config.persistence,
    warnings
  );
  appendEvidence(
    root,
    analysis.evidence,
    config.persistence,
    warnings
  );

  return {
    kanonDir: path.join(root, ".kanon"),
    written: [
      ".kanon/.gitignore",
      ".kanon/KANON.md",
      ".kanon/STATE.json",
      ".kanon/EVIDENCE.jsonl",
      ".kanon/HANDOFF.md",
      ".kanon/config.json",
      ...(snapshotPath ? [snapshotPath] : [])
    ],
    warnings
  };
}

/**
 * @param {string} root
 * @param {unknown} [options]
 */
export function readPreviousState(root, options = {}) {
  return inspectPreviousState(root, options).state;
}

export {
  inspectPreviousHandoff,
  inspectPreviousState,
  validatePersistedState
};

export {
  addKanonTodo,
  completeKanonTodo,
  inspectKanonTodos,
  parseKanonTodoMarkdown,
  readKanonTodos
} from "./v1/compatibility/todo-store.js";

/**
 * @param {string} root
 * @returns {void}
 */
function ensureKanonConfig(root) {
  const target = containedFileStat(
    root,
    ".kanon/config.json",
    { optional: true }
  );
  if (target.status === "missing") {
    atomicWriteContained(
      root,
      ".kanon/config.json",
      `${safeJsonStringify(DEFAULT_CONFIG)}\n`
    );
  }
}

/**
 * @param {string} root
 * @param {string} id
 * @param {unknown} state
 * @param {PersistenceLimits} limits
 * @param {string[]} warnings
 * @returns {string | null}
 */
function writeSnapshot(root, id, state, limits, warnings) {
  const entries = listContainedDirectory(root, ".kanon/snapshots")
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  if (entries.length >= limits.max_snapshots) {
    warnings.push(
      `Snapshot retention limit ${limits.max_snapshots} was reached; no snapshot was written.`
    );
    return null;
  }
  const relative = `.kanon/snapshots/${id}.json`;
  atomicWriteContained(root, relative, `${safeJsonStringify(state)}\n`);
  return relative;
}

/**
 * @param {string} root
 * @param {import("./evidence.js").EvidenceRecord[]} records
 * @param {PersistenceLimits} limits
 * @param {string[]} warnings
 * @returns {void}
 */
function appendEvidence(root, records, limits, warnings) {
  const relative = ".kanon/EVIDENCE.jsonl";
  const target = containedFileStat(root, relative, { optional: true });
  const existingBytes = target.ok ? target.stat.size : 0;
  let existingText = "";
  if (target.ok) {
    const existing = readContainedText(
      root,
      relative,
      limits.max_evidence_bytes
    );
    if (!existing.ok) {
      throw new Error(`Unsafe evidence ledger: ${existing.reason}`);
    }
    existingText = existing.text;
  }
  const currentRecords = existingText
    ? existingText.split(/\r?\n/).filter(Boolean).length
    : 0;
  const remaining = Math.max(
    0,
    limits.max_evidence_records - currentRecords
  );
  const accepted = records.slice(0, remaining);
  let payload = accepted.length
    ? `${accepted.map((record) => safeJsonStringify(record, 0)).join("\n")}\n`
    : "";
  const availableBytes = Math.max(
    0,
    limits.max_evidence_bytes - existingBytes
  );
  if (Buffer.byteLength(payload) > availableBytes) {
    payload = "";
  }
  if (payload) {
    appendContained(root, relative, payload);
  } else if (!target.ok) {
    atomicWriteContained(root, relative, "");
  }
  if (accepted.length < records.length || (!payload && records.length)) {
    warnings.push(
      "Evidence retention limit was reached; additional records were not appended."
    );
  }
}
