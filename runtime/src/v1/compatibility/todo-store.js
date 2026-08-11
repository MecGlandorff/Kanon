import { types as nodeTypes } from "node:util";
import { DEFAULT_CONFIG, readKanonConfig } from "../../config.js";
import { safeTerminalText } from "../../trust.js";
import {
  atomicWriteContained,
  ensureContainedDirectory,
  readContainedText
} from "./write-fs.js";

const KANON_GITIGNORE = "*\n!.gitignore\n!KANON.md\n!TODO.md\n";
const TODO_HEADER = "# Kanon TODO\n\n";

/**
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
 */

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
 * Preserve user-owned ignore content while adding the fixed Kanon entries.
 *
 * @param {string} root
 * @returns {void}
 */
export function writeKanonGitignore(root) {
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
