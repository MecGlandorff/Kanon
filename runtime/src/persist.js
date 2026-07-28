import path from "node:path";
import { types as nodeTypes } from "node:util";
import { DEFAULT_CONFIG, readKanonConfig } from "./config.js";
import {
  buildContinuityArtifactMetadata,
  buildContinuityReport
} from "./continuity/engine.js";
import { renderBrief, renderResume } from "./render.js";
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
  safeJsonStringify,
  safeTerminalText
} from "./trust.js";

const KANON_GITIGNORE =
  "*\n!.gitignore\n!KANON.md\n!TODO.md\n";
const TODO_HEADER = "# Kanon TODO\n\n";

/**
 * @typedef {ReturnType<typeof import("./analyze.js").analyzeRepo>} Analysis
 * @typedef {{
 *   number: number,
 *   done: boolean,
 *   text: string,
 *   details: string[],
 *   line: number,
 *   trust: "repository-untrusted"
 * }} KanonTodo
 * @typedef {{
 *   todos: KanonTodo[],
 *   found: boolean,
 *   valid: boolean,
 *   warning: string | null
 * }} TodoInspection
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

/**
 * @param {string} root
 * @param {unknown} [options]
 * @returns {TodoInspection}
 */
export function inspectKanonTodos(root, options = {}) {
  const maximumBytes = todoReadLimit(options);
  if (maximumBytes === null) {
    return {
      todos: [],
      found: true,
      valid: false,
      warning: "TODO.md was not inspected because its read limit was invalid."
    };
  }
  const read = readContainedText(
    root,
    ".kanon/TODO.md",
    maximumBytes,
    { optional: true }
  );
  if (!read.ok && read.status === "missing") {
    return { todos: [], found: false, valid: true, warning: null };
  }
  if (!read.ok) {
    return {
      todos: [],
      found: true,
      valid: false,
      warning:
        `TODO.md was ignored because it was ${read.status}: ${read.reason}`
    };
  }
  return {
    todos: parseKanonTodoMarkdown(read.text),
    found: true,
    valid: true,
    warning: null
  };
}

/**
 * @param {string} root
 * @param {unknown} [options]
 * @returns {KanonTodo[]}
 */
export function readKanonTodos(root, options = {}) {
  return inspectKanonTodos(root, options).todos;
}

/**
 * @param {string} root
 * @param {unknown} text
 */
export function addKanonTodo(root, text) {
  const item = formatTodoItem(text);
  if (!item) {
    throw new Error('Usage: kanon todo add "describe the work"');
  }
  const config = readKanonConfig(root);
  ensureContainedDirectory(root, ".kanon");
  writeKanonGitignore(root);
  const inspection = inspectKanonTodos(root, {
    maxBytes: config.inputs.max_todo_bytes
  });
  if (!inspection.valid) {
    throw new Error(inspection.warning || "Unsafe Kanon TODO state.");
  }
  const existing = readTodoSource(root, config.inputs.max_todo_bytes);
  const prefix = existing ? ensureTrailingNewline(existing) : TODO_HEADER;
  const next = `${prefix}${item}\n`;
  if (Buffer.byteLength(next) > config.inputs.max_todo_bytes) {
    throw new Error("TODO.md would exceed its configured input limit.");
  }
  atomicWriteContained(root, ".kanon/TODO.md", next);
  const todos = readKanonTodos(root, {
    maxBytes: config.inputs.max_todo_bytes
  });
  const added = todos[todos.length - 1];
  if (!added) {
    throw new Error("TODO.md was written but the added item was unavailable.");
  }
  return {
    path: ".kanon/TODO.md",
    todo: added
  };
}

/**
 * @param {string} root
 * @param {unknown} number
 */
