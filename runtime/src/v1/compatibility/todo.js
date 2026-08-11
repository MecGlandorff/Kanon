import { readKanonConfig } from "../../config.js";
import { todoHelpText } from "../../cli/args.js";
import { readStdin, writeStdout } from "../../cli/io.js";
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
 * @param {import("../../cli/args.js").ParsedArgs} parsed
 * @param {import("../../cli/io.js").NormalizedIo} io
 * @returns {Promise<void>}
 */
export async function runTodoCommand(root, parsed, io) {
  const action = parsed.positionals[0] || "list";

  if (action === "list") {
    const todos = readKanonTodos(root);
    if (parsed.flags.json) {
      writeStdout(io, `${safeJsonStringify({ todos })}\n`);
    } else {
      writeStdout(io, renderTodoList(todos, { all: parsed.flags.all }));
    }
    return;
  }

  if (action === "add") {
    const text = parsed.flags.stdin
      ? await readStdin(io, readKanonConfig(root).inputs.max_todo_bytes)
      : parsed.positionals.slice(1).join(" ");
    const result = addKanonTodo(root, text);
    if (parsed.flags.json) {
      writeStdout(io, `${safeJsonStringify(result)}\n`);
    } else {
      writeStdout(
        io,
        `Added Kanon todo #${result.todo.number}: ${safeTerminalText(result.todo.text)}\n`
      );
    }
    return;
  }

  if (action === "done") {
    const result = completeKanonTodo(root, parsed.positionals[1]);
    if (parsed.flags.json) {
      writeStdout(io, `${safeJsonStringify(result)}\n`);
    } else if (result.changed) {
      writeStdout(
        io,
        `Completed Kanon todo #${result.todo.number}: ${safeTerminalText(result.todo.text)}\n`
      );
    } else {
      writeStdout(
        io,
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
