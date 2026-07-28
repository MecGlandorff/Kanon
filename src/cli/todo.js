import {
  addKanonTodo,
  completeKanonTodo,
  readKanonTodos
} from "../persist.js";
import { renderTodoList } from "../render.js";
import { todoHelpText } from "./args.js";
import { readStdin, writeStdout } from "./io.js";
import { safeTerminalText } from "../trust.js";
import { safeJsonStringify } from "../trust.js";

/**
 * @param {string} root
 * @param {import("./args.js").ParsedArgs} parsed
 * @param {import("./io.js").NormalizedIo} io
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
      ? await readStdin(io)
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
