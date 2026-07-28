import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  atomicWritePluginDataText,
  readPluginDataText,
  resolveExternalPluginDataRoot
} from "./plugin-data.js";
import {
  isBoundedString,
  sanitizeDisplayText
} from "./trust.js";

const MAX_HANDOFF_BYTES = 64 * 1024;
const MAX_HANDOFF_FILES = 8;
const MAX_HANDOFF_DIRECTORY_BYTES =
  MAX_HANDOFF_BYTES * MAX_HANDOFF_FILES;
const MAX_DIRECTORY_ENTRIES = 256;
const HANDOFF_FILE = /^kanon-agent-handoff-([0-9a-f]{64})\.json$/;
const UNSAFE_PATH_CONTROLS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/**
 * @typedef {{
 *   ok: true,
 *   root: string,
 *   path: string,
 *   file: string,
 *   identity: {
 *     device: number,
 *     inode: number
 *   },
 *   identity_sha256: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} HandoffDestinationResult
 * @typedef {{
 *   ok: true,
 *   text: string,
 *   root: string,
 *   path: string,
 *   file: string,
 *   content_sha256: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} HandoffReadResult
 */

/**
 * Resolve a fixed content-derived filename inside an existing private
 * directory that is outside and not an ancestor of the repository.
 *
 * @param {unknown} destinationRoot
 * @param {unknown} repositoryRoot
 * @param {unknown} contentSha256
 * @returns {HandoffDestinationResult}
 */
export function resolveHandoffDestination(
  destinationRoot,
  repositoryRoot,
  contentSha256
) {
  if (
    typeof contentSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(contentSha256) ||
    !safePathText(destinationRoot)
  ) {
    return destinationFailure();
  }
  const selected = resolveExternalPluginDataRoot(
    destinationRoot,
    repositoryRoot
  );
  if (!selected.ok) {
    return destinationFailure();
  }
  const file = `kanon-agent-handoff-${contentSha256}.json`;
  if (!hasBoundedCapacity(selected.root, file)) {
    return destinationFailure();
  }
  let identity;
  try {
    const stat = fs.lstatSync(selected.root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return destinationFailure();
    }
    identity = {
      device: stat.dev,
      inode: stat.ino
    };
  } catch {
    return destinationFailure();
  }
  return {
    ok: true,
    root: selected.root,
    path: path.join(selected.root, file),
    file,
    identity,
    identity_sha256: sha256DirectoryIdentity(identity)
  };
}

/**
 * @param {{device: number, inode: number}} identity
 * @returns {string}
 */
function sha256DirectoryIdentity(identity) {
  return crypto
    .createHash("sha256")
    .update(`${identity.device}\0${identity.inode}`)
    .digest("hex");
}

/**
 * Keep Kanon-created handoffs bounded without deleting pre-existing user
 * state. Replacing the exact content-derived file is allowed.
 *
 * @param {string} root
 * @param {string} selectedFile
 * @returns {boolean}
 */
function hasBoundedCapacity(root, selectedFile) {
  let directory;
  try {
    directory = fs.opendirSync(root);
    let entries = 0;
    let matching = 0;
    let matchingBytes = 0;
    let selectedExists = false;
    for (;;) {
      const entry = directory.readSync();
      if (entry === null) {
        break;
      }
      entries += 1;
      if (entries > MAX_DIRECTORY_ENTRIES) {
        return false;
      }
      if (!HANDOFF_FILE.test(entry.name)) {
        continue;
      }
      matching += 1;
      if (matching > MAX_HANDOFF_FILES) {
        return false;
      }
      const item = fs.lstatSync(path.join(root, entry.name));
      if (
        !item.isFile() ||
        item.isSymbolicLink() ||
        item.nlink !== 1 ||
        item.size > MAX_HANDOFF_BYTES
      ) {
        return false;
      }
      matchingBytes += item.size;
      if (matchingBytes > MAX_HANDOFF_DIRECTORY_BYTES) {
        return false;
      }
      if (entry.name === selectedFile) {
        selectedExists = true;
      }
    }
    return selectedExists || matching < MAX_HANDOFF_FILES;
  } catch {
    return false;
  } finally {
    try {
      directory?.closeSync();
    } catch {
      // Best-effort closure of the bounded directory iterator.
    }
  }
}

/**
 * @param {HandoffDestinationResult} destination
 * @param {unknown} text
 * @returns {{
 *   ok: true
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }}
 */
export function writeHandoffText(destination, text) {
  if (
    !destination.ok ||
    typeof text !== "string" ||
    Buffer.byteLength(text, "utf8") > MAX_HANDOFF_BYTES ||
    !unchangedDestination(destination)
  ) {
    return destinationFailure();
  }
  const written = atomicWritePluginDataText(
    destination.root,
    destination.file,
    text,
    MAX_HANDOFF_BYTES
  );
  return written.ok ? { ok: true } : destinationFailure();
}

/**
 * Rebind the approved path to the same directory identity immediately before
 * the atomic write. A same-user replacement after this check remains a
 * documented concurrency residual.
 *
 * @param {Extract<HandoffDestinationResult, {ok: true}>} destination
 * @returns {boolean}
 */
function unchangedDestination(destination) {
  try {
    if (
      path.join(destination.root, destination.file) !== destination.path ||
      !Number.isSafeInteger(destination.identity.device) ||
      !Number.isSafeInteger(destination.identity.inode)
    ) {
      return false;
    }
    const stat = fs.lstatSync(destination.root);
    return (
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.dev === destination.identity.device &&
      stat.ino === destination.identity.inode
    );
  } catch {
    return false;
  }
}

/**
 * Read only the exact handoff path supplied to the receiving invocation.
 *
 * @param {unknown} handoffPath
 * @param {unknown} repositoryRoot
 * @returns {HandoffReadResult}
 */
export function readHandoffText(handoffPath, repositoryRoot) {
  if (!safePathText(handoffPath) || !path.isAbsolute(handoffPath)) {
    return destinationFailure();
  }
  const file = path.basename(handoffPath);
  const matched = HANDOFF_FILE.exec(file);
  if (matched === null || path.join(path.dirname(handoffPath), file) !== handoffPath) {
    return destinationFailure();
  }
  const selected = resolveExternalPluginDataRoot(
    path.dirname(handoffPath),
    repositoryRoot
  );
  if (!selected.ok) {
    return destinationFailure();
  }
  const canonicalPath = path.join(selected.root, file);
  if (!samePath(canonicalPath, handoffPath)) {
    return destinationFailure();
  }
  const loaded = readPluginDataText(
    selected.root,
    file,
    MAX_HANDOFF_BYTES
  );
  if (!loaded.ok || !loaded.found) {
    return destinationFailure();
  }
  return {
    ok: true,
    text: loaded.text,
    root: selected.root,
    path: canonicalPath,
    file,
    content_sha256: /** @type {string} */ (matched[1])
  };
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function safePathText(value) {
  return (
    isBoundedString(value, 8_192) &&
    !UNSAFE_PATH_CONTROLS.test(value) &&
    sanitizeDisplayText(value, 8_192, {
      preserveWhitespace: true
    }) === value
  );
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function samePath(left, right) {
  return process.platform === "win32"
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
}

/**
 * @returns {{
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: "The handoff destination or file was unavailable or unsafe."
 * }}
 */
function destinationFailure() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic:
      "The handoff destination or file was unavailable or unsafe."
  };
}
