import { groupRecommendations } from "./improve.js";

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

  if (verification.applicable === false) {
    lines.push(verification.note || "README verification is not applicable to this repository.");
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
      lines.push("Warning: the repository scan was incomplete, so absence-based checks are inconclusive.");
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
    lines.push(`Last Kanon checkpoint: ${previousState.generated_at || "unknown"}`);
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

  appendClaimList(lines, "Stale / Suspicious", state.current_state.stale_suspicious, 8);
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

export function renderImprove(improvements, options = {}) {
  const mode = options.mode || "top";
  if (mode === "audit") {
    return renderImproveAudit(improvements);
  }
  if (mode === "scorecard") {
    return renderImproveScorecard(improvements);
  }
  return renderImproveTop(improvements);
}

export function renderRefactor(refactor, options = {}) {
  const mode = options.mode || "plan";
  if (mode === "audit") {
    return renderRefactorAudit(refactor);
  }
  if (mode === "prompt") {
    return renderRefactorPrompt(refactor);
  }
  return renderRefactorPlan(refactor);
}

function renderRefactorPlan(refactor) {
  const lines = [];
  lines.push("# Kanon Refactor Plan");
  lines.push("");
  lines.push("Mode: plan");
  lines.push("");
  appendRefactorSteering(lines, refactor);
  appendPrimaryTarget(lines, refactor);
  lines.push("## One-Session Plan");
  refactor.plan.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push("");
  appendDoNotTouch(lines, refactor);
  appendDeletionPolicy(lines, refactor);
  appendAgentPrompt(lines, refactor);
  return `${lines.join("\n")}\n`;
}

function renderRefactorAudit(refactor) {
  const lines = [];
  lines.push("# Kanon Refactor Plan");
  lines.push("");
  lines.push("Mode: audit");
  lines.push("");
  appendRefactorSteering(lines, refactor);
  lines.push("## Hotspots");
  if (!refactor.hotspots.length) {
    lines.push("- No strong refactor hotspots found by the current checks.");
  }
  for (const hotspot of refactor.hotspots.slice(0, 20)) {
    lines.push(`- ${hotspot.title} (${hotspot.payoff} payoff, ${hotspot.risk} risk, ${hotspot.confidence})${formatEvidenceRefs(hotspot.evidence)}`);
    lines.push(`  Target: ${hotspot.target}`);
    lines.push(`  Action: ${hotspot.suggested_action}`);
    for (const reason of hotspot.reasons.slice(0, 3)) {
      lines.push(`  Reason: ${reason}`);
    }
  }
  lines.push("");
  appendDoNotTouch(lines, refactor);
  appendDeletionPolicy(lines, refactor);
  return `${lines.join("\n")}\n`;
}

function renderRefactorPrompt(refactor) {
  const lines = [];
  lines.push("# Kanon Refactor Prompt");
  lines.push("");
  lines.push("Mode: prompt");
  lines.push("");
  appendAgentPrompt(lines, refactor);
  return `${lines.join("\n")}\n`;
}

function appendRefactorSteering(lines, refactor) {
  lines.push("## User Steering");
  for (const question of refactor.questions) {
    lines.push(`- ${question.prompt} ${refactor.answers[question.id] || question.default}`);
  }
  lines.push("");
}

function appendPrimaryTarget(lines, refactor) {
  lines.push("## Primary Target");
  const primary = refactor.plan.primary_target;
  if (!primary) {
    lines.push("- No strong primary target found. Start with a short source inspection and choose one bounded cleanup.");
    lines.push("");
    return;
  }

  lines.push(`- ${primary.title} (${primary.payoff} payoff, ${primary.risk} risk, ${primary.confidence})`);
  lines.push(`  Target: ${primary.target}`);
  lines.push(`  Action: ${primary.suggested_action}`);
  for (const reason of primary.reasons.slice(0, 4)) {
    lines.push(`  Reason: ${reason}`);
  }
  if (refactor.plan.secondary_targets.length) {
    lines.push("");
    lines.push("## Secondary Targets");
    for (const item of refactor.plan.secondary_targets) {
      lines.push(`- ${item.target}: ${item.title} (${item.payoff} payoff, ${item.risk} risk)`);
    }
  }
  lines.push("");
}

function appendDoNotTouch(lines, refactor) {
  lines.push("## Do Not Touch");
  for (const item of refactor.do_not_touch) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function appendDeletionPolicy(lines, refactor) {
  lines.push("## Deletion Policy");
  lines.push(`- ${refactor.deletion_policy.rule}`);
  lines.push(`- User answer/default: ${refactor.deletion_policy.user_answer}`);
  lines.push("");
}

function appendAgentPrompt(lines, refactor) {
  lines.push("## Agent Prompt");
  lines.push("");
  lines.push("```text");
  lines.push(refactor.agent_prompt);
  lines.push("```");
}

function renderImproveTop(improvements) {
  const lines = [];
  lines.push("# Kanon Improve");
  lines.push("");
  lines.push("Mode: top");
  lines.push("");
  lines.push("## Top Recommendations");

  const top = improvements.recommendations.slice(0, 5);
  if (!top.length) {
    lines.push("- No major improvement recommendations found by the current checks.");
  }
  top.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title} (${item.impact} impact, ${item.confidence})${formatEvidenceRefs(item.evidence)}`);
    lines.push(`   Why: ${item.why}`);
    lines.push(`   Next: ${item.next_action}`);
  });

  lines.push("");
  appendImproveLimitations(lines, improvements);
  appendScorecardSummary(lines, improvements.scorecard);
  return `${lines.join("\n")}\n`;
}

function renderImproveAudit(improvements) {
  const lines = [];
  lines.push("# Kanon Improve");
  lines.push("");
  lines.push("Mode: audit");
  lines.push("");

  const groups = groupRecommendations(improvements.recommendations);
  if (!groups.length) {
    lines.push("No major improvement recommendations found by the current checks.");
    lines.push("");
  }

  let currentGroup = null;
  for (const group of groups) {
    if (group.group !== currentGroup) {
      currentGroup = group.group;
      lines.push(`## ${currentGroup}`);
    }
    lines.push(`### ${labelForCategory(group.category)}`);
    for (const item of group.items) {
      lines.push(`- ${item.title} (${item.impact} impact, ${item.confidence})${formatEvidenceRefs(item.evidence)}`);
      lines.push(`  Why: ${item.why}`);
      lines.push(`  Next: ${item.next_action}`);
    }
    lines.push("");
  }

  appendImproveLimitations(lines, improvements);
  appendScorecardSummary(lines, improvements.scorecard);
  return `${lines.join("\n")}\n`;
}

