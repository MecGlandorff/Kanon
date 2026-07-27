import path from "node:path";
import { DEFAULT_CONFIG, readKanonConfig } from "./config.js";
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

export function writeKanonOutputs(analysis, options = {}) {
  const root = analysis.root;
  const config = readKanonConfig(root);
  ensureContainedDirectory(root, ".kanon");
  ensureContainedDirectory(root, ".kanon/snapshots");
  const previousInspection = inspectPreviousState(root, {
    maxBytes: config.inputs.max_state_bytes
  });
  const todoInspection = inspectKanonTodos(root, {
    maxBytes: config.inputs.max_todo_bytes
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
      todoWarning: todoInspection.warning
    })
  );
  ensureKanonConfig(root);

  const warnings = [
    previousInspection.warning,
    todoInspection.warning
  ].filter(Boolean);
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

export function readPreviousState(root, options = {}) {
  return inspectPreviousState(root, options).state;
}

export { inspectPreviousState, validatePersistedState };

export function inspectKanonTodos(root, options = {}) {
  const read = readContainedText(
    root,
    ".kanon/TODO.md",
    options.maxBytes ?? DEFAULT_CONFIG.inputs.max_todo_bytes,
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

export function readKanonTodos(root, options = {}) {
  return inspectKanonTodos(root, options).todos;
}

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
    throw new Error(inspection.warning);
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
  return {
    path: ".kanon/TODO.md",
    todo: todos[todos.length - 1]
  };
}

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
  lines[target.line - 1] = lines[target.line - 1].replace(
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
  return {
    path: ".kanon/TODO.md",
    todo: completed,
    changed: true
  };
}

export function parseKanonTodoMarkdown(markdown) {
  const todos = [];
  let current = null;
  const lines = String(markdown || "").split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    if (match) {
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

function appendEvidence(root, records, limits, warnings) {
  const relative = ".kanon/EVIDENCE.jsonl";
  const target = containedFileStat(root, relative, { optional: true });
  const existingBytes = target.ok ? target.stat.size : 0;
  const existing = target.ok
    ? readContainedText(root, relative, limits.max_evidence_bytes)
    : { ok: true, text: "" };
  if (!existing.ok) {
    throw new Error(`Unsafe evidence ledger: ${existing.reason}`);
  }
  const currentRecords = existing.text
    ? existing.text.split(/\r?\n/).filter(Boolean).length
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

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function formatTodoItem(text) {
  const lines = safeTerminalText(text, { multiline: true })
    .split("\n")
    .map((line) => line.trimEnd());
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines.at(-1).trim()) {
    lines.pop();
  }
  if (!lines.length) {
    return null;
  }
  const [title, ...details] = lines;
  return [
    `- [ ] ${title.trim()}`,
    ...details.map((detail) => detail.trim() ? `  ${detail}` : "  ")
  ].join("\n");
}
