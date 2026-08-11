import fs from "node:fs";
import path from "node:path";
import { isBoundedString } from "../core/trust.js";

/**
 * @typedef {"missing" | "outside-root" | "rejected" | "unreadable" | "oversized"}
 *   ReadFailureStatus
 * @typedef {{
 *   ok: true,
 *   root: string,
 *   path: string,
 *   relative_path: ".",
 *   stat: import("node:fs").Stats
 * } | {
 *   ok: false,
 *   status: "missing" | "rejected" | "unreadable",
 *   diagnostic: string
 * }} CanonicalRootResult
 * @typedef {{
 *   ok: true,
 *   root: string,
 *   path: string,
 *   relative_path: string,
 *   stat: import("node:fs").Stats
 * } | {
 *   ok: false,
 *   status: "missing" | "outside-root" | "rejected" | "unreadable",
 *   relative_path: string | null,
 *   diagnostic: string
 * }} ContainedPathResult
 * @typedef {{
 *   ok: true,
 *   relative_path: string,
 *   bytes: Buffer,
 *   size: number,
 *   mtime_ms: number | null,
 *   truncated: boolean
 * } | {
 *   ok: false,
 *   status: ReadFailureStatus,
 *   relative_path: string | null,
 *   diagnostic: string
 * }} BoundedReadResult
 */

/**
 * @param {unknown} input
 * @param {boolean} [allowFilesystemRoot]
 * @returns {CanonicalRootResult}
 */
export function canonicalizeRepositoryRoot(input, allowFilesystemRoot = false) {
  if (!isBoundedString(input, 8_192) || input.includes("\0")) {
    return {
      ok: false,
      status: "rejected",
      diagnostic: "Repository root input was unavailable or invalid."
    };
  }
  let selected;
  try {
    selected = path.resolve(input);
  } catch {
    return {
      ok: false,
      status: "rejected",
      diagnostic: "Repository root input was unavailable or invalid."
    };
  }
  try {
    const root = realpath(selected);
    const stat = fs.statSync(root);
    if (
      !stat.isDirectory() ||
      (!allowFilesystemRoot && samePath(root, path.parse(root).root))
    ) {
      return {
        ok: false,
        status: "rejected",
        diagnostic:
          "The canonical repository root is not a safe repository directory."
      };
    }
    return {
      ok: true,
      root,
      path: root,
      relative_path: ".",
      stat
    };
  } catch (error) {
    return {
      ok: false,
      status: errorCode(error) === "ENOENT" ? "missing" : "unreadable",
      diagnostic: "The repository root could not be canonicalized."
    };
  }
}

/**
 * Resolve a repository-relative path without following repository-controlled
 * links or reparse points.
 *
 * @param {string} canonicalRoot
 * @param {unknown} relativeInput
 * @param {"file" | "directory"} type
 * @returns {ContainedPathResult}
 */
export function resolveRepositoryPath(
  canonicalRoot,
  relativeInput,
  type
) {
  const parsed = parseRelativePath(relativeInput);
  if (!parsed.ok) {
    return parsed;
  }
  let current = canonicalRoot;
  for (let index = 0; index < parsed.parts.length; index += 1) {
    const part = parsed.parts[index];
    if (part === undefined) {
      return {
        ok: false,
        status: "rejected",
        relative_path: parsed.relativePath,
        diagnostic: "A repository path component was unavailable."
      };
    }
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      return {
        ok: false,
        status: errorCode(error) === "ENOENT" ? "missing" : "unreadable",
        relative_path: parsed.relativePath,
        diagnostic:
          errorCode(error) === "ENOENT"
            ? "The requested repository path was not observed."
            : "A repository path component could not be inspected."
      };
    }
    if (stat.isSymbolicLink()) {
      return {
        ok: false,
        status: "rejected",
        relative_path: parsed.relativePath,
        diagnostic:
          "A repository path component is a link, junction, or reparse point."
      };
    }
    let canonical;
    try {
      canonical = realpath(current);
    } catch {
      return {
        ok: false,
        status: "unreadable",
        relative_path: parsed.relativePath,
        diagnostic: "A repository path component could not be canonicalized."
      };
    }
    if (!isWithin(canonicalRoot, canonical)) {
      return {
        ok: false,
        status: "outside-root",
        relative_path: parsed.relativePath,
        diagnostic:
          "A canonical repository path resolved outside the selected root."
      };
    }
    if (!samePath(current, canonical)) {
      return {
        ok: false,
        status: "rejected",
        relative_path: parsed.relativePath,
        diagnostic:
          "A repository path component is an indirect reparse point."
      };
    }
    const leaf = index === parsed.parts.length - 1;
    if (!leaf && !stat.isDirectory()) {
      return {
        ok: false,
        status: "rejected",
        relative_path: parsed.relativePath,
        diagnostic: "A repository path ancestor is not a directory."
      };
    }
    if (
      leaf &&
      (
        (type === "file" && !stat.isFile()) ||
        (type === "directory" && !stat.isDirectory())
      )
    ) {
      return {
        ok: false,
        status: "rejected",
        relative_path: parsed.relativePath,
        diagnostic: `The repository target is not a ${type}.`
      };
    }
    if (leaf) {
      return {
        ok: true,
        root: canonicalRoot,
        path: current,
        relative_path: parsed.relativePath,
        stat
      };
    }
  }
  return {
    ok: false,
    status: "rejected",
    relative_path: parsed.relativePath,
    diagnostic: "An empty repository target is not allowed."
  };
}

