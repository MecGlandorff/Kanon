export function appendCommandGroup(lines, label, commands) {
  lines.push(`### ${label}`);
  if (!commands.length) {
    lines.push("- Unknown: no command evidence found.");
    return;
  }

  for (const item of commands) {
    const cwd = item.cwd && item.cwd !== "."
      ? `, from \`${item.cwd}\``
      : "";
    lines.push(
      `- \`${item.command}\` (${item.source}, ${item.confidence}${cwd})${formatEvidenceRefs(item.evidence)}`
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
    lines.push(
      `- ${item.claim}${item.reason ? ` ${item.reason}` : ""}${formatEvidenceRefs(item.evidence)}`
    );
  }
}

export function appendIssueList(lines, issues) {
  for (const issue of issues) {
    lines.push(`- ${issue.claim}`);
    lines.push(
      `  Observation: ${issue.observation}${formatEvidenceRefs(issue.evidence)}`
    );
    if (issue.suggestion) {
      lines.push(`  Suggested: ${issue.suggestion}`);
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

export function formatClaim(item) {
  return `- ${item.claim} (${item.confidence})${formatEvidenceRefs(item.evidence)}`;
}

export function formatEvidenceRefs(evidence = []) {
  const refs = evidence.filter(Boolean);
  return refs.length ? ` [${refs.join(", ")}]` : "";
}

export function labelForCategory(category) {
  if (category === "ci") {
    return "CI";
  }
  return category
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function collectEvidenceIds(text) {
  const ids = new Set();
  const pattern = /e_[A-Za-z0-9]{14,32}_[0-9]{3}/g;
  let match;
  while ((match = pattern.exec(text))) {
    ids.add(match[0]);
  }
  return ids;
}
