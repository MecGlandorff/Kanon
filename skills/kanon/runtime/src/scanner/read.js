import fs from "node:fs";
import { isSensitivePath } from "./policy.js";
import {
  normalizeExcerpt,
  normalizeRelPath,
  safeResolve
} from "./shared.js";

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
    new Set(
      (terms || [])
        .map((term) => String(term).trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const matches = [];
  if (!normalizedTerms.length) {
    return matches;
  }

  for (const file of files) {
    if (!file.text || exclude.has(file.path)) {
      continue;
    }

    const text = readText(root, file.path, {
      limit: options.readLimit ?? 120_000
    });
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
