import fs from "node:fs";
import path from "node:path";
import {
  isKanonIgnored,
  listGitVisibleFiles,
  loadKanonIgnore,
  shouldIgnorePath
} from "./ignore.js";
import { IGNORED_DIRS, isSensitivePath, isTextFile } from "./policy.js";
import { hashFile, safeResolve } from "./shared.js";

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

  const gitFiles = options.useGitIgnore === false
    ? null
    : listGitVisibleFiles(resolvedRoot);
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

  diagnostics.complete = !diagnostics.truncated &&
    diagnostics.unreadable_entries === 0;
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
