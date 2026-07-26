import path from "node:path";

export function add(selected, item, reason) {
  if (!item || selected.some((candidate) => candidate.path === item.path)) {
    return;
  }
  selected.push({
    ...item,
    recommended: true,
    selection_reason: reason
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
  return ranked.find(
    (item) =>
      !item.path.includes("/") &&
      /^readme(?:\.[^.]+)?$/i.test(item.path)
  ) || null;
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
    .filter((item) => entrypointPriority(item) > 0)
    .sort((a, b) => entrypointPriority(b) - entrypointPriority(a));
}

function entrypointPriority(item) {
  const relPath = item.path;
  if (
    item.signals.some((signal) =>
      /declared (?:package|Cargo) binary/.test(signal.reason)
    )
  ) {
    return 200;
  }
  if (path.posix.basename(relPath) === "manage.py") {
    return 190;
  }
  if (/^(?:src\/)?main\.(?:rs|go)$/.test(relPath)) {
    return 180;
  }
  if (/^cmd\/[^/]+\/main\.go$/.test(relPath)) {
    const command = path.posix.basename(path.posix.dirname(relPath));
    return 170 - command.length;
  }
  if (/^src\/bin\/[^/]+\/main\.rs$/.test(relPath)) {
    return 170;
  }
  if (/^crates\/(?:core|[^/]+)\/main\.rs$/.test(relPath)) {
    return /\/core\//.test(relPath) ? 165 : 130;
  }
  if (/(^|\/)bin\.[cm]?[jt]s$/.test(relPath)) {
    return 160;
  }
  return 0;
}

function depth(relPath) {
  return relPath.split("/").length - 1;
}
