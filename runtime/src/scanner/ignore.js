import { runGit } from "../git-runner.js";
import { IGNORED_DIRS } from "./policy.js";
import { readTextResult } from "./read.js";
import { normalizeRelPath } from "./shared.js";

/**
 * @typedef {{
 *   negated: boolean,
 *   regex: RegExp
 * }} IgnoreRule
 */

/**
 * @param {string} root
 * @param {{timeoutMs?: number, maxOutputBytes?: number}} [options]
 */
export function listGitVisibleFiles(root, options = {}) {
  const result = runGit(
    root,
    ["ls-files", "-co", "--exclude-standard", "-z"],
    {
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
      ...(options.maxOutputBytes === undefined
        ? {}
        : { maxOutputBytes: options.maxOutputBytes })
    }
  );
  if (!result.ok) {
    return {
      ok: false,
      files: [],
      diagnostic: result.diagnostic,
      git: result
    };
  }
  return {
    ok: true,
    files: Array.from(
      new Set(
        result.stdout
          .split("\0")
          .map(normalizeRelPath)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b)),
    diagnostic: null,
    git: result
  };
}

/**
 * @param {string} root
 * @param {{
 *   maxBytes?: number,
 *   diagnostics?: import("./read.js").ReadDiagnostics
 * }} [options]
 * @returns {IgnoreRule[]}
 */
export function loadKanonIgnore(root, options = {}) {
  const result = readTextResult(root, ".kanonignore", {
    limit: options.maxBytes ?? 128 * 1024,
    budgetName: "max_ignore_bytes",
    ...(options.diagnostics === undefined
      ? {}
      : { diagnostics: options.diagnostics }),
    optional: true
  });
  if (!result.ok) {
    return [];
  }
  return result.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(compileIgnoreRule)
      .filter((rule) => rule !== null);
}

/**
 * @param {unknown} relPath
 * @param {boolean} directory
 * @param {IgnoreRule[]} rules
 * @returns {boolean}
 */
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

/**
 * @param {unknown} relPath
 * @returns {boolean}
 */
export function shouldIgnorePath(relPath) {
  return normalizeRelPath(relPath)
    .split("/")
    .some((part) => IGNORED_DIRS.has(part));
}

/**
 * @param {string} rawRule
 * @returns {IgnoreRule | null}
 */
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

/**
 * @param {string} pattern
 * @returns {string}
 */
function globToRegex(pattern) {
  let output = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === undefined) {
      continue;
    }
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
