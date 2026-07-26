import {
  appendClaimList,
  appendCommandGroup,
  formatClaim,
  formatEvidenceRefs
} from "./shared.js";

export function renderBrief(analysis, options = {}) {
  const state = analysis.state;
  const lines = [];
  lines.push("# Kanon Repo Brief");
  lines.push("");
  lines.push(`Generated: ${state.generated_at}`);
  lines.push(`Repo: ${state.repo.name}`);
  if (state.repo.languages.length) {
    lines.push(`Languages: ${state.repo.languages.join(", ")}`);
  }
  lines.push("");

  lines.push("## What This Repo Does");
  lines.push(formatClaim(state.purpose));
  lines.push("");

  lines.push("## How To Run");
  appendCommandGroup(lines, "Run", state.commands.run);
  appendCommandGroup(lines, "Dev", state.commands.dev);
  appendCommandGroup(lines, "Build", state.commands.build);
  appendCommandGroup(lines, "Test", state.commands.test);
  lines.push("");

  lines.push("## Important Files");
  if (state.important_files.length) {
    for (const file of state.important_files.slice(0, options.deep ? 16 : 10)) {
      lines.push(
        `- ${file.path}: ${file.reason}${formatEvidenceRefs(file.evidence)}`
      );
    }
  } else {
    lines.push("- No standard important files detected.");
  }
  lines.push("");

  lines.push("## Current Implementation State");
  appendClaimList(
    lines,
    "Known",
    state.current_state.known,
    options.deep ? 12 : 6
  );
  appendClaimList(
    lines,
    "Likely",
    state.current_state.likely,
    options.deep ? 12 : 5
  );
  appendClaimList(
    lines,
    "Stale / Suspicious",
    state.current_state.stale_suspicious,
    options.deep ? 12 : 6
  );
  appendClaimList(
    lines,
    "Unknown",
    state.current_state.unknown,
    options.deep ? 12 : 6
  );
  appendClaimList(
    lines,
    "Suggested",
    state.current_state.suggested,
    options.deep ? 12 : 6
  );
  lines.push("");

  if (state.todos.length) {
    lines.push("## TODO / FIXME");
    for (const todo of state.todos.slice(0, options.deep ? 20 : 8)) {
      lines.push(`- ${todo.path}:${todo.line} ${todo.text}`);
    }
    lines.push("");
  }

  lines.push("## Evidence Used");
  for (const item of analysis.evidence.slice(0, options.deep ? 40 : 16)) {
    lines.push(`- ${item.id} ${item.kind} ${item.path}: ${item.claim}`);
  }
  if (!options.deep && analysis.evidence.length > 16) {
    lines.push(`- ... ${analysis.evidence.length - 16} more evidence record(s)`);
  }

  return `${lines.join("\n")}\n`;
}
