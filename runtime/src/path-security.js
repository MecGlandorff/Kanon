import fs from "node:fs";
import path from "node:path";

const FAILURE_STATUSES = new Set([
  "missing",
  "outside-root",
  "rejected",
  "unreadable"
]);

/**
 * Resolve a repository-relative path without following repository-controlled
 * links. The returned path is useful only while the checked filesystem state
 * remains unchanged; a same-user concurrent replacement is a documented
 * residual threat unless the caller keeps directory file descriptors open.
 */
export function resolveContainedPath(root, relativePath, policy = {}) {
  const rootResult = resolveRoot(root);
  if (!rootResult.ok) {
    return rootResult;
  }

  const parsed = parseRelativePath(relativePath, policy);
  if (!parsed.ok) {
    return {
      ...parsed,
      root: rootResult.root
    };
  }

  if (parsed.parts.length === 0) {
    if (!policy.allowRoot) {
      return failure(
        "rejected",
        rootResult.root,
        null,
        "The repository root itself is not an allowed target.",
        "ROOT_TARGET_REJECTED"
      );
    }
    return {
      ok: true,
      status: "ok",
      root: rootResult.root,
      path: rootResult.root,
      relativePath: ".",
      stat: rootResult.stat
    };
  }

  const candidate = path.join(rootResult.root, ...parsed.parts);
  if (!isWithin(rootResult.root, candidate)) {
    return failure(
      "outside-root",
      rootResult.root,
      parsed.relativePath,
      "The resolved target is outside the canonical repository root.",
      "OUTSIDE_ROOT"
    );
  }

  let current = rootResult.root;
  for (let index = 0; index < parsed.parts.length; index += 1) {
    current = path.join(current, parsed.parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          ok: false,
          status: "missing",
          root: rootResult.root,
          path: candidate,
          relativePath: parsed.relativePath,
          existingParent: path.dirname(current),
          missingComponent: parsed.parts[index],
          reason: "The requested path does not exist.",
          code: "PATH_MISSING"
        };
      }
      return failure(
        "unreadable",
        rootResult.root,
        parsed.relativePath,
        "A path component could not be inspected.",
        error?.code || "LSTAT_FAILED",
        candidate
      );
    }

    if (stat.isSymbolicLink()) {
      return failure(
        "rejected",
        rootResult.root,
        parsed.relativePath,
        "A path component is a symbolic link, junction, or reparse point.",
        "LINK_REJECTED",
        candidate
      );
    }

    let canonicalCurrent;
    try {
      canonicalCurrent = realpath(current);
    } catch (error) {
      return failure(
        "unreadable",
        rootResult.root,
        parsed.relativePath,
        "A path component could not be canonicalized.",
        error?.code || "REALPATH_FAILED",
        candidate
      );
    }
    if (!isWithin(rootResult.root, canonicalCurrent)) {
      return failure(
        "outside-root",
        rootResult.root,
        parsed.relativePath,
        "A canonical path component resolves outside the repository root.",
        "CANONICAL_PATH_OUTSIDE_ROOT",
        candidate
      );
    }
    if (!samePath(current, canonicalCurrent)) {
      return failure(
        "rejected",
        rootResult.root,
        parsed.relativePath,
        "A path component is an indirect link or reparse point.",
        "REPARSE_POINT_REJECTED",
        candidate
      );
    }

    const isLeaf = index === parsed.parts.length - 1;
    if (!isLeaf && !stat.isDirectory()) {
      return failure(
        "rejected",
        rootResult.root,
        parsed.relativePath,
        "A non-directory path component was used as an ancestor.",
        "NON_DIRECTORY_ANCESTOR",
        candidate
      );
    }
    if (isLeaf && !matchesType(stat, policy.type || "any")) {
      return failure(
        "rejected",
        rootResult.root,
        parsed.relativePath,
        `The target is not a ${policy.type}.`,
        "TARGET_TYPE_REJECTED",
        candidate
      );
    }

    if (isLeaf) {
      return {
        ok: true,
        status: "ok",
        root: rootResult.root,
        path: current,
        relativePath: parsed.relativePath,
        stat
      };
    }
  }

  throw new Error("Unreachable contained-path resolution state.");
}

export function assertContainedPath(root, relativePath, policy = {}) {
  const result = resolveContainedPath(root, relativePath, policy);
  if (!result.ok) {
    const error = new Error(
      `${relativePath}: ${result.reason} (${result.status})`
    );
    error.code = result.code;
    error.pathResult = result;
    throw error;
  }
  return result;
}

export function isContainedFailure(result) {
  return Boolean(result && FAILURE_STATUSES.has(result.status));
}

export function sanitizeFilenameComponent(value, fallback = "snapshot") {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 96);
  const candidate = normalized || fallback;
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(candidate)
    ? `kanon-${candidate}`
    : candidate;
}

function resolveRoot(root) {
  let resolved;
  try {
    resolved = path.resolve(String(root));
  } catch {
    return failure(
      "rejected",
      null,
      null,
      "The repository root is not a valid filesystem path.",
      "INVALID_ROOT"
    );
  }

  try {
    const canonical = realpath(resolved);
    const stat = fs.statSync(canonical);
    if (!stat.isDirectory()) {
      return failure(
        "rejected",
        canonical,
        null,
        "The canonical repository root is not a directory.",
        "ROOT_NOT_DIRECTORY"
      );
    }
    return {
      ok: true,
      status: "ok",
      root: canonical,
      path: canonical,
      relativePath: ".",
      stat
    };
  } catch (error) {
    return failure(
      error?.code === "ENOENT" ? "missing" : "unreadable",
      resolved,
      null,
      "The repository root could not be canonicalized.",
      error?.code || "ROOT_REALPATH_FAILED"
    );
  }
}

function parseRelativePath(value, policy) {
  if (typeof value !== "string" || value.includes("\0")) {
    return failure(
      "rejected",
      null,
      null,
      "Repository paths must be NUL-free strings.",
      "INVALID_RELATIVE_PATH"
    );
  }
  if (
    path.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    /^(?:\\\\|\/\/)/.test(value)
  ) {
    return failure(
      "rejected",
      null,
      value,
      "Absolute repository paths are not allowed.",
      "ABSOLUTE_PATH_REJECTED"
    );
  }

  const rawParts = value.replaceAll("\\", "/").split("/");
  if (rawParts.includes("..")) {
    return failure(
      "rejected",
      null,
      value,
      "Repository path traversal is not allowed.",
      "TRAVERSAL_REJECTED"
    );
  }
  const parts = rawParts.filter((part) => part && part !== ".");
  if (parts.length === 0 && !policy.allowRoot) {
    return failure(
      "rejected",
      null,
      value,
      "An empty repository-relative path is not allowed.",
      "EMPTY_PATH_REJECTED"
    );
  }
  return {
    ok: true,
    parts,
    relativePath: parts.join("/") || "."
  };
}

function matchesType(stat, type) {
  if (type === "any") {
    return stat.isFile() || stat.isDirectory();
  }
  if (type === "file") {
    return stat.isFile();
  }
  if (type === "directory") {
    return stat.isDirectory();
  }
  throw new Error(`Unknown contained-path type policy: ${type}`);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function realpath(value) {
  return fs.realpathSync.native
    ? fs.realpathSync.native(value)
    : fs.realpathSync(value);
}

function failure(status, root, relativePath, reason, code, targetPath = null) {
  return {
    ok: false,
    status,
    root,
    path: targetPath,
    relativePath,
    reason,
    code
  };
}
