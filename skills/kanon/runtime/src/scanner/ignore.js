import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { IGNORED_DIRS } from "./policy.js";
import { normalizeRelPath } from "./shared.js";

export function listGitVisibleFiles(root) {
  const result = spawnSync(
    "git",
    ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    }
  );
  if (result.status !== 0) {
    return null;
  }
  return Array.from(
    new Set(
      result.stdout
        .split("\0")
        .map(normalizeRelPath)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export function loadKanonIgnore(root) {
  try {
    return fs
      .readFileSync(path.join(root, ".kanonignore"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(compileIgnoreRule)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function isKanonIgnored(relPath, directory, rules) {
  const normalized = normalizeRelPath(relPath).replace(/\/+$/, "");
  let ignored = false;
  for (const rule of rules) {
    const candidate = directory ? `${normalized}/` : normalized;
    if (rule.regex.test(candidate) || rule.regex.test(normalized)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export function shouldIgnorePath(relPath) {
  return normalizeRelPath(relPath)
    .split("/")
    .some((part) => IGNORED_DIRS.has(part));
}

function compileIgnoreRule(rawRule) {
  const negated = rawRule.startsWith("!");
  let pattern = negated ? rawRule.slice(1) : rawRule;
  const directory = pattern.endsWith("/");
  const anchored = pattern.startsWith("/") || pattern.includes("/");
  pattern = pattern.replace(/^\/+|\/+$/g, "");
  if (!pattern) {
    return null;
  }

  const glob = globToRegex(pattern);
  const source = anchored
    ? `^${glob}${directory ? "(?:/.*)?$" : "$"}`
    : `(?:^|/)${glob}${directory ? "(?:/.*)?$" : "$"}`;
  return { negated, regex: new RegExp(source) };
}

function globToRegex(pattern) {
  let output = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      output += ".*";
      index += 1;
    } else if (char === "*") {
      output += "[^/]*";
    } else if (char === "?") {
      output += "[^/]";
    } else {
      output += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return output;
}
