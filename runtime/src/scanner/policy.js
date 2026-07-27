import path from "node:path";
import { normalizeRelPath } from "./shared.js";

export const IGNORED_DIRS = new Set([
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
  ".cjs",
  ".cfg",
  ".conf",
  ".cts",
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
  ".mdx",
  ".mts",
  ".php",
  ".properties",
  ".py",
  ".rb",
  ".rs",
  ".rst",
  ".sh",
  ".sql",
  ".svelte",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".adoc",
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
  "go.mod",
  "Justfile",
  "justfile",
  "requirements.txt"
]);

const SAFE_ENV_FILES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template"
]);
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

export function isTextFile(rel, basename) {
  if (TEXT_NAMES.has(basename)) {
    return true;
  }
  if (basename.toLowerCase().startsWith("readme")) {
    return true;
  }
  return TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase());
}
