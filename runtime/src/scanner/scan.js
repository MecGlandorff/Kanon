import fs from "node:fs";
import path from "node:path";
import {
  isKanonIgnored,
  listGitVisibleFiles,
  loadKanonIgnore,
  shouldIgnorePath
} from "./ignore.js";
import { IGNORED_DIRS, isSensitivePath, isTextFile } from "./policy.js";
import { hashFile, resolveContainedPath } from "./shared.js";

const HARD_LIMITS = Object.freeze({
  maxFiles: 25_000,
  maxEntries: 100_000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalHashBytes: 128 * 1024 * 1024,
  maxTotalTextBytes: 32 * 1024 * 1024,
  maxElapsedMs: 30_000
});

export function scanRepo(root, options = {}) {
  const rootResult = resolveContainedPath(root, ".", {
    allowRoot: true,
    type: "directory"
  });
  const resolvedRoot = rootResult.ok
    ? rootResult.root
    : path.resolve(root);
  const maxFiles = boundedOption(options.maxFiles, 2000, HARD_LIMITS.maxFiles);
  const maxEntries = boundedOption(
    options.maxEntries,
    10_000,
    HARD_LIMITS.maxEntries
  );
  const maxFileBytes = boundedOption(
    options.maxFileBytes,
    750_000,
    HARD_LIMITS.maxFileBytes
  );
  const maxTotalHashBytes = boundedOption(
    options.maxTotalHashBytes,
    32 * 1024 * 1024,
    HARD_LIMITS.maxTotalHashBytes
  );
  const maxTotalTextBytes = boundedOption(
    options.maxTotalTextBytes,
    8 * 1024 * 1024,
    HARD_LIMITS.maxTotalTextBytes
  );
  const maxElapsedMs = boundedOption(
    options.maxElapsedMs,
    5_000,
    HARD_LIMITS.maxElapsedMs
  );
  const started = Date.now();
  const files = [];
  const hashBudget = {
    maxBytes: maxTotalHashBytes,
    bytesHashed: 0
  };
  const diagnostics = {
    complete: rootResult.ok,
    strategy: "filesystem",
    max_files: maxFiles,
    max_entries: maxEntries,
    max_file_bytes: maxFileBytes,
    max_total_hash_bytes: maxTotalHashBytes,
    max_total_text_bytes: maxTotalTextBytes,
    max_elapsed_ms: maxElapsedMs,
    entries_visited: 0,
    total_bytes_hashed: 0,
    total_text_bytes_read: 0,
    elapsed_ms: 0,
    truncated: false,
    unreadable_entries: 0,
    missing_tracked_files: 0,
    ignored_directories: 0,
    kanon_ignored_entries: 0,
    sensitive_files_skipped: 0,
    symlinks_skipped: 0,
    rejected_paths: 0,
    outside_root_paths: 0,
    path_failures: [],
    path_failures_truncated: false,
    budgets_reached: [],
    git_observation_failed: false,
    git_diagnostic: null
  };
  if (!rootResult.ok) {
    recordPathFailure(rootResult);
    return finish();
  }
  const kanonIgnoreRules = loadKanonIgnore(resolvedRoot, {
    diagnostics,
    maxBytes: options.maxIgnoreBytes
  });

  const gitListing = options.useGitIgnore === false
    ? null
    : listGitVisibleFiles(resolvedRoot, {
        timeoutMs: options.gitTimeoutMs,
        maxOutputBytes: options.gitMaxOutputBytes
      });
  if (gitListing?.ok) {
    diagnostics.strategy = "git";
    for (const relPath of gitListing.files) {
      if (!visitEntryBudget()) {
        break;
      }
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
    if (gitListing && !gitListing.ok) {
      diagnostics.git_observation_failed = true;
      diagnostics.git_diagnostic = gitListing.diagnostic;
    }
    walk(resolvedRoot, "");
  }

  return finish();

  function walk(absDir, relDir) {
    if (budgetExceeded()) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      diagnostics.unreadable_entries += 1;
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!visitEntryBudget()) {
        return;
      }
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isSymbolicLink()) {
        diagnostics.symlinks_skipped += 1;
        recordPathFailure({
          status: "rejected",
          relativePath: rel,
          code: "LINK_REJECTED",
          reason: "A filesystem entry is a symbolic link or junction."
        });
        continue;
      }

      if (entry.isDirectory()) {
        if (isKanonIgnored(rel, true, kanonIgnoreRules)) {
          diagnostics.kanon_ignored_entries += 1;
        } else if (IGNORED_DIRS.has(entry.name)) {
          diagnostics.ignored_directories += 1;
        } else {
          const directory = resolveContainedPath(resolvedRoot, rel, {
            type: "directory"
          });
          if (directory.ok) {
            walk(directory.path, rel);
          } else {
            recordPathFailure(directory);
          }
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
      reachBudget("max_files");
      return false;
    }

    const resolved = resolveContainedPath(resolvedRoot, relPath, {
      type: "file"
    });
    if (!resolved.ok) {
      if (
        diagnostics.strategy === "git" &&
        resolved.status === "missing"
      ) {
        diagnostics.missing_tracked_files += 1;
        return true;
      }
      recordPathFailure(resolved);
      return true;
    }

    const basename = path.basename(relPath);
    const beforeHash = hashBudget.bytesHashed;
    if (resolved.stat.size > maxFileBytes) {
      noteBudget("max_file_bytes");
    }
    const sha256 = hashFile(
      resolvedRoot,
      relPath,
      resolved.stat.size,
      {
        maxFileBytes,
        hashBudget,
        onFailure: recordPathFailure
      }
    );
    if (
      sha256 === null &&
      resolved.stat.size <= maxFileBytes &&
      beforeHash + resolved.stat.size > hashBudget.maxBytes
    ) {
      noteBudget("max_total_hash_bytes");
    }
    files.push({
      path: relPath.replaceAll("\\", "/"),
      basename,
      extension: path.extname(basename).toLowerCase(),
      size: resolved.stat.size,
      mtime_ms:
        Number.isFinite(resolved.stat.mtimeMs) &&
        resolved.stat.mtimeMs >= 0
          ? Math.floor(resolved.stat.mtimeMs)
          : null,
      text: isTextFile(relPath, basename),
      sha256
    });
    return true;
  }

  function visitEntryBudget() {
    if (budgetExceeded()) {
      return false;
    }
    diagnostics.entries_visited += 1;
    if (diagnostics.entries_visited > maxEntries) {
      reachBudget("max_entries");
      return false;
    }
    return true;
  }

  function budgetExceeded() {
    if (Date.now() - started > maxElapsedMs) {
      reachBudget("max_elapsed_ms");
      return true;
    }
    return diagnostics.truncated;
  }

  function reachBudget(name) {
    diagnostics.truncated = true;
    noteBudget(name);
  }

  function noteBudget(name) {
    if (!diagnostics.budgets_reached.includes(name)) {
      diagnostics.budgets_reached.push(name);
    }
  }

  function recordPathFailure(result) {
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
      diagnostics.rejected_paths += 1;
    } else if (result.status === "outside-root") {
      diagnostics.outside_root_paths += 1;
    } else if (result.status === "unreadable") {
      diagnostics.unreadable_entries += 1;
    }
  }

  function finish() {
    diagnostics.total_bytes_hashed = hashBudget.bytesHashed;
    diagnostics.elapsed_ms = Date.now() - started;
    diagnostics.complete =
      diagnostics.complete &&
      !diagnostics.truncated &&
      diagnostics.unreadable_entries === 0 &&
      diagnostics.rejected_paths === 0 &&
      diagnostics.outside_root_paths === 0 &&
      !diagnostics.git_observation_failed;
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
  }
}

function boundedOption(value, fallback, maximum) {
  return Number.isInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}
