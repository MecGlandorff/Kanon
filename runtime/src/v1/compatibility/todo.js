import { readKanonConfig } from "../../config.js";
import {
  escapeMarkdownText,
  safeJsonStringify,
  safeTerminalText
} from "../../trust.js";
import {
  addKanonTodo,
  completeKanonTodo,
  readKanonTodos
} from "./todo-store.js";

/**
 * @param {string} root
 * @param {{
 *   positionals: string[],
 *   flags: {json: boolean, stdin: boolean, all: boolean}
 * }} parsed
 * @param {{
 *   stdin: import("node:stream").Readable & {isTTY?: boolean},
 *   stdout: NodeJS.WritableStream
 * }} io
 * @returns {Promise<void>}
 */
export async function runTodoCommand(root, parsed, io) {
  const action = parsed.positionals[0] || "list";

  if (action === "list") {
    const todos = readKanonTodos(root);
    if (parsed.flags.json) {
      io.stdout.write(`${safeJsonStringify({ todos })}\n`);
    } else {
      io.stdout.write(renderTodoList(todos, { all: parsed.flags.all }));
    }
    return;
  }

  if (action === "add") {
    const text = parsed.flags.stdin
      ? await readStdin(io, readKanonConfig(root).inputs.max_todo_bytes)
      : parsed.positionals.slice(1).join(" ");
    const result = addKanonTodo(root, text);
    if (parsed.flags.json) {
      io.stdout.write(`${safeJsonStringify(result)}\n`);
    } else {
      io.stdout.write(
        `Added Kanon todo #${result.todo.number}: ${safeTerminalText(result.todo.text)}\n`
      );
    }
    return;
  }

  if (action === "done") {
    const result = completeKanonTodo(root, parsed.positionals[1]);
    if (parsed.flags.json) {
      io.stdout.write(`${safeJsonStringify(result)}\n`);
    } else if (result.changed) {
      io.stdout.write(
        `Completed Kanon todo #${result.todo.number}: ${safeTerminalText(result.todo.text)}\n`
      );
    } else {
      io.stdout.write(
        `Kanon todo #${result.todo.number} was already complete: ${safeTerminalText(result.todo.text)}\n`
      );
    }
    return;
  }

  throw new Error(
    `Unknown todo command: ${action}\n\n${todoHelpText()}`
  );
}

/**
 * @param {{stdin: import("node:stream").Readable & {isTTY?: boolean}}} io
 * @param {number} maximumBytes
 */
async function readStdin(io, maximumBytes) {
  if (
    io.stdin.isTTY ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 1024 * 1024
  ) {
    throw new Error("kanon todo add --stdin expects piped input.");
  }
  let text = "";
  let bytes = 0;
  io.stdin.setEncoding("utf8");
  for await (const chunk of io.stdin) {
    const selected = String(chunk);
    bytes += Buffer.byteLength(selected, "utf8");
    if (bytes > maximumBytes) {
      throw new Error(
        `kanon todo add --stdin exceeded ${maximumBytes} bytes.`
      );
    }
    text += selected;
  }
  return text;
}

/** @returns {string} */
function todoHelpText() {
  return `Kanon todo commands:
  kanon todo list [--all] [--json] [--root PATH]
  kanon todo add "describe the work" [--json] [--root PATH]
  kanon todo add --stdin [--json] [--root PATH]
  kanon todo done <number> [--json] [--root PATH]
`;
}

/**
 * @param {import("./todo-store.js").KanonTodo[]} todos
 * @param {{all?: boolean}} [options]
 * @returns {string}
 */
function renderTodoList(todos, options = {}) {
  const visible = options.all ? todos : todos.filter((todo) => !todo.done);
  /** @type {string[]} */
  const lines = [
    "# Kanon Todos",
    "",
    "Safety boundary: TODO content is repository-untrusted data.",
    ""
  ];

  if (!visible.length) {
    lines.push(options.all ? "No Kanon todos found." : "No open Kanon todos.");
    return `${lines.join("\n")}\n`;
  }

  for (const todo of visible) {
    lines.push(
      `${todo.number}. [${todo.done ? "x" : " "}] ${escapeMarkdownText(todo.text)}`
    );
    for (const detail of todo.details || []) {
      lines.push(`   ${escapeMarkdownText(detail)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