export function completeKanonTodo(root, number) {
  const config = readKanonConfig(root);
  const text = readTodoSource(root, config.inputs.max_todo_bytes);
  if (!text) {
    throw new Error("No safe Kanon TODO.md found.");
  }
  const todoNumber = Number.parseInt(String(number), 10);
  if (!Number.isInteger(todoNumber) || todoNumber < 1) {
    throw new Error("Usage: kanon todo done <number>");
  }
  const todos = parseKanonTodoMarkdown(text);
  const target = todos.find((todo) => todo.number === todoNumber);
  if (!target) {
    throw new Error(`No Kanon todo found for number ${todoNumber}.`);
  }
  if (target.done) {
    return { path: ".kanon/TODO.md", todo: target, changed: false };
  }
  const lines = text.split(/\r?\n/);
  const targetLine = lines[target.line - 1];
  if (targetLine === undefined) {
    throw new Error("The selected TODO line changed before update.");
  }
  lines[target.line - 1] = targetLine.replace(
    /^(\s*-\s+\[)[ xX](\]\s+)/,
    "$1x$2"
  );
  atomicWriteContained(
    root,
    ".kanon/TODO.md",
    ensureTrailingNewline(lines.join("\n"))
  );
  const completed = readKanonTodos(root, {
    maxBytes: config.inputs.max_todo_bytes
  }).find((todo) => todo.number === todoNumber);
  if (!completed) {
    throw new Error("The completed TODO could not be read back safely.");
  }
  return {
    path: ".kanon/TODO.md",
    todo: completed,
    changed: true
  };
}

/**
 * @param {string} markdown
 * @returns {KanonTodo[]}
 */
export function parseKanonTodoMarkdown(markdown) {
  /** @type {KanonTodo[]} */
  const todos = [];
  /** @type {KanonTodo | null} */
  let current = null;
  const lines = markdown.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    if (match?.[1] && match[2] !== undefined) {
      current = {
        number: todos.length + 1,
        done: match[1].toLowerCase() === "x",
        text: match[2].trim(),
        details: [],
        line: index + 1,
        trust: "repository-untrusted"
      };
      todos.push(current);
    } else if (current && /^\s{2,}\S/.test(line)) {
      current.details.push(line.trimEnd().trim());
    }
  });
  return todos;
}

/**
 * @param {string} root
 * @returns {void}
 */
function writeKanonGitignore(root) {
  const read = readContainedText(
    root,
    ".kanon/.gitignore",
    128 * 1024,
    { optional: true }
  );
  if (!read.ok && read.status !== "missing") {
    throw new Error(`Unsafe .kanon/.gitignore: ${read.reason}`);
  }
  const existing = read.ok ? read.text : "";
  if (!existing) {
    atomicWriteContained(root, ".kanon/.gitignore", KANON_GITIGNORE);
    return;
  }
  const lines = new Set(existing.split(/\r?\n/));
  const missing = KANON_GITIGNORE.trimEnd()
    .split("\n")
    .filter((line) => !lines.has(line));
  if (missing.length) {
    atomicWriteContained(
      root,
      ".kanon/.gitignore",
      `${ensureTrailingNewline(existing)}# Kanon-managed continuity files\n${missing.join("\n")}\n`
    );
  }
}

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

/**
 * @param {string} root
 * @param {number} maximumBytes
 * @returns {string}
 */
function readTodoSource(root, maximumBytes) {
  const read = readContainedText(
    root,
    ".kanon/TODO.md",
    maximumBytes,
    { optional: true }
  );
  if (!read.ok && read.status === "missing") {
    return "";
  }
  if (!read.ok) {
    throw new Error(`Unsafe TODO.md: ${read.reason}`);
  }
  return read.text;
}

/**
 * @param {string} text
 * @returns {string}
 */
function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * @param {unknown} text
 * @returns {string | null}
 */
function formatTodoItem(text) {
  const lines = safeTerminalText(text, { multiline: true })
    .split("\n")
    .map((line) => line.trimEnd());
  while (lines.length && !(lines[0] ?? "").trim()) {
    lines.shift();
  }
  while (lines.length && !(lines.at(-1) ?? "").trim()) {
    lines.pop();
  }
  if (!lines.length) {
    return null;
  }
  const [title, ...details] = lines;
  if (title === undefined) {
    return null;
  }
  return [
    `- [ ] ${title.trim()}`,
    ...details.map((detail) => detail.trim() ? `  ${detail}` : "  ")
  ].join("\n");
}

/**
 * @param {unknown} options
 * @returns {number | null}
 */
function todoReadLimit(options) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    nodeTypes.isProxy(options) ||
    Object.getPrototypeOf(options) !== Object.prototype
  ) {
    return null;
  }
  if (Object.keys(options).some((key) => key !== "maxBytes")) {
    return null;
  }
  if (!Object.hasOwn(options, "maxBytes")) {
    return DEFAULT_CONFIG.inputs.max_todo_bytes;
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, "maxBytes");
  if (!descriptor || descriptor.get || descriptor.set) {
    return null;
  }
  const value = descriptor.value;
  return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= 1024 * 1024
    ? value
    : null;
}
