import { formatEvidenceRefs } from "./shared.js";

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
    lines.push(
      `- ${hotspot.title} (${hotspot.payoff} payoff, ${hotspot.risk} risk, ${hotspot.confidence})${formatEvidenceRefs(hotspot.evidence)}`
    );
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
    lines.push(
      `- ${question.prompt} ${refactor.answers[question.id] || question.default}`
    );
  }
  lines.push("");
}

function appendPrimaryTarget(lines, refactor) {
  lines.push("## Primary Target");
  const primary = refactor.plan.primary_target;
  if (!primary) {
    lines.push(
      "- No strong primary target found. Start with a short source inspection and choose one bounded cleanup."
    );
    lines.push("");
    return;
  }

  lines.push(
    `- ${primary.title} (${primary.payoff} payoff, ${primary.risk} risk, ${primary.confidence})`
  );
  lines.push(`  Target: ${primary.target}`);
  lines.push(`  Action: ${primary.suggested_action}`);
  for (const reason of primary.reasons.slice(0, 4)) {
    lines.push(`  Reason: ${reason}`);
  }
  if (refactor.plan.secondary_targets.length) {
    lines.push("");
    lines.push("## Secondary Targets");
    for (const item of refactor.plan.secondary_targets) {
      lines.push(
        `- ${item.target}: ${item.title} (${item.payoff} payoff, ${item.risk} risk)`
      );
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
