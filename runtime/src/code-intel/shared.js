import path from "node:path";
import { readText } from "../scanner.js";

/**
 * @typedef {{
 *   type: string,
 *   reason: string,
 *   score: number,
 *   confidence?: "known" | "likely" | "unknown",
 *   source?: string
 * }} CodeSignal
 * @typedef {{
 *   path: string,
 *   score: number,
 *   fan_in: number,
 *   referenced_by: number,
 *   signals: CodeSignal[],
 *   reasons: string[],
 *   recommended?: boolean,
 *   selection_reason?: string,
 *   selection_heuristic?: string | null
 * }} RankedFile
 * @typedef {(event: Record<string, unknown>) => void} RankingObserver
 * @typedef {Map<string, string> & {
 *   readOptions: NonNullable<Parameters<typeof readText>[2]>,
 *   maxEntries: number,
 *   maxBytes: number,
 *   bytes: number
 * }} TextCache
 * @typedef {{path: string}} FilePath
 */

/**
 * Deliver a private, observational ranking event without exposing a return
 * channel or allowing observer failure to affect product behavior. Callers
 * construct event values from detached primitives and arrays.
 *
 * @param {RankingObserver | null | undefined} observer
 * @param {Record<string, unknown>} event
 * @returns {void}
 */
export function observeRanking(observer, event) {
  if (typeof observer !== "function") {
    return;
  }
  try {
    observer(event);
  } catch {
    // Evaluation observation is deliberately fail-open and non-behavioral.
  }
}

/**
 * @param {NonNullable<Parameters<typeof readText>[2]>} [readOptions]
 * @param {{maxEntries?: number, maxBytes?: number}} [options]
 * @returns {TextCache}
 */
export function createTextCache(readOptions = {}, options = {}) {
  /** @type {Map<string, string>} */
  const cache = new Map();
  return Object.assign(cache, {
    readOptions,
    maxEntries: boundedPositiveInteger(options.maxEntries, 16, 256),
    maxBytes: boundedPositiveInteger(
      options.maxBytes,
      2 * 1024 * 1024,
      16 * 1024 * 1024
    ),
    bytes: 0
  });
}

/**
 * @param {string} root
 * @param {string} relPath
 * @param {TextCache} cache
 * @param {number} [limit]
 * @returns {string}
 */
export function getText(root, relPath, cache, limit = 240_000) {
  if (!cache.has(relPath)) {
    const text = readText(root, relPath, {
      ...(cache.readOptions || {}),
      limit,
      recordTruncation: false
    });
    cache.set(relPath, text);
    cache.bytes = (cache.bytes || 0) + Buffer.byteLength(text);
    evictTextCache(cache, relPath);
  }
  return cache.get(relPath) ?? "";
}

/**
 * @param {Map<string, Set<string>>} map
 * @param {string} target
 * @param {string} source
 * @returns {void}
 */
export function addInbound(map, target, source) {
  if (target === source) {
    return;
  }
  if (!map.has(target)) {
    map.set(target, new Set());
  }
  map.get(target)?.add(source);
}

/**
 * @param {Map<string, CodeSignal[]>} map
 * @param {string} target
 * @param {CodeSignal} signal
 * @returns {void}
 */
export function addSignal(map, target, signal) {
  if (!map.has(target)) {
    map.set(target, []);
  }
  const existing = map.get(target);
  if (
    existing &&
    !existing.some(
      (item) =>
        item.type === signal.type &&
        item.reason === signal.reason
    )
  ) {
    existing.push(signal);
  }
}

/**
 * @param {string} text
 * @param {Map<string, FilePath>} fileMap
 * @returns {string[]}
 */
export function parseCargoBinPaths(text, fileMap) {
  /** @type {string[]} */
  const paths = [];
  for (const match of text.matchAll(
    /\[\[bin\]\][\s\S]*?path\s*=\s*["']([^"']+)["']/g
  )) {
    if (match[1]) {
      paths.push(match[1]);
    }
  }
  if (fileMap.has("src/main.rs")) {
    paths.push("src/main.rs");
  }
  for (const filePath of fileMap.keys()) {
    if (/^src\/bin\/[^/]+\/main\.rs$/.test(filePath)) {
      paths.push(filePath);
    }
  }
  return unique(paths.filter((target) => fileMap.has(target)));
}

/**
 * @param {string} text
 * @returns {Set<string>}
 */
export function parseBuildTargets(text) {
  /** @type {Set<string>} */
  const targets = new Set();
  for (const match of text.matchAll(
    /^([A-Za-z0-9_.-]+)\s*(?::[^=]|:=)/gm
  )) {
    if (match[1]) {
      targets.add(match[1]);
    }
  }
  return targets;
}

/**
 * @param {string} text
 * @param {string} name
 * @returns {string}
 */
export function tomlSection(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^\\[${escaped}\\]\\s*$`, "m");
  const match = heading.exec(text);
  if (!match) {
    return "";
  }
  const rest = text.slice(match.index + match[0].length);
  const nextSection = rest.search(/^\[/m);
  return nextSection === -1 ? rest : rest.slice(0, nextSection);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRelPath(value) {
  const normalized = path.posix.normalize(String(value || "").replaceAll("\\", "/"));
  return normalized === "." ? "." : normalized.replace(/^(\.\/)+/, "");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCwd(value) {
  const normalized = normalizeRelPath(String(value || ".").replace(/\/$/, ""));
  return !normalized || normalized === "." ? "." : normalized;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeShellCommand(value) {
  return String(value || "")
    .trim()
    .replace(/\s+#.*$/, "")
    .replace(/\s+/g, " ")
    .replace(/;$/, "");
}

/**
 * @param {string} relPath
 * @returns {number}
 */
export function depth(relPath) {
  return relPath.split("/").length - 1;
}

/**
 * @template T
 * @param {T[]} values
 * @returns {T[]}
 */
export function unique(values) {
  return Array.from(new Set(values));
}

/**
 * @param {TextCache} cache
 * @param {string} retainedKey
 * @returns {void}
 */
function evictTextCache(cache, retainedKey) {
  while (
    cache.size > (cache.maxEntries ?? 16) ||
    cache.bytes > (cache.maxBytes ?? 2 * 1024 * 1024)
  ) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined || (oldest === retainedKey && cache.size === 1)) {
      break;
    }
    const text = cache.get(oldest) || "";
    cache.delete(oldest);
    cache.bytes -= Buffer.byteLength(text);
  }
}

/**
 * @param {number | undefined} value
 * @param {number} fallback
 * @param {number} maximum
 * @returns {number}
 */
function boundedPositiveInteger(value, fallback, maximum) {
  return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= maximum
    ? value
    : fallback;
}
