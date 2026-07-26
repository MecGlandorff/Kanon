import path from "node:path";
import { readText } from "../scanner.js";

export function createTextCache(readOptions = {}, options = {}) {
  const cache = new Map();
  cache.readOptions = readOptions;
  cache.maxEntries = options.maxEntries ?? 16;
  cache.maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  cache.bytes = 0;
  return cache;
}

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
  return cache.get(relPath);
}

export function addInbound(map, target, source) {
  if (target === source) {
    return;
  }
  if (!map.has(target)) {
    map.set(target, new Set());
  }
  map.get(target).add(source);
}

export function addSignal(map, target, signal) {
  if (!map.has(target)) {
    map.set(target, []);
  }
  const existing = map.get(target);
  if (!existing.some((item) => item.type === signal.type && item.reason === signal.reason)) {
    existing.push(signal);
  }
}

export function parseCargoBinPaths(text, fileMap) {
  const paths = Array.from(
    text.matchAll(/\[\[bin\]\][\s\S]*?path\s*=\s*["']([^"']+)["']/g),
    (match) => match[1]
  );
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

export function parseBuildTargets(text) {
  return new Set(
    Array.from(
      text.matchAll(/^([A-Za-z0-9_.-]+)\s*(?::[^=]|:=)/gm),
      (match) => match[1]
    )
  );
}

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

export function normalizeRelPath(value) {
  const normalized = path.posix.normalize(String(value || "").replaceAll("\\", "/"));
  return normalized === "." ? "." : normalized.replace(/^(\.\/)+/, "");
}

export function normalizeCwd(value) {
  const normalized = normalizeRelPath(String(value || ".").replace(/\/$/, ""));
  return !normalized || normalized === "." ? "." : normalized;
}

export function normalizeShellCommand(value) {
  return String(value || "")
    .trim()
    .replace(/\s+#.*$/, "")
    .replace(/\s+/g, " ")
    .replace(/;$/, "");
}

export function depth(relPath) {
  return relPath.split("/").length - 1;
}

export function unique(values) {
  return Array.from(new Set(values));
}

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