/**
 * @param {string} canonicalRoot
 * @param {unknown} relativePath
 * @param {number} maximumBytes
 * @param {{truncate?: boolean}} [options]
 * @returns {BoundedReadResult}
 */
export function readBoundedRepositoryFile(
  canonicalRoot,
  relativePath,
  maximumBytes,
  options = {}
) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 4 * 1024 * 1024
  ) {
    return {
      ok: false,
      status: "rejected",
      relative_path: null,
      diagnostic: "Repository read bounds were unavailable or invalid."
    };
  }
  const selected = resolveRepositoryPath(
    canonicalRoot,
    relativePath,
    "file"
  );
  if (!selected.ok) {
    return selected;
  }
  const truncate = options.truncate === true;
  if (selected.stat.size > maximumBytes && !truncate) {
    return {
      ok: false,
      status: "oversized",
      relative_path: selected.relative_path,
      diagnostic: "The repository file exceeded the read limit."
    };
  }

  let descriptor;
  try {
    descriptor = fs.openSync(
      selected.path,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
    );
    const before = fs.fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.dev !== selected.stat.dev ||
      before.ino !== selected.stat.ino ||
      before.nlink !== 1
    ) {
      throw new Error("identity");
    }
    const length = Math.min(before.size, maximumBytes);
    const bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const read = fs.readSync(
        descriptor,
        bytes,
        offset,
        length - offset,
        offset
      );
      if (read === 0) {
        break;
      }
      offset += read;
    }
    const after = fs.fstatSync(descriptor);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    ) {
      throw new Error("changed");
    }
    fs.closeSync(descriptor);
    descriptor = undefined;
    return {
      ok: true,
      relative_path: selected.relative_path,
      bytes: offset === bytes.length ? bytes : bytes.subarray(0, offset),
      size: before.size,
      mtime_ms:
        Number.isFinite(before.mtimeMs) && before.mtimeMs >= 0
          ? Math.floor(before.mtimeMs)
          : null,
      truncated: before.size > maximumBytes
    };
  } catch {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Best-effort closure of this process's read descriptor.
      }
    }
    return {
      ok: false,
      status: "unreadable",
      relative_path: selected.relative_path,
      diagnostic:
        "The repository file changed during inspection or could not be read safely."
    };
  }
}

/**
 * @param {unknown} relativePath
 * @returns {boolean}
 */
export function isSafeRelativePath(relativePath) {
  return parseRelativePath(relativePath).ok;
}

/**
 * @param {unknown} relativePath
 * @returns {boolean}
 */
export function isSensitiveRepositoryPath(relativePath) {
  if (typeof relativePath !== "string") {
    return true;
  }
  const lower = relativePath.toLowerCase();
  const basename = path.posix.basename(lower);
  return (
    basename === ".npmrc" ||
    basename === ".pypirc" ||
    basename === ".netrc" ||
    basename === "credentials" ||
    basename === "id_rsa" ||
    basename === "id_dsa" ||
    basename === "id_ecdsa" ||
    basename === "id_ed25519" ||
    basename.startsWith(".env") ||
    /\.(?:key|pem|p12|pfx|keystore)$/.test(basename) ||
    /(?:^|[-_.])(?:credentials?|passwords?|secrets?|tokens?)(?:[-_.]|$)/.test(
      basename
    )
  );
}

/**
 * @param {unknown} value
 * @returns {{
 *   ok: true,
 *   parts: string[],
 *   relativePath: string
 * } | {
 *   ok: false,
 *   status: "rejected",
 *   relative_path: string | null,
 *   diagnostic: string
 * }}
 */
function parseRelativePath(value) {
  if (
    !isBoundedString(value, 4_096) ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(value) ||
    path.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    /^(?:\\\\|\/\/)/.test(value)
  ) {
    return {
      ok: false,
      status: "rejected",
      relative_path: typeof value === "string" ? value.slice(0, 4_096) : null,
      diagnostic: "Repository paths must be bounded relative paths."
    };
  }
  const raw = value.replaceAll("\\", "/").split("/");
  if (raw.some((part) => part === "..")) {
    return {
      ok: false,
      status: "rejected",
      relative_path: value,
      diagnostic: "Repository path traversal is not allowed."
    };
  }
  const parts = raw.filter((part) => part && part !== ".");
  if (parts.length === 0) {
    return {
      ok: false,
      status: "rejected",
      relative_path: value,
      diagnostic: "An empty repository target is not allowed."
    };
  }
  return {
    ok: true,
    parts,
    relativePath: parts.join("/")
  };
}

/**
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    )
  );
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

/**
 * @param {string} value
 * @returns {string}
 */
function realpath(value) {
  return fs.realpathSync.native
    ? fs.realpathSync.native(value)
    : fs.realpathSync(value);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorCode(error) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  )
    ? error.code
    : "";
}
