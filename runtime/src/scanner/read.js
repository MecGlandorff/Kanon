import fs from "node:fs";
import { isSensitivePath } from "./policy.js";
import {
  normalizeExcerpt,
  normalizeRelPath,
  resolveContainedPath
} from "./shared.js";

export function readText(root, relPath, options = {}) {
  const result = readTextResult(root, relPath, options);
  return result.ok ? result.text : "";
}

export function readTextResult(root, relPath, options = {}) {
  const limit = boundedReadLimit(options.limit);
  if (isSensitivePath(relPath)) {
    return recordFailure(options.diagnostics, {
      ok: false,
      status: "rejected",
      relativePath: normalizeRelPath(relPath),
      reason: "Likely secret-bearing files are excluded from reads.",
      code: "SENSITIVE_PATH_REJECTED"
    });
  }

  const resolved = resolveContainedPath(root, relPath, { type: "file" });
  if (!resolved.ok) {
    if (resolved.status === "missing" && options.optional) {
      return resolved;
    }
    return recordFailure(options.diagnostics, resolved);
  }

  const budget = options.budget;
  const remaining = budget
    ? Math.max(0, budget.maxBytes - budget.bytesRead)
    : limit;
  if (remaining === 0 && resolved.stat.size > 0) {
    return recordFailure(options.diagnostics, {
      ok: false,
      status: "budget-exceeded",
      relativePath: resolved.relativePath,
      reason: "The total repository text-read budget was exhausted.",
      code: "TOTAL_TEXT_BUDGET_EXCEEDED"
    });
  }

  let fd;
  try {
    const noFollow = Number(fs.constants.O_NOFOLLOW) || 0;
    fd = fs.openSync(
      resolved.path,
      fs.constants.O_RDONLY | noFollow
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || fileIdentityChanged(resolved.stat, stat)) {
      return recordFailure(options.diagnostics, {
        ok: false,
        status: "rejected",
        relativePath: resolved.relativePath,
        reason: "The file changed after containment validation.",
        code: "FILE_REPLACED_DURING_READ"
      });
    }
    const bytesToRead = Math.min(stat.size, limit, remaining);
    const buffer = Buffer.alloc(bytesToRead);
    const bytes = bytesToRead > 0
      ? fs.readSync(fd, buffer, 0, bytesToRead, 0)
      : 0;
    if (budget) {
      budget.bytesRead += bytes;
    }
    const output = {
      ok: true,
      status: "ok",
      relativePath: resolved.relativePath,
      text: buffer.subarray(0, bytes).toString("utf8"),
      bytes,
      truncated: stat.size > bytes,
      size: stat.size
    };
    if (
      output.truncated &&
      options.diagnostics &&
      options.recordTruncation !== false
    ) {
      markReadLimit(
        options.diagnostics,
        resolved.relativePath,
        limit,
        options.budgetName || "max_file_bytes"
      );
    }
    return output;
  } catch (error) {
    return recordFailure(options.diagnostics, {
      ok: false,
      status: error?.code === "ENOENT" ? "missing" : "unreadable",
      relativePath: resolved.relativePath,
      reason: "The contained file could not be opened safely.",
      code: error?.code || "SAFE_OPEN_FAILED"
    });
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

function markReadLimit(diagnostics, relativePath, limit, budgetName) {
  diagnostics.complete = false;
  diagnostics.truncated = true;
  diagnostics.budgets_reached ||= [];
  if (!diagnostics.budgets_reached.includes(budgetName)) {
    diagnostics.budgets_reached.push(budgetName);
  }
  diagnostics.path_failures ||= [];
  if (diagnostics.path_failures.length < 50) {
    diagnostics.path_failures.push({
      path: relativePath,
      status: "budget-exceeded",
      code: `${budgetName.toUpperCase()}_EXCEEDED`,
      reason: `The file exceeded its ${limit}-byte text-read limit.`
    });
  } else {
    diagnostics.path_failures_truncated = true;
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
      limit: options.readLimit ?? 120_000,
      budget: options.budget,
      diagnostics: options.diagnostics
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

export function createReadBudget(maxBytes) {
  return {
    maxBytes: Number.isInteger(maxBytes) && maxBytes >= 0
      ? maxBytes
      : 8 * 1024 * 1024,
    bytesRead: 0
  };
}

function boundedReadLimit(value) {
  if (value === undefined) {
    return 300_000;
  }
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }
  return Math.min(value, 64 * 1024 * 1024);
}

function fileIdentityChanged(before, after) {
  return (
    before.dev !== undefined &&
    before.ino !== undefined &&
    after.dev !== undefined &&
    after.ino !== undefined &&
    (
      before.dev !== after.dev ||
      before.ino !== after.ino
    )
  );
}

function recordFailure(diagnostics, result) {
  if (!diagnostics) {
    return result;
  }
  diagnostics.path_failures ||= [];
  if (diagnostics.path_failures.length < 50) {
    diagnostics.path_failures.push({
      path: result.relativePath || null,
      status: result.status,
      code: result.code,
      reason: result.reason
    });
  } else {
    diagnostics.path_failures_truncated = true;
  }
  if (result.status === "rejected") {
    diagnostics.rejected_paths = (diagnostics.rejected_paths || 0) + 1;
  } else if (result.status === "outside-root") {
    diagnostics.outside_root_paths =
      (diagnostics.outside_root_paths || 0) + 1;
  } else if (result.status === "unreadable") {
    diagnostics.unreadable_entries =
      (diagnostics.unreadable_entries || 0) + 1;
  } else if (result.status === "budget-exceeded") {
    diagnostics.budgets_reached ||= [];
    if (!diagnostics.budgets_reached.includes("max_total_text_bytes")) {
      diagnostics.budgets_reached.push("max_total_text_bytes");
    }
  }
  if (result.code !== "SENSITIVE_PATH_REJECTED") {
    diagnostics.complete = false;
  }
  return result;
}
