import crypto from "node:crypto";
import fs from "node:fs";
import { resolveContainedPath } from "../path-security.js";
export {
  assertContainedPath,
  resolveContainedPath,
  sanitizeFilenameComponent
} from "../path-security.js";

/**
 * @typedef {{
 *   maxBytes: number,
 *   bytesHashed: number
 * }} HashBudget
 * @typedef {{
 *   ok: false,
 *   status: string,
 *   relativePath: string | null,
 *   reason: string,
 *   code: string
 * }} HashFailure
 * @typedef {{
 *   maxFileBytes?: number,
 *   hashBudget?: HashBudget,
 *   onFailure?: (failure: HashFailure) => void
 * }} HashOptions
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeRelPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

/**
 * @param {unknown} root
 * @param {unknown} relPath
 * @param {number} size
 * @param {HashOptions} [options]
 * @returns {string | null}
 */
export function hashFile(root, relPath, size, options = {}) {
  const maxFileBytes = options.maxFileBytes ?? 750_000;
  const hashBudget = options.hashBudget;
  try {
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > maxFileBytes ||
      (
        hashBudget !== undefined &&
        hashBudget.bytesHashed + size > hashBudget.maxBytes
      )
    ) {
      return null;
    }
    const resolved = resolveContainedPath(root, relPath, { type: "file" });
    if (!resolved.ok) {
      options.onFailure?.(resolved);
      return null;
    }
    const noFollow = Number(fs.constants.O_NOFOLLOW) || 0;
    const fd = fs.openSync(
      resolved.path,
      fs.constants.O_RDONLY | noFollow
    );
    try {
      const stat = fs.fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.size !== size ||
        (
          resolved.stat.dev !== undefined &&
          resolved.stat.ino !== undefined &&
          (
            resolved.stat.dev !== stat.dev ||
            resolved.stat.ino !== stat.ino
          )
        )
      ) {
        options.onFailure?.({
          ok: false,
          status: "rejected",
          relativePath: resolved.relativePath,
          reason: "The file changed before hashing.",
          code: "FILE_REPLACED_DURING_HASH"
        });
        return null;
      }
      const buffer = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const bytes = fs.readSync(
          fd,
          buffer,
          offset,
          size - offset,
          offset
        );
        if (bytes === 0) {
          break;
        }
        offset += bytes;
      }
      if (offset !== size) {
        return null;
      }
      if (hashBudget) {
        hashBudget.bytesHashed += offset;
      }
      return crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    options.onFailure?.({
      ok: false,
      status: errorCode(error) === "ENOENT" ? "missing" : "unreadable",
      relativePath: normalizeRelPath(relPath),
      reason: "The contained file could not be hashed safely.",
      code: errorCode(error) || "SAFE_HASH_FAILED"
    });
    return null;
  }
}

/**
 * @param {unknown} value
 * @param {number} [limit]
 * @returns {string}
 */
export function normalizeExcerpt(value, limit = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
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
