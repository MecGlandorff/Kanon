import fs from "node:fs";
import path from "node:path";
import { renderBrief, renderImprove, renderRefactor, renderResume } from "./render.js";

const KANON_GITIGNORE = "*\n!.gitignore\n!KANON.md\n!TODO.md\n!IMPROVEMENTS.md\n!REFACTOR_PLAN.md\n";
const TODO_HEADER = "# Kanon TODO\n\n";

export function writeKanonOutputs(analysis, options = {}) {
  const kanonDir = path.join(analysis.root, ".kanon");
  const snapshotsDir = path.join(kanonDir, "snapshots");
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const previous = readPreviousState(analysis.root);
  const todos = readKanonTodos(analysis.root);
  const timestamp = analysis.state.generated_at.replace(/[:.]/g, "-");

  writeKanonGitignore(kanonDir);
  fs.writeFileSync(path.join(kanonDir, "KANON.md"), renderBrief(analysis, options), "utf8");
  fs.writeFileSync(path.join(kanonDir, "STATE.json"), `${JSON.stringify(analysis.state, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(kanonDir, "HANDOFF.md"), renderResume(analysis, previous, { todos }), "utf8");
  fs.writeFileSync(
    path.join(kanonDir, "config.json"),
    `${JSON.stringify(defaultConfig(), null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(snapshotsDir, `${timestamp}.json`),
    `${JSON.stringify(analysis.state, null, 2)}\n`,
    "utf8"
  );

  if (analysis.evidence.length) {
    fs.appendFileSync(
      path.join(kanonDir, "EVIDENCE.jsonl"),
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
      `.kanon/snapshots/${timestamp}.json`
    ]
  };
}

export function readPreviousState(root) {
  const statePath = path.join(root, ".kanon", "STATE.json");
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeKanonImproveOutput(analysis, improvements, options = {}) {
  const kanonDir = path.join(analysis.root, ".kanon");
  fs.mkdirSync(kanonDir, { recursive: true });
  writeKanonGitignore(kanonDir);

  analysis.state.improvements = improvements;
  fs.writeFileSync(
    path.join(kanonDir, "IMPROVEMENTS.md"),
    renderImprove(improvements, { mode: options.mode || "top" }),
    "utf8"
  );
  fs.writeFileSync(path.join(kanonDir, "STATE.json"), `${JSON.stringify(analysis.state, null, 2)}\n`, "utf8");

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
  fs.writeFileSync(
    path.join(kanonDir, "REFACTOR_PLAN.md"),
    renderRefactor(refactor, { mode: options.mode || "plan" }),
    "utf8"
  );
  fs.writeFileSync(path.join(kanonDir, "STATE.json"), `${JSON.stringify(analysis.state, null, 2)}\n`, "utf8");

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
  fs.writeFileSync(todoPath, `${prefix}${item}\n`, "utf8");

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
  fs.writeFileSync(todoPath, ensureTrailingNewline(lines.join("\n")), "utf8");

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
  fs.writeFileSync(path.join(kanonDir, ".gitignore"), KANON_GITIGNORE, "utf8");
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

function defaultConfig() {
  return {
    version: 1,
    commit_policy: "commit .kanon/KANON.md; keep volatile state local",
    command_execution: "ask before running repo tests/builds",
    evidence_model: "weighted: code/config/tests outrank README for current behavior"
  };
}
