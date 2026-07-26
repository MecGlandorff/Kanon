import path from "node:path";

export function firstHeadingOrLine(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() : lines[0] || "";
}

export function normalizeRequestedPath(value) {
  if (!value) {
    return null;
  }
  const normalized = path.posix.normalize(
    String(value).replaceAll("\\", "/").replace(/^\.\//, "")
  );
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`README path must stay inside the repository: ${value}`);
  }
  return normalized;
}

export function uniqueClaims(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.claim)) {
      return false;
    }
    seen.add(item.claim);
    return true;
  });
}

export function scanLimitationReason(scan) {
  const reasons = [];
  if (scan.truncated) {
    reasons.push(`the ${scan.max_files}-file scan limit was reached`);
  }
  if (scan.unreadable_entries) {
    reasons.push(`${scan.unreadable_entries} entry or directory read(s) failed`);
  }
  return reasons.length ? `${reasons.join("; ")}.` : "The scan did not complete.";
}
