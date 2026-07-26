import { groupRecommendations } from "../improve.js";
import {
  formatEvidenceRefs,
  labelForCategory
} from "./shared.js";

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

function renderImproveTop(improvements) {
  const lines = [];
  lines.push("# Kanon Improve");
  lines.push("");
  lines.push("Mode: top");
  lines.push("");
  lines.push("## Top Recommendations");

  const top = improvements.recommendations.slice(0, 5);
  if (!top.length) {
    lines.push(
      "- No major improvement recommendations found by the current checks."
    );
  }
  top.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.title} (${item.impact} impact, ${item.confidence})${formatEvidenceRefs(item.evidence)}`
    );
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
    lines.push(
      "No major improvement recommendations found by the current checks."
    );
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
      lines.push(
        `- ${item.title} (${item.impact} impact, ${item.confidence})${formatEvidenceRefs(item.evidence)}`
      );
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
    lines.push(
      `- ${item.label}: ${item.score}/100 (${item.status})${formatEvidenceRefs(item.evidence)}`
    );
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
