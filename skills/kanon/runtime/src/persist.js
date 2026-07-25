import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "./config.js";
import { renderBrief, renderImprove, renderRefactor, renderResume } from "./render.js";
import { STATE_SCHEMA_VERSION } from "./version.js";

const KANON_GITIGNORE = "*\n!.gitignore\n!KANON.md\n!TODO.md\n!IMPROVEMENTS.md\n!REFACTOR_PLAN.md\n";
const TODO_HEADER = "# Kanon TODO\n\n";

export function writeKanonOutputs(analysis, options = {}) {
  const kanonDir = path.join(analysis.root, ".kanon");
  const snapshotsDir = path.join(kanonDir, "snapshots");
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const previous = readPreviousState(analysis.root);
  const todos = readKanonTodos(analysis.root);
  const snapshotId = analysis.state.run_id || analysis.state.generated_at.replace(/[:.]/g, "-");

  writeKanonGitignore(kanonDir);
  atomicWriteFile(path.join(kanonDir, "KANON.md"), renderBrief(analysis, options));
  atomicWriteFile(path.join(kanonDir, "STATE.json"), `${JSON.stringify(analysis.state, null, 2)}\n`);
  atomicWriteFile(path.join(kanonDir, "HANDOFF.md"), renderResume(analysis, previous, { todos }));
  ensureKanonConfig(kanonDir);
  atomicWriteFile(
    path.join(snapshotsDir, `${snapshotId}.json`),
    `${JSON.stringify(analysis.state, null, 2)}\n`
  );

  const evidencePath = path.join(kanonDir, "EVIDENCE.jsonl");
  if (!fs.existsSync(evidencePath)) {
    atomicWriteFile(evidencePath, "");
  }
  if (analysis.evidence.length) {
    fs.appendFileSync(
      evidencePath,
      `${analysis.evidence.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8"
    );
  }

  return {
    kanonDir,
    written: [
      ".kanon/.gitignore",
      ".kanon/KANON.md",
      ".kanon/STATE.json",
      ".kanon/EVIDENCE.jsonl",
      ".kanon/HANDOFF.md",
      ".kanon/config.json",
      `.kanon/snapshots/${snapshotId}.json`
    ]
  };
}

export function readPreviousState(root) {
  const statePath = path.join(root, ".kanon", "STATE.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const schemaVersion = parsed.schema_version ?? 1;
    if (
      !Number.isInteger(schemaVersion) ||
      schemaVersion < 1 ||
      schemaVersion > STATE_SCHEMA_VERSION
    ) {
      return null;
    }
    return { ...parsed, schema_version: schemaVersion };
  } catch {
    return null;
  }
}

export function writeKanonImproveOutput(analysis, improvements, options = {}) {
  const kanonDir = path.join(analysis.root, ".kanon");
  fs.mkdirSync(kanonDir, { recursive: true });
  writeKanonGitignore(kanonDir);

  analysis.state.improvements = improvements;
  atomicWriteFile(
    path.join(kanonDir, "IMPROVEMENTS.md"),
    renderImprove(improvements, { mode: options.mode || "top" })
  );
  atomicWriteFile(path.join(kanonDir, "STATE.json"), `${JSON.stringify(analysis.state, null, 2)}\n`);

  return {
    kanonDir,
    written: [
      ".kanon/.gitignore",
      ".kanon/IMPROVEMENTS.md",
      ".kanon/STATE.json"
    ]
  };
}

export function writeKanonRefactorOutput(analysis, refactor, options = {}) {
  const kanonDir = path.join(analysis.root, ".kanon");
  fs.mkdirSync(kanonDir, { recursive: true });
  writeKanonGitignore(kanonDir);

  analysis.state.refactor = refactor;
  atomicWriteFile(
    path.join(kanonDir, "REFACTOR_PLAN.md"),
    renderRefactor(refactor, { mode: options.mode || "plan" })
  );
  atomicWriteFile(path.join(kanonDir, "STATE.json"), `${JSON.stringify(analysis.state, null, 2)}\n`);

  return {
    kanonDir,
    written: [
      ".kanon/.gitignore",
      ".kanon/REFACTOR_PLAN.md",
      ".kanon/STATE.json"
    ]
  };
}

export function readKanonTodos(root) {
  const todoPath = path.join(root, ".kanon", "TODO.md");
  try {
    return parseKanonTodoMarkdown(fs.readFileSync(todoPath, "utf8"));
  } catch {
    return [];
  }
}

export function addKanonTodo(root, text) {
  const item = formatTodoItem(text);
  if (!item) {
    throw new Error('Usage: kanon todo add "describe the work"');
  }

  const kanonDir = path.join(root, ".kanon");
  const todoPath = path.join(kanonDir, "TODO.md");
  fs.mkdirSync(kanonDir, { recursive: true });
  writeKanonGitignore(kanonDir);

  const existing = readTextFile(todoPath);
  const prefix = existing ? ensureTrailingNewline(existing) : TODO_HEADER;
  atomicWriteFile(todoPath, `${prefix}${item}\n`);

  const todos = readKanonTodos(root);
  return {
    path: ".kanon/TODO.md",
    todo: todos[todos.length - 1]
  };
}

export function completeKanonTodo(root, number) {
  const todoPath = path.join(root, ".kanon", "TODO.md");
  const text = readTextFile(todoPath);
  if (!text) {
    throw new Error("No Kanon TODO.md found.");
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
  lines[target.line - 1] = lines[target.line - 1].replace(/^(\s*-\s+\[)[ xX](\]\s+)/, "$1x$2");
  atomicWriteFile(todoPath, ensureTrailingNewline(lines.join("\n")));

  const completed = readKanonTodos(root).find((todo) => todo.number === todoNumber);
  return { path: ".kanon/TODO.md", todo: completed, changed: true };
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
        line: index + 1
      };
      todos.push(current);
      return;
    }

    if (current && /^\s{2,}\S/.test(line)) {
      current.details.push(line.trimEnd().trim());
    }
  });

  return todos;
}

function writeKanonGitignore(kanonDir) {
  const ignorePath = path.join(kanonDir, ".gitignore");
  const existing = readTextFile(ignorePath);
  if (!existing) {
    atomicWriteFile(ignorePath, KANON_GITIGNORE);
    return;
  }

  const lines = new Set(existing.split(/\r?\n/));
  const missing = KANON_GITIGNORE.trimEnd()
    .split("\n")
    .filter((line) => !lines.has(line));
  if (!missing.length) {
    return;
  }

  atomicWriteFile(
    ignorePath,
    `${ensureTrailingNewline(existing)}# Kanon-managed continuity files\n${missing.join("\n")}\n`
  );
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function formatTodoItem(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  if (!lines.length) {
    return null;
  }

  const [title, ...details] = lines;
  const item = [`- [ ] ${title.trim()}`];
  for (const detail of details) {
    item.push(detail.trim() ? `  ${detail}` : "  ");
  }

  return item.join("\n");
}

function ensureKanonConfig(kanonDir) {
  const configPath = path.join(kanonDir, "config.json");
  if (!fs.existsSync(configPath)) {
    atomicWriteFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
}

function atomicWriteFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  try {
    fs.writeFileSync(tempPath, contents, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tempPath, filePath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // The rename succeeded or the temporary file was never created.
    }
  }
}
