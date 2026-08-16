import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalizeRepositoryRoot,
  isSafeRelativePath,
  resolveRepositoryPath
} from "#kanon-repository-read";
const APPEND_WAIT = new Int32Array(new SharedArrayBuffer(4));
const RETENTION_CHANGED = "Evidence retention changed before refresh publication.";

/**
 * @typedef {{ok: true, status: "ok", root: string, path: string, relativePath: string, stat: fs.Stats}} ContainedPathSuccess
 * @typedef {{ok: false, status: "missing" | "outside-root" | "rejected" | "unreadable", root: string | null, path: string | null, relativePath: string | null, reason: string, code: string}} ContainedPathFailure
 * @typedef {ContainedPathSuccess | ContainedPathFailure} ContainedPathResult
 * @typedef {ContainedPathSuccess | (ContainedPathFailure & {status: "missing", path: string})} PreparedDestination
 * @typedef {{ok: true, status: "ok", relativePath: string, text: string, bytes: number, truncated: boolean, size: number} | ContainedPathFailure | {ok: false, status: "budget-exceeded", relativePath: string, reason: string, code: "INPUT_SIZE_LIMIT"}} ContainedTextResult
 */

/** @param {string} root @param {string} relativePath @returns {ContainedPathResult} */
export function ensureContainedDirectory(root, relativePath) {
  const parts = relativePath.replaceAll("\\", "/").split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    let result = resolveContainedPath(root, current, { type: "directory" });
    if (result.ok) {
      continue;
    }
    if (result.status !== "missing") {
      throw pathError(current, result);
    }
    const parent = path.posix.dirname(current);
    const parentResult = resolveContainedPath(
      root,
      parent === "." ? "." : parent,
      {
        allowRoot: parent === ".",
        type: "directory"
      }
    );
    if (!parentResult.ok) {
      throw pathError(parent, parentResult);
    }
    if (result.path === null) {
      throw pathError(current, result);
    }
    fs.mkdirSync(result.path, { mode: 0o700, recursive: false });
    result = resolveContainedPath(root, current, { type: "directory" });
    if (!result.ok) {
      throw pathError(current, result);
    }
  }
  return resolveContainedPath(root, relativePath, { type: "directory" });
}

/** @param {string} root @param {string} relativePath @param {string | null} contents */
export function atomicWriteContained(root, relativePath, contents) {
  const destination = prepareDestination(root, relativePath);
  if (contents === null) {
    if (destination.ok) {
      fs.unlinkSync(destination.path);
    }
    return;
  }
  const parentRelative = path.posix.dirname(relativePath.replaceAll("\\", "/"));
  const tempName = `.kanon.${process.pid}.${crypto.randomUUID()}.tmp`;
  const tempRelative = parentRelative === "." ? tempName : `${parentRelative}/${tempName}`;
  const temp = resolveContainedPath(root, tempRelative, { type: "file" });
  if (temp.ok) {
    throw new Error(`${tempRelative}: temporary target already exists.`);
  }
  if (temp.status !== "missing") {
    throw pathError(tempRelative, temp);
  }
  if (temp.path === null) {
    throw pathError(tempRelative, temp);
  }
  const noFollow = Number(fs.constants.O_NOFOLLOW) || 0;
  let fd;
  try {
    fd = fs.openSync(temp.path,
      fs.constants.O_CREAT | fs.constants.O_EXCL |
        fs.constants.O_WRONLY | noFollow, 0o600);
    fs.writeFileSync(fd, contents, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    prepareDestination(root, relativePath);
    fs.renameSync(temp.path, destination.path);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try {
      fs.unlinkSync(temp.path);
    } catch {
      // The rename succeeded or the temporary file was never created.
    }
  }
}

/** @param {string} root @param {string} relativePath @param {string} contents
 * @param {{maximumBytes: number, maximumRecords: number, publish: () => void}} [transaction] */
export function appendContained(root, relativePath, contents, transaction) {
  const reservationRelative = `${relativePath}.tmp`;
  const destination = prepareDestination(root, relativePath);
  const noFollow = Number(fs.constants.O_NOFOLLOW) || 0;
  let reservation;
  let reservationFd;
  let fd;
  let originalSize;
  try {
    if (transaction) {
      const deadline = Date.now() + 5_000;
      for (;;) {
        reservation = prepareDestination(root, reservationRelative);
        try {
          reservationFd = fs.openSync(reservation.path,
            fs.constants.O_CREAT | fs.constants.O_EXCL |
              fs.constants.O_WRONLY | noFollow, 0o600);
          fs.writeFileSync(reservationFd, `${process.pid}\n`, "utf8");
          break;
        } catch (error) {
          if (reservationFd !== undefined) {
            fs.closeSync(reservationFd);
            reservationFd = undefined;
            fs.unlinkSync(reservation.path);
          }
          if (errorCode(error) !== "EEXIST") throw error;
          if (removeStaleReservation(root, reservationRelative)) continue;
          if (Date.now() >= deadline) throw error;
          Atomics.wait(APPEND_WAIT, 0, 0, 10);
        }
      }
    }
    fd = fs.openSync(destination.path,
      fs.constants.O_APPEND | fs.constants.O_CREAT |
        (transaction ? fs.constants.O_RDWR : fs.constants.O_WRONLY) | noFollow, 0o600);
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      (destination.ok && fileIdentityChanged(destination.stat, stat))
    ) {
      throw new Error(
        `${relativePath}: append target changed after containment validation.`
      );
    }
    originalSize = stat.size;
    if (transaction) {
      const payloadBytes = Buffer.byteLength(contents);
      if (stat.size > transaction.maximumBytes - payloadBytes)
        throw new Error(RETENTION_CHANGED);
      const existing = stat.size
        ? fs.readFileSync(fd, "utf8")
        : "";
      const currentRecords = existing.split(/\r?\n/).filter(Boolean).length;
      const incomingRecords = contents.split(/\r?\n/).filter(Boolean).length;
      if (currentRecords + incomingRecords > transaction.maximumRecords)
        throw new Error(RETENTION_CHANGED);
    }
    fs.writeFileSync(fd, contents, "utf8");
    fs.fsyncSync(fd);
    transaction?.publish();
  } catch (error) {
    if (transaction && fd !== undefined && originalSize !== undefined) {
      fs.ftruncateSync(fd, originalSize);
      fs.fsyncSync(fd);
    }
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (reservationFd !== undefined && reservation) {
      fs.closeSync(reservationFd);
      fs.unlinkSync(reservation.path);
    }
  }
}

