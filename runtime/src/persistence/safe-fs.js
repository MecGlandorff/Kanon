import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  resolveContainedPath,
  sanitizeFilenameComponent
} from "../path-security.js";
import { readTextResult } from "../scanner/read.js";

/**
 * @typedef {import("../path-security.js").ContainedPathSuccess |
 *   (import("../path-security.js").ContainedPathFailure & {
 *     status: "missing",
 *     path: string
 *   })} PreparedDestination
 */

/**
 * @param {string} root
 * @param {string} relativePath
 * @returns {import("../path-security.js").ContainedPathResult}
 */
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

/**
 * @param {string} root
 * @param {string} relativePath
 * @param {string} contents
 * @returns {void}
 */
export function atomicWriteContained(root, relativePath, contents) {
  const destination = prepareDestination(root, relativePath);
  const parentRelative = path.posix.dirname(
    relativePath.replaceAll("\\", "/")
  );
  const tempName =
    `.${sanitizeFilenameComponent(path.posix.basename(relativePath))}.` +
    `${process.pid}.${crypto.randomUUID()}.tmp`;
  const tempRelative = parentRelative === "."
    ? tempName
    : `${parentRelative}/${tempName}`;
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
    fd = fs.openSync(
      temp.path,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_WRONLY |
        noFollow,
      0o600
    );
    fs.writeFileSync(fd, contents, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    prepareDestination(root, relativePath);
    fs.renameSync(temp.path, destination.path);
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
    try {
      fs.unlinkSync(temp.path);
    } catch {
      // The rename succeeded or the temporary file was never created.
    }
  }
}

/**
 * @param {string} root
 * @param {string} relativePath
 * @param {string} contents
 * @returns {void}
 */
export function appendContained(root, relativePath, contents) {
  const destination = prepareDestination(root, relativePath);
  const noFollow = Number(fs.constants.O_NOFOLLOW) || 0;
  const fd = fs.openSync(
    destination.path,
    fs.constants.O_APPEND |
      fs.constants.O_CREAT |
      fs.constants.O_WRONLY |
      noFollow,
    0o600
  );
  try {
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      (
        destination.ok &&
        destination.stat.dev !== undefined &&
        destination.stat.ino !== undefined &&
        (
          destination.stat.dev !== stat.dev ||
          destination.stat.ino !== stat.ino
        )
      )
    ) {
      throw new Error(
        `${relativePath}: append target changed after containment validation.`
      );
    }
    fs.writeFileSync(fd, contents, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @param {string} root
 * @param {string} relativePath
 * @param {number} maximumBytes
 * @param {{optional?: boolean}} [options]
 * @returns {ReturnType<typeof readTextResult>}
 */
export function readContainedText(
  root,
  relativePath,
  maximumBytes,
  options = {}
) {
  const result = readTextResult(root, relativePath, {
    limit: maximumBytes + 1,
    ...(options.optional === undefined
      ? {}
      : { optional: options.optional })
  });
  if (!result.ok) {
    return result;
  }
  if (result.truncated || result.size > maximumBytes) {
    return {
      ok: false,
      status: "budget-exceeded",
      relativePath,
      reason: `The input exceeds its ${maximumBytes}-byte limit.`,
      code: "INPUT_SIZE_LIMIT"
    };
  }
  return result;
}

/**
 * @param {string} root
 * @param {string} relativePath
 * @returns {fs.Dirent[]}
 */
export function listContainedDirectory(root, relativePath) {
  const directory = resolveContainedPath(root, relativePath, {
    type: "directory"
  });
  if (!directory.ok) {
    throw pathError(relativePath, directory);
  }
  return fs.readdirSync(directory.path, { withFileTypes: true });
}

/**
 * @param {string} root
 * @param {string} relativePath
 * @param {{optional?: boolean}} [options]
 * @returns {import("../path-security.js").ContainedPathResult}
 */
export function containedFileStat(root, relativePath, options = {}) {
  const result = resolveContainedPath(root, relativePath, { type: "file" });
  if (!result.ok && !(options.optional && result.status === "missing")) {
    throw pathError(relativePath, result);
  }
  return result;
}

/**
 * @param {string} root
 * @param {string} relativePath
 * @returns {PreparedDestination}
 */
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

/**
 * @param {string} relativePath
 * @param {import("../path-security.js").ContainedPathFailure} result
 */
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
