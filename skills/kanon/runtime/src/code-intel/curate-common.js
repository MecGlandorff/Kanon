import { selectRootReadme } from "../readme.js";
import { depth } from "./shared.js";

export function add(selected, item, reason, heuristic = null) {
  if (!item || selected.some((candidate) => candidate.path === item.path)) {
    return;
  }
  selected.push({
    ...item,
    recommended: true,
    selection_reason: reason,
    selection_heuristic: heuristic
  });
}

export function byPath(ranked, relPath) {
  return ranked.find((item) => item.path === relPath) || null;
}

export function byPattern(ranked, pattern, options = {}) {
  return ranked
    .filter((item) => pattern.test(item.path))
    .filter((item) => !options.exclude?.test(item.path))
    .sort(options.compare || compareScore)[0] || null;
}

export function allByPattern(ranked, pattern, options = {}) {
  return ranked
    .filter((item) => pattern.test(item.path))
    .filter((item) => !options.exclude?.test(item.path))
    .sort(options.compare || compareScore);
}

export function rootReadme(ranked) {
  return selectRootReadme(ranked);
}

export function hasPath(ranked, relPath) {
  return ranked.some((item) => item.path === relPath);
}

export function shortestPath(a, b) {
  return (
    depth(a.path) - depth(b.path) ||
    a.path.length - b.path.length ||
    a.path.localeCompare(b.path)
  );
}

export function compareScore(a, b) {
  return (
    b.score - a.score ||
    b.fan_in - a.fan_in ||
    shortestPath(a, b)
  );
}

export function finish(selected, ranked, limit = 5) {
  const recommended = selected.slice(0, limit);
  const chosen = new Set(recommended.map((item) => item.path));
  return [
    ...recommended,
    ...ranked
      .filter((item) => !chosen.has(item.path))
      .map((item) => ({ ...item, recommended: false }))
  ];
}

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
