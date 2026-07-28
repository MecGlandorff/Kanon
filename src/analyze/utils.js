import path from "node:path";

/**
 * @param {unknown} text
 * @returns {string}
 */
export function firstHeadingOrLine(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() : lines[0] || "";
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
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
    throw new Error(
      `README path must stay inside the repository: ${normalized}`
    );
  }
  return normalized;
}

/**
 * @template {{claim: string}} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function uniqueClaims(items) {
  /** @type {Set<string>} */
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.claim)) {
      return false;
    }
    seen.add(item.claim);
    return true;
  });
}

/**
 * @param {import("../scanner/scan.js").ScanDiagnostics} scan
 * @returns {string}
 */
export function scanLimitationReason(scan) {
  /** @type {string[]} */
  const reasons = [];
  for (const budget of scan.budgets_reached || []) {
    reasons.push(`the ${budget} budget was reached`);
  }
  if (scan.unreadable_entries) {
    reasons.push(`${scan.unreadable_entries} entry or directory read(s) failed`);
  }
  if (scan.rejected_paths) {
    reasons.push(`${scan.rejected_paths} unsafe path(s) were rejected`);
  }
  if (scan.outside_root_paths) {
    reasons.push(
      `${scan.outside_root_paths} path(s) resolved outside the repository root`
    );
  }
  if (scan.git_observation_failed) {
    reasons.push(
      `Git scanning failed (${scan.git_diagnostic || "no diagnostic"})`
    );
  }
  return reasons.length ? `${reasons.join("; ")}.` : "The scan did not complete.";
}