/** @param {string} root @param {string} relativePath */
function removeStaleReservation(root, relativePath) {
  const current = resolveContainedPath(root, relativePath, { type: "file" });
  if (!current.ok) return true;
  const read = readContainedText(root, relativePath, 32);
  const owner = read.ok && /^[1-9]\d{0,9}\n?$/.test(read.text)
    ? Number(read.text)
    : 0;
  const validOwner = owner > 0 && owner <= 2_147_483_647;
  if (validOwner) {
    try {
      process.kill(owner, 0);
      return false;
    } catch (error) {
      if (errorCode(error) !== "ESRCH") return false;
    }
  } else if (Date.now() - current.stat.mtimeMs < 5_000) return false;
  const latest = resolveContainedPath(root, relativePath, { type: "file" });
  if (!latest.ok) return true;
  if (fileIdentityChanged(current.stat, latest.stat)) return false;
  fs.unlinkSync(latest.path);
  return true;
}

/** @param {string} root @param {string} relativePath @param {number} maximumBytes
 * @param {{optional?: boolean}} [options] @returns {ContainedTextResult} */
export function readContainedText(
  root,
  relativePath,
  maximumBytes,
  options = {}
) {
  const resolved = resolveContainedPath(root, relativePath, { type: "file" });
  if (!resolved.ok) {
    return resolved;
  }

  let fd;
  try {
    const noFollow = Number(fs.constants.O_NOFOLLOW) || 0;
    fd = fs.openSync(resolved.path, fs.constants.O_RDONLY | noFollow);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || fileIdentityChanged(resolved.stat, stat)) {
      return {
        ok: false,
        status: "rejected",
        root: resolved.root,
        path: resolved.path,
        relativePath: resolved.relativePath,
        reason: "The file changed after containment validation.",
        code: "FILE_REPLACED_DURING_READ"
      };
    }
    const bytesToRead = Math.min(stat.size, maximumBytes + 1);
    const buffer = Buffer.alloc(bytesToRead);
    const bytes = bytesToRead > 0
      ? fs.readSync(fd, buffer, 0, bytesToRead, 0)
      : 0;
    if (
      stat.size > maximumBytes ||
      bytes > maximumBytes ||
      stat.size > bytes
    ) {
      return {
        ok: false,
        status: "budget-exceeded",
        relativePath,
        reason: `The input exceeds its ${maximumBytes}-byte limit.`,
        code: "INPUT_SIZE_LIMIT"
      };
    }
    return {
      ok: true,
      status: "ok",
      relativePath: resolved.relativePath,
      text: buffer.subarray(0, bytes).toString("utf8"),
      bytes,
      truncated: false,
      size: stat.size
    };
  } catch (error) {
    return {
      ok: false,
      status: errorCode(error) === "ENOENT" ? "missing" : "unreadable",
      root: resolved.root,
      path: resolved.path,
      relativePath: resolved.relativePath,
      reason: "The contained file could not be opened safely.",
      code: errorCode(error) || "SAFE_OPEN_FAILED"
    };
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

/** @param {string} root @param {string} relativePath @returns {fs.Dirent[]} */
export function listContainedDirectory(root, relativePath) {
  const directory = resolveContainedPath(root, relativePath, {
    type: "directory"
  });
  if (!directory.ok) {
    throw pathError(relativePath, directory);
  }
  return fs.readdirSync(directory.path, { withFileTypes: true });
}

/** @param {string} root @param {string} relativePath @param {{optional?: boolean}} [options] @returns {ContainedPathResult} */
export function containedFileStat(root, relativePath, options = {}) {
  const result = resolveContainedPath(root, relativePath, { type: "file" });
  if (!result.ok && !(options.optional && result.status === "missing")) {
    throw pathError(relativePath, result);
  }
  return result;
}

/** @param {string} root @param {string} relativePath @returns {PreparedDestination} */
function prepareDestination(root, relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const parent = path.posix.dirname(normalized);
  const parentResult = resolveContainedPath(
    root,
    parent === "." ? "." : parent,
    {
      allowRoot: parent === ".",
      type: "directory"
    }
  );
  if (!parentResult.ok) {
    throw pathError(parent, parentResult);
  }
  const destination = resolveContainedPath(root, normalized, {
    type: "file"
  });
  if (destination.ok) {
    return destination;
  }
  if (destination.status === "missing" && destination.path !== null) {
    return {
      ...destination,
      status: "missing",
      path: destination.path
    };
  }
  throw pathError(normalized, destination);
}

/** @param {unknown} root @param {unknown} relativePath
 * @param {{allowRoot?: boolean, type?: "file" | "directory"}} [policy] @returns {ContainedPathResult} */
function resolveContainedPath(root, relativePath, policy = {}) {
  const canonicalRoot = resolveWriteRoot(root);
  if (!canonicalRoot.ok) {
    return canonicalRoot;
  }
  if (relativePath === "." && policy.allowRoot) {
    return canonicalRoot;
  }
  if (!isSafeRelativePath(relativePath)) {
    return pathFailure(
      canonicalRoot.root,
      typeof relativePath === "string" ? relativePath : null,
      "Repository paths must be bounded relative paths.",
      "INVALID_RELATIVE_PATH"
    );
  }
  const normalized = String(relativePath)
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
  const type = policy.type === "directory" ? "directory" : "file";
  const existing = resolveRepositoryPath(canonicalRoot.root, normalized, type);
  if (existing.ok) {
    return {
      ok: true,
      status: "ok",
      root: existing.root,
      path: existing.path,
      relativePath: existing.relative_path,
      stat: existing.stat
    };
  }
  if (existing.status !== "missing") {
    return pathFailure(
      canonicalRoot.root,
      existing.relative_path,
      existing.diagnostic,
      "UNSAFE_PATH"
    );
  }
  return {
    ok: false,
    status: "missing",
    root: canonicalRoot.root,
    path: path.join(canonicalRoot.root, ...normalized.split("/")),
    relativePath: normalized,
    reason: existing.diagnostic,
    code: "PATH_MISSING"
  };
}

/** @param {unknown} root @returns {ContainedPathResult} */
function resolveWriteRoot(root) {
  const result = canonicalizeRepositoryRoot(String(root), true);
  if (!result.ok) {
    return pathFailure(
      null,
      null,
      result.diagnostic,
      "ROOT_REALPATH_FAILED",
      result.status
    );
  }
  return {
    ok: true,
    status: "ok",
    root: result.root,
    path: result.path,
    relativePath: result.relative_path,
    stat: result.stat
  };
}

/** @param {string | null} root @param {string | null} relativePath
 * @param {string} reason @param {string} code
 * @param {ContainedPathFailure["status"]} [status]
 * @returns {ContainedPathFailure} */
function pathFailure(root, relativePath, reason, code, status = "rejected") {
  return {
    ok: false,
    status,
    root,
    path: null,
    relativePath,
    reason,
    code
  };
}

/** @param {fs.Stats} before @param {fs.Stats} after @returns {boolean} */
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

/** @param {string} relativePath @param {ContainedPathFailure} result */
function pathError(relativePath, result) {
  return Object.assign(
    new Error(
      `${relativePath}: ${result.reason} (${result.status}).`
    ),
    {
      code: result.code || "UNSAFE_PATH",
      pathResult: result
    }
  );
}

/** @param {unknown} error @returns {string} */
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
