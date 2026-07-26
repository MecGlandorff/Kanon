import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function safeResolve(root, relPath) {
  const resolvedRoot = path.resolve(root);
  const abs = path.resolve(resolvedRoot, relPath);
  if (abs === resolvedRoot || abs.startsWith(`${resolvedRoot}${path.sep}`)) {
    return abs;
  }
  return null;
}

export function normalizeRelPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

export function hashFile(abs, size, maxFileBytes) {
  try {
    if (size > maxFileBytes) {
      return null;
    }
    return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  } catch {
    return null;
  }
}

export function normalizeExcerpt(value, limit = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