function renderImproveScorecard(improvements) {
  const lines = [];
  lines.push("# Kanon Improve");
  lines.push("");
  lines.push("Mode: scorecard");
  lines.push("");
  appendImproveLimitations(lines, improvements);
  appendScorecardSummary(lines, improvements.scorecard);
  return `${lines.join("\n")}\n`;
}

function appendScorecardSummary(lines, scorecard) {
  lines.push("## Scorecard");
  for (const item of scorecard) {
    lines.push(`- ${item.label}: ${item.score}/100 (${item.status})${formatEvidenceRefs(item.evidence)}`);
    lines.push(`  ${item.reason}`);
  }
}

function appendImproveLimitations(lines, improvements) {
  if (!improvements.limitations?.length) {
    return;
  }
  lines.push("## Limitations");
  for (const limitation of improvements.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push("");
}

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

function labelForCategory(category) {
  if (category === "ci") {
    return "CI";
  }
  return category
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function collectEvidenceIds(text) {
  const ids = new Set();
  const pattern = /e_[A-Za-z0-9]{14,32}_[0-9]{3}/g;
  let match;
  while ((match = pattern.exec(text))) {
    ids.add(match[0]);
  }
  return ids;
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
    lines.push(`- ${claim.claim}${claim.reason ? ` ${claim.reason}` : ""}${formatEvidenceRefs(claim.evidence)}`);
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
  return `${String(confidence || "unknown").slice(0, 1).toUpperCase()}${String(confidence || "unknown").slice(1)}`;
}
