import {
  codeSpan,
  escapeMarkdownText,
  repositoryDataBlock,
  safeEvidenceId
} from "../trust.js";

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

export function appendStateDiff(lines, previous, current) {
  const before = new Map(
    (previous.files?.fingerprints || [])
      .map((file) => [file.path, file.sha256])
  );
  const after = new Map(
    (current.files?.fingerprints || [])
      .map((file) => [file.path, file.sha256])
  );
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
    lines.push(
      "- No file-level changes detected from the last Kanon checkpoint."
    );
  }
  for (const file of added.slice(0, 8)) {
    lines.push(`- Added: ${codeSpan(file)}`);
  }
  for (const file of changed.slice(0, 8)) {
    lines.push(`- Changed: ${codeSpan(file)}`);
  }
  for (const file of removed.slice(0, 8)) {
    lines.push(`- Removed: ${codeSpan(file)}`);
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
