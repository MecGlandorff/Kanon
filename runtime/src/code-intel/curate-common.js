import { selectRootReadme } from "../readme.js";
import {
  depth,
  observeRanking
} from "./shared.js";

/** @typedef {import("./shared.js").RankedFile} RankedFile */

/**
 * @param {RankedFile[]} selected
 * @param {RankedFile | null | undefined} item
 * @param {string} reason
 * @param {string | null} [heuristic]
 * @returns {"selected" | "duplicate" | "absent"}
 */
export function add(selected, item, reason, heuristic = null) {
  if (!item) {
    return "absent";
  }
  if (selected.some((candidate) => candidate.path === item.path)) {
    return "duplicate";
  }
  selected.push({
    ...item,
    recommended: true,
    selection_reason: reason,
    selection_heuristic: heuristic
  });
  return "selected";
}

/**
 * @param {RankedFile[]} ranked
 * @param {string} relPath
 * @returns {RankedFile | null}
 */
export function byPath(ranked, relPath) {
  return ranked.find((item) => item.path === relPath) || null;
}

/**
 * @param {RankedFile[]} ranked
 * @param {RegExp} pattern
 * @param {{
 *   exclude?: RegExp,
 *   compare?: (left: RankedFile, right: RankedFile) => number
 * }} [options]
 * @returns {RankedFile | null}
 */
export function byPattern(ranked, pattern, options = {}) {
  return ranked
    .filter((item) => pattern.test(item.path))
    .filter((item) => !options.exclude?.test(item.path))
    .sort(options.compare || compareScore)[0] || null;
}

/**
 * @param {RankedFile[]} ranked
 * @param {RegExp} pattern
 * @param {{
 *   exclude?: RegExp,
 *   compare?: (left: RankedFile, right: RankedFile) => number
 * }} [options]
 * @returns {RankedFile[]}
 */
export function allByPattern(ranked, pattern, options = {}) {
  return ranked
    .filter((item) => pattern.test(item.path))
    .filter((item) => !options.exclude?.test(item.path))
    .sort(options.compare || compareScore);
}

/**
 * @param {RankedFile[]} ranked
 * @returns {RankedFile | null}
 */
export function rootReadme(ranked) {
  return selectRootReadme(ranked);
}

/**
 * @param {RankedFile[]} ranked
 * @param {string} relPath
 * @returns {boolean}
 */
export function hasPath(ranked, relPath) {
  return ranked.some((item) => item.path === relPath);
}

/**
 * @param {RankedFile} a
 * @param {RankedFile} b
 * @returns {number}
 */
export function shortestPath(a, b) {
  return (
    depth(a.path) - depth(b.path) ||
    a.path.length - b.path.length ||
    a.path.localeCompare(b.path)
  );
}

/**
 * @param {RankedFile} a
 * @param {RankedFile} b
 * @returns {number}
 */
export function compareScore(a, b) {
  return (
    b.score - a.score ||
    b.fan_in - a.fan_in ||
    shortestPath(a, b)
  );
}

/**
 * @param {RankedFile[]} selected
 * @param {RankedFile[]} ranked
 * @param {number} [limit]
 * @param {import("./shared.js").RankingObserver} [observer]
 * @param {{name: string, ordinal: number}} [stage]
 * @returns {RankedFile[]}
 */
export function finish(
  selected,
  ranked,
  limit = 5,
  observer,
  stage = { name: "final-cap", ordinal: 1 }
) {
  const recommended = selected.slice(0, limit);
  const chosen = new Set(recommended.map((item) => item.path));
  const output = [
    ...recommended,
    ...ranked
      .filter((item) => !chosen.has(item.path))
      .map((item) => ({ ...item, recommended: false }))
  ];
  if (typeof observer !== "function") {
    return output;
  }
  const selectedPositions = new Map(
    selected.map((item, index) => [item.path, index])
  );
  const boundary = recommended.at(-1)?.path || null;
  for (const [rankedIndex, item] of ranked.entries()) {
    const selectedIndex = selectedPositions.get(item.path) ?? -1;
    const isSelected =
      selectedIndex >= 0 && selectedIndex < limit;
    const capExcluded = selectedIndex >= limit;
    if (capExcluded) {
      observeRanking(observer, {
        type: "curation-decision",
        path: item.path,
        stage: stage.name,
        stage_ordinal: stage.ordinal,
        entry_position: selectedIndex + 1,
        selected_count_on_entry: selected.length,
        decision: "cap-excluded",
        reason: `outside final ${limit}-item cap`,
        heuristic: item.selection_heuristic || null,
        deduplicated: false,
        displaced_by: boundary,
        quota: null,
        cap: limit
      });
    }
    observeRanking(observer, {
      type: "candidate-finalized",
      path: item.path,
      ranked_position: rankedIndex + 1,
      selected: isSelected,
      final_rank: isSelected ? selectedIndex + 1 : null,
      result: isSelected
        ? "selected"
        : capExcluded
          ? "cap-excluded"
          : "not-selected",
      selection_reason:
        selectedIndex >= 0
          ? selected[selectedIndex]?.selection_reason || null
          : null,
      selection_heuristic:
        selectedIndex >= 0
          ? selected[selectedIndex]?.selection_heuristic || null
          : null
    });
  }
  return output;
}

/**
 * @param {RankedFile[]} ranked
 * @returns {RankedFile[]}
 */
export function primaryEntrypoints(ranked) {
  return ranked
    .filter((item) =>
      item.signals.some((signal) => signal.type === "entrypoint")
    )
    .sort((a, b) => {
      const aKnown = a.signals.some(
        (signal) =>
          signal.type === "entrypoint" &&
          signal.confidence === "known"
      );
      const bKnown = b.signals.some(
        (signal) =>
          signal.type === "entrypoint" &&
          signal.confidence === "known"
      );
      const aDeclared = a.signals.some((signal) =>
        signal.reason.startsWith("declared ")
      );
      const bDeclared = b.signals.some((signal) =>
        signal.reason.startsWith("declared ")
      );
      return (
        Number(bDeclared) - Number(aDeclared) ||
        Number(bKnown) - Number(aKnown) ||
        b.score - a.score ||
        shortestPath(a, b)
      );
    });
}

/**
 * @param {RankedFile[]} ranked
 * @returns {RankedFile[]}
 */
export function directDeclarations(ranked) {
  return ranked
    .filter((item) =>
      item.signals.some((signal) => signal.type === "declaration")
    )
    .sort((a, b) =>
      b.score - a.score ||
      b.fan_in - a.fan_in ||
      shortestPath(a, b)
    );
}
