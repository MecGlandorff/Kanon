import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  ".md",
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
  ".gitignore",
  "Dockerfile",
  "LICENSE",
  "Makefile",
  "Procfile",
  "README",
  "requirements.txt"
]);

export function scanRepo(root, options = {}) {
  const maxFiles = options.maxFiles ?? 2000;
  const maxFileBytes = options.maxFileBytes ?? 750_000;
  const files = [];

  walk(root, "");

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    root,
    files,
    fingerprints: files.map((file) => ({
      path: file.path,
      size: file.size,
      sha256: file.sha256
    }))
  };

  function walk(absDir, relDir) {
    if (files.length >= maxFiles) {
      return;
    }

    let entries = [];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        break;
      }

      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(absDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(abs, rel);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }

      files.push({
        path: rel,
        basename: entry.name,
        extension: path.extname(entry.name).toLowerCase(),
        size: stat.size,
        text: isTextFile(rel, entry.name),
        sha256: hashFile(abs, stat.size, maxFileBytes)
      });
    }
  }
}

export function readText(root, relPath, options = {}) {
  const limit = options.limit ?? 300_000;
  const abs = path.join(root, relPath);

  try {
    const stat = fs.statSync(abs);
    if (stat.size > limit) {
      const fd = fs.openSync(abs, "r");
      const buffer = Buffer.alloc(limit);
      const bytes = fs.readSync(fd, buffer, 0, limit, 0);
      fs.closeSync(fd);
      return buffer.subarray(0, bytes).toString("utf8");
    }

    return fs.readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

export function fileExists(files, relPath) {
  return files.some((file) => file.path === relPath);
}

export function findFirst(files, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return files.find((file) => wanted.has(file.basename.toLowerCase()));
}

export function findByPath(files, relPath) {
  return files.find((file) => file.path === relPath);
}

export function findTextReferences(root, files, term, options = {}) {
  const exclude = new Set(options.exclude || []);
  const normalized = String(term).toLowerCase();
  const matches = [];

  for (const file of files) {
    if (!file.text || exclude.has(file.path)) {
      continue;
    }

    const haystack = readText(root, file.path, { limit: 80_000 }).toLowerCase();
    if (haystack.includes(normalized)) {
      matches.push(file.path);
    }

    if (matches.length >= (options.limit ?? 12)) {
      break;
    }
  }

  return matches;
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
