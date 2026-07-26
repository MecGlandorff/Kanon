import {
  appendClaimList,
  appendCommandGroup,
  collectEvidenceIds,
  formatEvidenceRefs
} from "./shared.js";

export function renderAsk(analysis, question, options = {}) {
  const answer = options.answer;
  if (answer) {
    return renderStructuredAnswer(question, answer);
  }

  const state = analysis.state;
  const normalized = question.toLowerCase();
  const lines = [];
  lines.push("# Kanon Answer");
  lines.push("");
  lines.push(`Question: ${question}`);
  lines.push("");

  if (/left|todo|next|start|contribution|contribute/.test(normalized)) {
    lines.push("## Answer");
    appendClaimList(lines, "Suggested", state.current_state.suggested, 8);
    appendClaimList(lines, "Unknown", state.current_state.unknown, 8);
    if (state.todos.length) {
      lines.push("### TODO / FIXME");
      for (const todo of state.todos.slice(0, 8)) {
        lines.push(`- ${todo.path}:${todo.line} ${todo.text}`);
      }
      lines.push("");
    }
  } else if (/stale|drift|suspicious|readme/.test(normalized)) {
    lines.push("## Answer");
    appendClaimList(
      lines,
      "Stale / Suspicious",
      state.current_state.stale_suspicious,
      10
    );
  } else if (/what.*(do|is)|purpose|about/.test(normalized)) {
    lines.push("## Answer");
    lines.push(formatClaim(state.purpose));
    lines.push("");
    appendClaimList(lines, "Known", state.current_state.known, 5);
    appendClaimList(lines, "Likely", state.current_state.likely, 5);
  } else if (/test|verify|check/.test(normalized)) {
    lines.push("## Answer");
    appendCommandGroup(lines, "Test", state.commands.test);
    appendClaimList(
      lines,
      "Stale / Suspicious",
      state.current_state.stale_suspicious,
      8
    );
  } else if (/run|start|dev|build/.test(normalized)) {
    lines.push("## Answer");
    appendCommandGroup(lines, "Run", state.commands.run);
    appendCommandGroup(lines, "Dev", state.commands.dev);
    appendCommandGroup(lines, "Build", state.commands.build);
  } else {
    lines.push("## Answer");
    lines.push(formatClaim(state.purpose));
    lines.push("");
    appendClaimList(lines, "Suggested", state.current_state.suggested, 6);
  }

  lines.push("## Evidence");
  const ids = collectEvidenceIds(lines.join("\n"));
  const selected = analysis.evidence
    .filter((item) => ids.has(item.id))
    .slice(0, 12);
  for (const item of selected.length ? selected : analysis.evidence.slice(0, 8)) {
    lines.push(`- ${item.id} ${item.path}: ${item.claim}`);
  }

  return `${lines.join("\n")}\n`;
}

function renderStructuredAnswer(question, answer) {
  const lines = [
    "# Kanon Answer",
    "",
    `Question: ${question}`,
    "",
    "## Answer",
    `- ${labelForConfidence(answer.confidence)}: ${answer.summary}`
  ];

  for (const claim of (answer.claims || []).slice(0, 10)) {
    lines.push(
      `- ${claim.claim}${claim.reason ? ` ${claim.reason}` : ""}${formatEvidenceRefs(claim.evidence)}`
    );
  }

  lines.push("", "## Evidence");
  const evidence = answer.evidence || [];
  if (!evidence.length) {
    lines.push("- None found.");
  }
  for (const item of evidence.slice(0, 12)) {
    if (item.id) {
      lines.push(`- ${item.id} ${item.path || ""}`.trimEnd());
    } else {
      lines.push(`- ${item.path}:${item.line} ${item.excerpt}`);
    }
  }

  if (answer.searched_terms?.length) {
    lines.push("", `Searched terms: ${answer.searched_terms.join(", ")}`);
  }

  return `${lines.join("\n")}\n`;
}

function labelForConfidence(confidence) {
  if (confidence === "stale / suspicious") {
    return "Stale / suspicious";
  }
  const normalized = String(confidence || "unknown");
  return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`;
}

function formatClaim(item) {
  return `- ${item.claim} (${item.confidence})${formatEvidenceRefs(item.evidence)}`;
}
