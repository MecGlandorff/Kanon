import {
  codeSpan,
  escapeMarkdownText,
  repositoryDataBlock,
  safeEvidenceId
} from "../trust.js";
import { buildContinuityReport } from "../continuity/engine.js";

export function appendCommandGroup(
  lines,
  label,
  commands,
  executionPolicy = "ask"
) {
  lines.push(`### ${label}`);
  if (!commands.length) {
    lines.push("- Unknown: no command declaration found.");
    return;
  }

  for (const item of commands) {
    const cwd = item.cwd && item.cwd !== "."
      ? `, from ${codeSpan(item.cwd)}`
      : "";
    lines.push(
      `- Repository data — declared candidate: ${codeSpan(item.command)} (${escapeMarkdownText(item.source)}, ${escapeMarkdownText(item.confidence)}${cwd}).${formatEvidenceRefs(item.evidence)}`
    );
    lines.push(
      executionPolicy === "never"
        ? "  Kanon policy: execution is prohibited."
        : "  Kanon policy: inspect the definition and obtain user approval before execution."
    );
  }
}

export function appendClaimList(lines, title, claims, limit) {
  lines.push(`### ${title}`);
  if (!claims.length) {
    lines.push("- None detected.");
    return;
  }

  for (const item of claims.slice(0, limit)) {
    const prefix =
      item.trust === "repository-untrusted"
        ? "Repository data — "
        : "";
    lines.push(
      `- ${prefix}${escapeMarkdownText(item.claim)}${
        item.reason ? ` ${escapeMarkdownText(item.reason)}` : ""
      }${formatEvidenceRefs(item.evidence)}`
    );
  }
}

export function appendIssueList(lines, issues) {
  for (const issue of issues) {
    lines.push(
      `- Repository data — ${escapeMarkdownText(issue.claim)}`
    );
    lines.push(
      `  Observation: ${escapeMarkdownText(issue.observation)}${formatEvidenceRefs(issue.evidence)}`
    );
    if (issue.suggestion) {
      lines.push(`  Suggested: ${escapeMarkdownText(issue.suggestion)}`);
    }
  }
}

export function appendStateDiff(lines, previous, current, options = {}) {
  const report = options.continuity?.schema === "kanon-continuity-report-v1"
    ? options.continuity
    : buildContinuityReport({
        current,
        previous,
        ...(options.previousWarning
          ? { previous_warning: options.previousWarning }
          : {}),
        ...(options.handoff ? { handoff: options.handoff } : {})
      });
  lines.push("## Changes Since Checkpoint");
  if (!report.ok) {
    lines.push(`- Unknown: ${escapeMarkdownText(report.diagnostic)}`);
    lines.push("");
    return;
  }
  if (!report.observations.added.length &&
      !report.observations.changed.length &&
      !report.observations.contradicted.length) {
    lines.push(
      "- No file-level changes detected from the last Kanon checkpoint."
    );
  }
  for (const category of ["added", "changed", "contradicted"]) {
    for (const observation of report.observations[category].slice(0, 8)) {
      const label =
        `${category.slice(0, 1).toUpperCase()}${category.slice(1)}`;
      lines.push(
        `- ${label}: ${
          observation.path
            ? codeSpan(observation.path)
            : escapeMarkdownText(observation.claim)
        }`
      );
    }
  }
  lines.push("");

  appendContinuityCategory(
    lines,
    "Stale Continuity",
    report.observations.stale
  );
  appendContinuityCategory(
    lines,
    "Unavailable Continuity Evidence",
    report.observations.unavailable
  );
}

function appendContinuityCategory(lines, title, observations) {
  if (!observations.length) {
    return;
  }
  lines.push(`## ${title}`);
  for (const observation of observations.slice(0, 8)) {
    lines.push(
      `- ${observation.path ? `${codeSpan(observation.path)}: ` : ""}` +
      escapeMarkdownText(observation.claim)
    );
  }
  lines.push("");
}

export function formatClaim(item) {
  const prefix =
    item.trust === "repository-untrusted"
      ? "Repository data — "
      : "";
  return `- ${prefix}${escapeMarkdownText(item.claim)} (${escapeMarkdownText(item.confidence)})${formatEvidenceRefs(item.evidence)}`;
}

export function formatEvidenceRefs(evidence = []) {
  const refs = evidence.filter(Boolean).map(safeEvidenceId);
  return refs.length ? ` [${refs.join(", ")}]` : "";
}

export function appendRepositoryExcerpt(lines, excerpt, indent = 2) {
  lines.push(...repositoryDataBlock(excerpt, indent));
}

export function labelForCategory(category) {
  if (category === "ci") {
    return "CI";
  }
  return String(category)
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function collectEvidenceIds(text) {
  const ids = new Set();
  const pattern = /e_[A-Za-z0-9]{14,64}_[0-9]{3,8}/g;
  let match;
  while ((match = pattern.exec(text))) {
    ids.add(match[0]);
  }
  return ids;
}

export { codeSpan, escapeMarkdownText };
