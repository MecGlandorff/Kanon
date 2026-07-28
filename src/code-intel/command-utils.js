import {
  normalizeCwd,
  normalizeShellCommand
} from "./shared.js";

/**
 * @typedef {{
 *   command: string,
 *   cwd: string,
 *   source: string,
 *   score: number,
 *   confidence: "known" | "likely" | "unknown",
 *   detail: string | null
 * }} CommandCandidate
 */

/**
 * @param {CommandCandidate[]} target
 * @param {unknown} command
 * @param {string} source
 * @param {number} score
 * @param {"known" | "likely" | "unknown"} confidence
 * @param {string | null} [detail]
 * @param {unknown} [cwd]
 * @returns {void}
 */
export function addCommand(
  target,
  command,
  source,
  score,
  confidence,
  detail = null,
  cwd = "."
) {
  const normalized = normalizeShellCommand(command);
  if (!normalized) {
    return;
  }
  const item = {
    command: normalized,
    cwd: normalizeCwd(cwd),
    source,
    score,
    confidence,
    detail
  };
  const existing = target.find(
    (candidate) =>
      candidate.command === item.command &&
      candidate.cwd === item.cwd
  );
  if (!existing) {
    target.push(item);
  } else if (score > existing.score) {
    Object.assign(existing, item);
  }
}

/**
 * @param {CommandCandidate[]} candidates
 * @returns {CommandCandidate[]}
 */
export function selectCommand(candidates) {
  if (candidates.length === 0) {
    return [];
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
      a.command.length - b.command.length ||
      a.command.localeCompare(b.command)
  );
  const best = candidates[0];
  if (!best) {
    return [];
  }
  if (best.confidence !== "known" && best.score < 160) {
    return [];
  }
  const competing = candidates.find(
    (candidate, index) =>
      index > 0 &&
      candidate.command !== best.command &&
      candidate.score >= best.score - 5 &&
      !sameInvocation(best, candidate)
  );
  if (best.confidence !== "known" && competing) {
    return [];
  }
  return [best];
}

/**
 * Argument variants of the same declared invocation are not contradictory.
 * Source and cwd must agree, and one complete token sequence must prefix the
 * other.
 *
 * @param {CommandCandidate} left
 * @param {CommandCandidate} right
 * @returns {boolean}
 */
function sameInvocation(left, right) {
  if (left.source !== right.source || left.cwd !== right.cwd) {
    return false;
  }
  const leftTokens = left.command.split(/\s+/);
  const rightTokens = right.command.split(/\s+/);
  const shorter =
    leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer =
    leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;
  return shorter.every((token, index) => token === longer[index]);
}

/**
 * @param {string} manager
 * @param {string} name
 * @returns {string}
 */
export function packageScriptCommand(manager, name) {
  if (manager === "npm") {
    return name === "test" ? "npm test" :
      name === "start" ? "npm start" :
      `npm run ${name}`;
  }
  return `${manager} ${name}`;
}

/**
 * @param {unknown} script
 * @returns {boolean}
 */
export function isPlaceholderScript(script) {
  return /(?:no test specified|not implemented|exit\s+1)/i.test(String(script));
}

/**
 * @param {"known" | "likely" | "unknown"} value
 * @returns {number}
 */
function confidenceRank(value) {
  return value === "known" ? 2 : value === "likely" ? 1 : 0;
}
