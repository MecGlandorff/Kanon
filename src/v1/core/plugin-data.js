import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  isBoundedString,
  isNonnegativeSafeInteger
} from "./trust.js";

const MAX_PLUGIN_DATA_FILE_BYTES = 1024 * 1024;

/**
 * @typedef {{
 *   ok: true,
 *   root: string,
 *   repository_root: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} PluginDataRootResult
 * @typedef {{
 *   ok: true,
 *   found: true,
 *   text: string
 * } | {
 *   ok: true,
 *   found: false
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} PluginDataReadResult
 * @typedef {{
 *   ok: true
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} PluginDataWriteResult
 */

/**
 * Select only a canonical, private, user-owned plugin-data directory that is
 * neither inside nor an ancestor of the inspected repository.
 *
 * @param {unknown} pluginDataRoot
 * @param {unknown} repositoryRoot
 * @returns {PluginDataRootResult}
 */
export function resolveExternalPluginDataRoot(
  pluginDataRoot,
  repositoryRoot
) {
  const plugin = inspectDirectory(pluginDataRoot, true);
  const repository = inspectDirectory(repositoryRoot, false);
  if (
    !plugin.ok ||
    !repository.ok ||
    containsPath(repository.root, plugin.root) ||
    containsPath(plugin.root, repository.root)
  ) {
    return pluginDataFailure();
  }
  return {
    ok: true,
    root: plugin.root,
    repository_root: repository.root
  };
}

/**
 * Read one fixed-name plugin-data file through a bounded no-follow descriptor.
 *
 * @param {unknown} pluginDataRoot
 * @param {unknown} fileName
 * @param {unknown} maximumBytes
 * @returns {PluginDataReadResult}
 */
export function readPluginDataText(
  pluginDataRoot,
  fileName,
  maximumBytes
) {
  const root = inspectDirectory(pluginDataRoot, true);
  if (
    !root.ok ||
    !validFileName(fileName) ||
    !validMaximum(maximumBytes)
  ) {
    return pluginDataFailure();
  }
  const file = path.join(root.root, fileName);
  let descriptor;
  try {
    const selected = fs.lstatSync(file);
    if (
      !selected.isFile() ||
      selected.isSymbolicLink() ||
      selected.nlink !== 1 ||
      selected.size > maximumBytes
    ) {
      return pluginDataFailure();
    }
    descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
    );
    const opened = fs.fstatSync(descriptor);
    const afterOpen = fs.lstatSync(file);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > maximumBytes ||
      !sameIdentity(opened, afterOpen)
    ) {
      return pluginDataFailure();
    }
    const buffer = Buffer.alloc(maximumBytes + 1);
    const bytes = fs.readSync(
      descriptor,
      buffer,
      0,
      buffer.length,
      0
    );
    const afterRead = fs.fstatSync(descriptor);
    if (
      bytes > maximumBytes ||
      afterRead.size !== bytes ||
      !sameIdentity(opened, afterRead)
    ) {
      return pluginDataFailure();
    }
    return {
      ok: true,
      found: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, bytes)
      )
    };
  } catch (error) {
    return isMissingFile(error)
      ? { ok: true, found: false }
      : pluginDataFailure();
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Best-effort closure of this process's read-only descriptor.
      }
    }
  }
}

/**
 * Atomically replace one fixed-name plugin-data file. Existing links,
 * non-files, and multiply-linked files fail closed.
 *
 * @param {unknown} pluginDataRoot
 * @param {unknown} fileName
 * @param {unknown} contents
 * @param {unknown} maximumBytes
 * @returns {PluginDataWriteResult}
 */
export function atomicWritePluginDataText(
  pluginDataRoot,
  fileName,
  contents,
  maximumBytes
) {
  const root = inspectDirectory(pluginDataRoot, true);
  if (
    !root.ok ||
    !validFileName(fileName) ||
    !validMaximum(maximumBytes) ||
    typeof contents !== "string" ||
    Buffer.byteLength(contents, "utf8") > maximumBytes
  ) {
    return pluginDataFailure();
  }
  const target = path.join(root.root, fileName);
  const temporary = path.join(
    root.root,
    `.${fileName}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  let descriptor;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_WRONLY |
        (fs.constants.O_NOFOLLOW || 0),
      0o600
    );
    fs.writeFileSync(descriptor, contents, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (fs.existsSync(target)) {
      const selected = fs.lstatSync(target);
      if (
        !selected.isFile() ||
        selected.isSymbolicLink() ||
        selected.nlink !== 1
      ) {
        return pluginDataFailure();
      }
    }
    fs.renameSync(temporary, target);
    syncDirectoryBestEffort(root.root);
    return { ok: true };
  } catch {
    return pluginDataFailure();
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Best-effort closure of this process's private descriptor.
      }
    }
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The rename succeeded or the temporary file was never created.
    }
  }
}

/**
 * @param {unknown} value
 * @param {boolean} requirePrivate
 * @returns {{
 *   ok: true,
 *   root: string
 * } | {
 *   ok: false
 * }}
 */
function inspectDirectory(value, requirePrivate) {
  if (!isBoundedString(value, 8_192) || !path.isAbsolute(value)) {
    return { ok: false };
  }
  try {
    const selected = fs.lstatSync(value);
    const canonical = realpath(value);
    const owned =
      typeof process.getuid !== "function" ||
      selected.uid === process.getuid();
    const privateMode =
      process.platform === "win32" ||
      (selected.mode & 0o022) === 0;
    if (
      !selected.isDirectory() ||
      selected.isSymbolicLink() ||
      !samePath(path.resolve(value), canonical) ||
      samePath(canonical, path.parse(canonical).root) ||
      (requirePrivate && (!owned || !privateMode))
    ) {
      return { ok: false };
    }
    return { ok: true, root: canonical };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function validFileName(value) {
  return (
    isBoundedString(value, 128) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(value) &&
    path.basename(value) === value
  );
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function validMaximum(value) {
  return (
    isNonnegativeSafeInteger(value) &&
    value > 0 &&
    value <= MAX_PLUGIN_DATA_FILE_BYTES
  );
}

/**
 * @param {fs.Stats} left
 * @param {fs.Stats} right
 * @returns {boolean}
 */
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

/**
 * @param {string} parent
 * @param {string} candidate
 * @returns {boolean}
 */
function containsPath(parent, candidate) {
  const relative = path.relative(parent, candidate);
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
 * @returns {boolean}
 */
function isMissingFile(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/**
 * @param {string} directory
 * @returns {void}
 */
function syncDirectoryBestEffort(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(descriptor);
  } catch {
    // Directory fsync is unavailable on some supported filesystems.
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Best-effort closure of the directory descriptor.
      }
    }
  }
}

/**
 * @returns {{
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: "Plugin data is unavailable or invalid."
 * }}
 */
function pluginDataFailure() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic: "Plugin data is unavailable or invalid."
  };
}
