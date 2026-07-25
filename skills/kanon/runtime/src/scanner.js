import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".kanon",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".tox"
]);

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".css",
  ".csv",
  ".go",
  ".h",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".lock",
  ".mjs",
  ".php",
  ".properties",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svelte",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml"
]);

const TEXT_NAMES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".gitignore",
  "Dockerfile",
  "LICENSE",
  "Makefile",
  "Procfile",
  "README",
  "requirements.txt"
]);

const SAFE_ENV_FILES = new Set([".env.example", ".env.sample", ".env.template"]);
const SENSITIVE_NAMES = new Set([
  ".npmrc",
  ".pypirc",
  "auth.json",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "secrets.json"
]);

export function scanRepo(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const maxFiles = options.maxFiles ?? 2000;
  const maxFileBytes = options.maxFileBytes ?? 750_000;
  const files = [];
  const diagnostics = {
    complete: true,
    strategy: "filesystem",
    max_files: maxFiles,
    max_file_bytes: maxFileBytes,
    truncated: false,
    unreadable_entries: 0,
    ignored_directories: 0,
    kanon_ignored_entries: 0,
    sensitive_files_skipped: 0,
    symlinks_skipped: 0
  };
  const kanonIgnoreRules = loadKanonIgnore(resolvedRoot);

  const gitFiles = options.useGitIgnore === false ? null : listGitVisibleFiles(resolvedRoot);
  if (gitFiles) {
    diagnostics.strategy = "git";
    for (const relPath of gitFiles) {
      if (isKanonIgnored(relPath, false, kanonIgnoreRules)) {
        diagnostics.kanon_ignored_entries += 1;
        continue;
      }
      if (shouldIgnorePath(relPath)) {
        diagnostics.ignored_directories += 1;
        continue;
      }
      if (!addFile(relPath)) {
        break;
      }
    }
  } else {
    walk(resolvedRoot, "");
  }

  diagnostics.complete = !diagnostics.truncated && diagnostics.unreadable_entries === 0;
  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    root: resolvedRoot,
    files,
    fingerprints: files.map((file) => ({
      path: file.path,
      size: file.size,
      sha256: file.sha256
    })),
    diagnostics
  };

  function walk(absDir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      diagnostics.unreadable_entries += 1;
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(absDir, entry.name);

      if (entry.isSymbolicLink()) {
        diagnostics.symlinks_skipped += 1;
        continue;
      }

      if (entry.isDirectory()) {
        if (isKanonIgnored(rel, true, kanonIgnoreRules)) {
          diagnostics.kanon_ignored_entries += 1;
        } else if (IGNORED_DIRS.has(entry.name)) {
          diagnostics.ignored_directories += 1;
        } else {
          walk(abs, rel);
        }
        if (diagnostics.truncated) {
          return;
        }
        continue;
      }

      if (entry.isFile() && !addFile(rel)) {
        return;
      }
    }
  }

  function addFile(relPath) {
    if (isKanonIgnored(relPath, false, kanonIgnoreRules)) {
      diagnostics.kanon_ignored_entries += 1;
      return true;
    }
    if (isSensitivePath(relPath)) {
      diagnostics.sensitive_files_skipped += 1;
      return true;
    }

    if (files.length >= maxFiles) {
      diagnostics.truncated = true;
      return false;
    }

    const abs = safeResolve(resolvedRoot, relPath);
    if (!abs) {
      diagnostics.unreadable_entries += 1;
      return true;
    }

    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch {
      diagnostics.unreadable_entries += 1;
      return true;
    }

    if (stat.isSymbolicLink()) {
      diagnostics.symlinks_skipped += 1;
      return true;
    }
    if (!stat.isFile()) {
      return true;
    }

    const basename = path.basename(relPath);
    files.push({
      path: relPath.replaceAll("\\", "/"),
      basename,
      extension: path.extname(basename).toLowerCase(),
      size: stat.size,
      text: isTextFile(relPath, basename),
      sha256: hashFile(abs, stat.size, maxFileBytes)
    });
    return true;
  }
}

