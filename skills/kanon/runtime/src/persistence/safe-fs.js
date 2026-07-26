import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  resolveContainedPath,
  sanitizeFilenameComponent
} from "../path-security.js";
import { readTextResult } from "../scanner/read.js";

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
    fs.mkdirSync(result.path, { mode: 0o700, recursive: false });
    result = resolveContainedPath(root, current, { type: "directory" });
    if (!result.ok) {
      throw pathError(current, result);
    }
  }
  return resolveContainedPath(root, relativePath, { type: "directory" });
}

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
  if (temp.status !== "missing") {
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

export function readContainedText(
  root,
  relativePath,
  maximumBytes,
  options = {}
) {
  const result = readTextResult(root, relativePath, {
    limit: maximumBytes + 1,
    optional: options.optional
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

export function listContainedDirectory(root, relativePath) {
  const directory = resolveContainedPath(root, relativePath, {
    type: "directory"
  });
  if (!directory.ok) {
    throw pathError(relativePath, directory);
  }
  return fs.readdirSync(directory.path, { withFileTypes: true });
}

export function containedFileStat(root, relativePath, options = {}) {
  const result = resolveContainedPath(root, relativePath, { type: "file" });
  if (!result.ok && !(options.optional && result.status === "missing")) {
    throw pathError(relativePath, result);
  }
  return result;
}

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
  if (destination.ok || destination.status === "missing") {
    return destination;
  }
  throw pathError(normalized, destination);
}

function pathError(relativePath, result) {
  const error = new Error(
    `${relativePath}: ${result.reason} (${result.status}).`
  );
  error.code = result.code || "UNSAFE_PATH";
  error.pathResult = result;
  return error;
}
