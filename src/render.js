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
      lines.push(`- ${file.path}: ${file.reason}${formatEvidenceRefs(file.evidence)}`);
    }
  } else {
    lines.push("- No standard important files detected.");
  }
  lines.push("");

  lines.push("## Current Implementation State");
  appendClaimList(lines, "Known", state.current_state.known, options.deep ? 12 : 6);
  appendClaimList(lines, "Likely", state.current_state.likely, options.deep ? 12 : 5);
  appendClaimList(lines, "Stale / Suspicious", state.current_state.stale_suspicious, options.deep ? 12 : 6);
  appendClaimList(lines, "Unknown", state.current_state.unknown, options.deep ? 12 : 6);
  appendClaimList(lines, "Suggested", state.current_state.suggested, options.deep ? 12 : 6);
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

export function renderVerify(analysis) {
  const verification = analysis.state.verification;
  const lines = [];
  lines.push("# Kanon Verify");
  lines.push("");
  lines.push(`Target: ${verification.target}`);
  lines.push("");

  if (!verification.checked) {
    lines.push("Kanon could not run README drift checks.");
    appendIssueList(lines, verification.issues);
    return `${lines.join("\n")}\n`;
  }

  if (!verification.issues.length) {
    lines.push("No README drift found by the current v0.1 checks.");
    lines.push("");
    lines.push(`Commands checked: ${verification.commands_checked}`);
    return `${lines.join("\n")}\n`;
  }

  lines.push("README / repo drift:");
  appendIssueList(lines, verification.issues);
  return `${lines.join("\n")}\n`;
}

export function renderResume(analysis, previousState = null) {
  const state = analysis.state;
  const lines = [];
  lines.push("# Resume This Repo");
  lines.push("");

  if (!previousState) {
    lines.push("No previous .kanon/STATE.json checkpoint found.");
    lines.push("");
  } else {
    lines.push(`Last Kanon checkpoint: ${previousState.generated_at || "unknown"}`);
    lines.push(`Current analysis: ${state.generated_at}`);
    lines.push("");
    appendStateDiff(lines, previousState, state);
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

  appendClaimList(lines, "Stale / Suspicious", state.current_state.stale_suspicious, 8);
  appendClaimList(lines, "Unknowns", state.current_state.unknown, 8);

  return `${lines.join("\n")}\n`;
}

export function renderAsk(analysis, question) {
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
    appendClaimList(lines, "Stale / Suspicious", state.current_state.stale_suspicious, 10);
  } else if (/what.*(do|is)|purpose|about/.test(normalized)) {
    lines.push("## Answer");
    lines.push(formatClaim(state.purpose));
    lines.push("");
    appendClaimList(lines, "Known", state.current_state.known, 5);
    appendClaimList(lines, "Likely", state.current_state.likely, 5);
  } else if (/test|verify|check/.test(normalized)) {
    lines.push("## Answer");
    appendCommandGroup(lines, "Test", state.commands.test);
    appendClaimList(lines, "Stale / Suspicious", state.current_state.stale_suspicious, 8);
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
  const selected = analysis.evidence.filter((item) => ids.has(item.id)).slice(0, 12);
  for (const item of selected.length ? selected : analysis.evidence.slice(0, 8)) {
    lines.push(`- ${item.id} ${item.path}: ${item.claim}`);
  }

  return `${lines.join("\n")}\n`;
}

function appendCommandGroup(lines, label, commands) {
  lines.push(`### ${label}`);
  if (!commands.length) {
    lines.push("- Unknown: no command evidence found.");
    return;
  }

  for (const item of commands) {
    lines.push(`- \`${item.command}\` (${item.source}, ${item.confidence})${formatEvidenceRefs(item.evidence)}`);
  }
}

function appendClaimList(lines, title, claims, limit) {
  lines.push(`### ${title}`);
  if (!claims.length) {
    lines.push("- None detected.");
    return;
  }

  for (const item of claims.slice(0, limit)) {
    lines.push(`- ${item.claim}${item.reason ? ` ${item.reason}` : ""}${formatEvidenceRefs(item.evidence)}`);
  }
}

function appendIssueList(lines, issues) {
  for (const issue of issues) {
    lines.push(`- ${issue.claim}`);
    lines.push(`  Observation: ${issue.observation}${formatEvidenceRefs(issue.evidence)}`);
    if (issue.suggestion) {
      lines.push(`  Suggested: ${issue.suggestion}`);
    }
  }
}

function appendStateDiff(lines, previous, current) {
  const before = new Map((previous.files?.fingerprints || []).map((file) => [file.path, file.sha256]));
  const after = new Map((current.files?.fingerprints || []).map((file) => [file.path, file.sha256]));
  const added = [];
  const removed = [];
  const changed = [];

  for (const [file, hash] of after) {
    if (!before.has(file)) {
      added.push(file);
    } else if (hash && before.get(file) && hash !== before.get(file)) {
      changed.push(file);
    }
  }

  for (const file of before.keys()) {
    if (!after.has(file)) {
      removed.push(file);
    }
  }

  lines.push("## Changes Since Checkpoint");
  if (!added.length && !removed.length && !changed.length) {
    lines.push("- No file-level changes detected from the last Kanon checkpoint.");
  }
  for (const file of added.slice(0, 8)) {
    lines.push(`- Added: ${file}`);
  }
  for (const file of changed.slice(0, 8)) {
    lines.push(`- Changed: ${file}`);
  }
  for (const file of removed.slice(0, 8)) {
    lines.push(`- Removed: ${file}`);
  }
  lines.push("");
}

function formatClaim(item) {
  return `- ${item.claim} (${item.confidence})${formatEvidenceRefs(item.evidence)}`;
}

function formatEvidenceRefs(evidence = []) {
  const refs = evidence.filter(Boolean);
  return refs.length ? ` [${refs.join(", ")}]` : "";
}

function collectEvidenceIds(text) {
  const ids = new Set();
  const pattern = /e_[0-9]{14}_[0-9]{3}/g;
  let match;
  while ((match = pattern.exec(text))) {
    ids.add(match[0]);
  }
  return ids;
}
