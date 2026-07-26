import {
  appendClaimList,
  appendIssueList,
  appendStateDiff
} from "./shared.js";

export function renderVerify(analysis) {
  const verification = analysis.state.verification;
  const lines = [];
  lines.push("# Kanon Verify");
  lines.push("");
  lines.push(`Target: ${verification.target}`);
  lines.push("");

  if (verification.applicable === false) {
    lines.push(
      verification.note ||
      "README verification is not applicable to this repository."
    );
    return `${lines.join("\n")}\n`;
  }

  if (!verification.checked) {
    lines.push("Kanon could not run README drift checks.");
    appendIssueList(lines, verification.issues);
    return `${lines.join("\n")}\n`;
  }

  if (!verification.issues.length) {
    lines.push("No README drift found by the current checks.");
    if (!verification.scan_complete) {
      lines.push(
        "Warning: the repository scan was incomplete, so absence-based checks are inconclusive."
      );
    }
    lines.push("");
    lines.push(`Commands checked: ${verification.commands_checked}`);
    return `${lines.join("\n")}\n`;
  }

  lines.push("README / repo drift:");
  appendIssueList(lines, verification.issues);
  return `${lines.join("\n")}\n`;
}

export function renderResume(analysis, previousState = null, options = {}) {
  const state = analysis.state;
  const openTodos = (options.todos || []).filter((todo) => !todo.done);
  const lines = [];
  lines.push("# Resume This Repo");
  lines.push("");

  if (!previousState) {
    lines.push("No previous .kanon/STATE.json checkpoint found.");
    lines.push("");
  } else {
    lines.push(
      `Last Kanon checkpoint: ${previousState.generated_at || "unknown"}`
    );
    lines.push(`Current analysis: ${state.generated_at}`);
    lines.push("");
    appendStateDiff(lines, previousState, state);
  }

  if (openTodos.length) {
    lines.push("## Open Kanon Todos");
    for (const todo of openTodos.slice(0, 8)) {
      lines.push(`- ${todo.number}. ${todo.text}`);
      for (const detail of (todo.details || []).slice(0, 3)) {
        lines.push(`  ${detail}`);
      }
    }
    lines.push("");
  }

  lines.push("## Start Here");
  for (const item of state.current_state.suggested.slice(0, 6)) {
    lines.push(`- ${item.claim}${item.reason ? ` ${item.reason}` : ""}`);
  }
  lines.push("");

  lines.push("## Files Most Worth Reading");
  for (const file of state.important_files.slice(0, 8)) {
    lines.push(`- ${file.path}: ${file.reason}`);
  }
  lines.push("");

  appendClaimList(
    lines,
    "Stale / Suspicious",
    state.current_state.stale_suspicious,
    8
  );
  appendClaimList(lines, "Unknowns", state.current_state.unknown, 8);

  return `${lines.join("\n")}\n`;
}

export function renderTodoList(todos, options = {}) {
  const visible = options.all ? todos : todos.filter((todo) => !todo.done);
  const lines = [];
  lines.push("# Kanon Todos");
  lines.push("");

  if (!visible.length) {
    lines.push(options.all ? "No Kanon todos found." : "No open Kanon todos.");
    return `${lines.join("\n")}\n`;
  }

  for (const todo of visible) {
    lines.push(`${todo.number}. [${todo.done ? "x" : " "}] ${todo.text}`);
    for (const detail of todo.details || []) {
      lines.push(`   ${detail}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