export function readText(root, relPath, options = {}) {
  const limit = options.limit ?? 300_000;
  if (isSensitivePath(relPath)) {
    return "";
  }

  const abs = safeResolve(root, relPath);
  if (!abs) {
    return "";
  }

  let fd;
  try {
    const stat = fs.lstatSync(abs);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return "";
    }
    if (stat.size > limit) {
      fd = fs.openSync(abs, "r");
      const buffer = Buffer.alloc(limit);
      const bytes = fs.readSync(fd, buffer, 0, limit, 0);
      return buffer.subarray(0, bytes).toString("utf8");
    }

    return fs.readFileSync(abs, "utf8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

export function fileExists(files, relPath) {
  return files.some((file) => file.path === normalizeRelPath(relPath));
}

export function findFirst(files, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return files.find((file) => wanted.has(file.basename.toLowerCase()));
}

export function findByPath(files, relPath) {
  const normalized = normalizeRelPath(relPath);
  return files.find((file) => file.path === normalized);
}

export function findTextReferences(root, files, term, options = {}) {
  return findTextHits(root, files, [term], options).map((hit) => hit.path);
}

export function findTextHits(root, files, terms, options = {}) {
  const exclude = new Set((options.exclude || []).map(normalizeRelPath));
  const normalizedTerms = Array.from(
    new Set((terms || []).map((term) => String(term).trim().toLowerCase()).filter(Boolean))
  );
  const matches = [];
  if (!normalizedTerms.length) {
    return matches;
  }

  for (const file of files) {
    if (!file.text || exclude.has(file.path)) {
      continue;
    }

    const text = readText(root, file.path, { limit: options.readLimit ?? 120_000 });
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const lower = lines[index].toLowerCase();
      const matchedTerm = normalizedTerms.find((term) => lower.includes(term));
      if (!matchedTerm) {
        continue;
      }
      matches.push({
        path: file.path,
        line: index + 1,
        matched_term: matchedTerm,
        excerpt: normalizeExcerpt(lines[index])
      });
      break;
    }

    if (matches.length >= (options.limit ?? 12)) {
      break;
    }
  }

  return matches;
}

export function isSensitivePath(relPath) {
  const normalized = normalizeRelPath(relPath);
  const basename = path.posix.basename(normalized).toLowerCase();
  if (SAFE_ENV_FILES.has(basename)) {
    return false;
  }
  if (basename === ".env" || basename.startsWith(".env.")) {
    return true;
  }
  if (SENSITIVE_NAMES.has(basename)) {
    return true;
  }
  return (
    /\.(key|pem|p12|pfx)$/i.test(basename) ||
    /(^|[-_.])(credential|credentials|secret|secrets)([-_.]|$)/i.test(basename)
  );
}

function listGitVisibleFiles(root) {
  const result = spawnSync(
    "git",
    ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true }
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

function loadKanonIgnore(root) {
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

function isKanonIgnored(relPath, directory, rules) {
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

function shouldIgnorePath(relPath) {
  return normalizeRelPath(relPath)
    .split("/")
    .some((part) => IGNORED_DIRS.has(part));
}

function safeResolve(root, relPath) {
  const resolvedRoot = path.resolve(root);
  const abs = path.resolve(resolvedRoot, relPath);
  if (abs === resolvedRoot || abs.startsWith(`${resolvedRoot}${path.sep}`)) {
    return abs;
  }
  return null;
}

function normalizeRelPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function isTextFile(rel, basename) {
  if (TEXT_NAMES.has(basename)) {
    return true;
  }

  if (basename.toLowerCase().startsWith("readme")) {
    return true;
  }

  return TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase());
}

function hashFile(abs, size, maxFileBytes) {
  try {
    if (size > maxFileBytes) {
      return null;
    }

    return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  } catch {
    return null;
  }
}

function normalizeExcerpt(value, limit = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
