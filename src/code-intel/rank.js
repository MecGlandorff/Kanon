import path from "node:path";
import {
  GENERATED_FILE,
  LOW_VALUE_PATH
} from "./constants.js";
import { curateRankedFiles } from "./curate.js";
import { depth, unique } from "./shared.js";

/**
 * @typedef {import("./shared.js").CodeSignal} CodeSignal
 * @typedef {import("./shared.js").RankedFile} RankedFile
 * @typedef {{path: string, text: boolean}} RankedInputFile
 */

/**
 * @param {RankedInputFile[]} files
 * @param {{
 *   signals: Map<string, CodeSignal[]>,
 *   importers: Map<string, Set<string>>,
 *   references: Map<string, Set<string>>
 * }} intel
 * @param {{packageJson?: unknown, goModule?: string | null}} [context]
 * @returns {RankedFile[]}
 */
export function rankImportantFiles(files, intel, context = {}) {
  /** @type {RankedFile[]} */
  const ranked = [];
  for (const file of files) {
    if (!file.text || GENERATED_FILE.test(file.path) || /\.map$/.test(file.path)) {
      continue;
    }
    /** @type {string[]} */
    const reasons = [];
    const signals = intel.signals.get(file.path) || [];
    const fanIn = intel.importers.get(file.path)?.size || 0;
    const referenceCount = intel.references.get(file.path)?.size || 0;
    let score = baseImportance(file.path, reasons);

    for (const signal of signals) {
      score += signal.score;
      reasons.push(signal.reason);
    }
    if (fanIn > 0) {
      score += Math.min(135, Math.round(24 * Math.log2(fanIn + 1)));
      reasons.push(`imported by ${fanIn} local file${fanIn === 1 ? "" : "s"}`);
    }
    if (referenceCount > 0) {
      score += Math.min(60, 12 * referenceCount);
      reasons.push(`referenced by ${referenceCount} local file${referenceCount === 1 ? "" : "s"}`);
    }
    if (LOW_VALUE_PATH.test(file.path)) {
      score -= 85;
    }
    if (/^\.github\/workflows\//.test(file.path)) {
      score -= 120;
    }
    if (/(^|\/)(tests?|__tests__)\//.test(file.path)) {
      score -= 18;
    }
    score -= Math.min(30, depth(file.path) * 4);
    ranked.push({
      path: file.path,
      score,
      fan_in: fanIn,
      referenced_by: referenceCount,
      signals,
      reasons: unique(reasons)
    });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.fan_in - a.fan_in ||
      a.path.localeCompare(b.path)
  );
  return curateRankedFiles(ranked, {
    ...(context.goModule === undefined
      ? {}
      : { goModule: context.goModule })
  });
}

/**
 * @param {string} relPath
 * @param {string[]} reasons
 * @returns {number}
 */
function baseImportance(relPath, reasons) {
  const lower = relPath.toLowerCase();
  const basename = path.posix.basename(lower);
  let score = 0;
  const exact = new Map([
    ["package.json", 138],
    ["pyproject.toml", 142],
    ["cargo.toml", 145],
    ["go.mod", 145],
    ["makefile", 132],
    ["justfile", 132]
  ]);
  if (!relPath.includes("/") && exact.has(lower)) {
    score += exact.get(lower) ?? 0;
    reasons.push("root project/build metadata");
  }
  if (/^readme(?:\.[^.]+)?$/i.test(basename)) {
    score += relPath.includes("/") ? 12 : 136;
    reasons.push(relPath.includes("/") ? "component README" : "root README");
  }
  return score;
}
