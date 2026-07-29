import path from "node:path";
import {
  GENERATED_FILE,
  LOW_VALUE_PATH
} from "./constants.js";
import { curateRankedFiles } from "./curate.js";
import {
  depth,
  observeRanking,
  unique
} from "./shared.js";

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
 * @param {{
 *   packageJson?: unknown,
 *   goModule?: string | null,
 *   observer?: import("./shared.js").RankingObserver
 * }} [context]
 * @returns {RankedFile[]}
 */
export function rankImportantFiles(files, intel, context = {}) {
  /** @type {RankedFile[]} */
  const ranked = [];
  const tracing = typeof context.observer === "function";
  let inputIndex = 0;
  for (const file of files) {
    inputIndex += 1;
    const eligibilityReason = !file.text
      ? "non-text-file"
      : GENERATED_FILE.test(file.path)
        ? "generated-file"
        : /\.map$/.test(file.path)
          ? "source-map"
          : "ranking-eligible";
    const eligible = eligibilityReason === "ranking-eligible";
    if (tracing) {
      observeRanking(context.observer, {
        type: "candidate-discovered",
        path: file.path,
        discovery_source: "scanner",
        input_position: inputIndex,
        eligible,
        eligibility_reason: eligibilityReason
      });
    }
    if (!eligible) {
      continue;
    }
    /** @type {string[]} */
    const reasons = [];
    /** @type {{name: string, value: number}[] | null} */
    const contributions = tracing ? [] : null;
    const signals = intel.signals.get(file.path) || [];
    const fanIn = intel.importers.get(file.path)?.size || 0;
    const referenceCount = intel.references.get(file.path)?.size || 0;
    let score = baseImportance(file.path, reasons);
    if (score !== 0) {
      contributions?.push({ name: "base-importance", value: score });
    }

    for (const signal of signals) {
      score += signal.score;
      reasons.push(signal.reason);
      contributions?.push({
        name: `signal:${signal.type}`,
        value: signal.score
      });
    }
    if (fanIn > 0) {
      const contribution =
        Math.min(135, Math.round(24 * Math.log2(fanIn + 1)));
      score += contribution;
      contributions?.push({
        name: "local-import-fan-in",
        value: contribution
      });
      reasons.push(`imported by ${fanIn} local file${fanIn === 1 ? "" : "s"}`);
    }
    if (referenceCount > 0) {
      const contribution = Math.min(60, 12 * referenceCount);
      score += contribution;
      contributions?.push({
        name: "literal-local-reference",
        value: contribution
      });
      reasons.push(`referenced by ${referenceCount} local file${referenceCount === 1 ? "" : "s"}`);
    }
    if (LOW_VALUE_PATH.test(file.path)) {
      score -= 85;
      contributions?.push({ name: "low-value-path", value: -85 });
    }
    if (/^\.github\/workflows\//.test(file.path)) {
      score -= 120;
      contributions?.push({ name: "workflow-path", value: -120 });
    }
    if (/(^|\/)(tests?|__tests__)\//.test(file.path)) {
      score -= 18;
      contributions?.push({ name: "test-path", value: -18 });
    }
    const depthPenalty = -Math.min(30, depth(file.path) * 4);
    score += depthPenalty;
    if (depthPenalty !== 0) {
      contributions?.push({ name: "path-depth", value: depthPenalty });
    }
    ranked.push({
      path: file.path,
      score,
      fan_in: fanIn,
      referenced_by: referenceCount,
      signals,
      reasons: unique(reasons)
    });
    if (tracing) {
      observeRanking(context.observer, {
        type: "candidate-scored",
        path: file.path,
        score,
        fan_in: fanIn,
        referenced_by: referenceCount,
        signals: signals.map((signal) => ({
          type: signal.type,
          reason: signal.reason,
          score: signal.score,
          confidence: signal.confidence || "unavailable",
          source: signal.source || "unavailable"
        })),
        contributions: contributions?.map((item) => ({ ...item })) || [],
        tie_break: {
          score,
          fan_in: fanIn,
          path: file.path
        }
      });
    }
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.fan_in - a.fan_in ||
      a.path.localeCompare(b.path)
  );
  if (tracing) {
    for (const [rankedIndex, item] of ranked.entries()) {
      observeRanking(context.observer, {
        type: "candidate-ordered",
        path: item.path,
        ranked_position: rankedIndex + 1,
        ordering: ["score:desc", "fan_in:desc", "path:asc"]
      });
    }
  }
  return curateRankedFiles(ranked, {
    ...(context.goModule === undefined
      ? {}
      : { goModule: context.goModule }),
    ...(context.observer === undefined
      ? {}
      : { observer: context.observer })
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
