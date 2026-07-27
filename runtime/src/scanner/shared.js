import crypto from "node:crypto";
import fs from "node:fs";
import { resolveContainedPath } from "../path-security.js";
export {
  assertContainedPath,
  resolveContainedPath,
  sanitizeFilenameComponent
} from "../path-security.js";

export function normalizeRelPath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

export function hashFile(root, relPath, size, options = {}) {
  const maxFileBytes = options.maxFileBytes ?? 750_000;
  try {
    if (
      size > maxFileBytes ||
      options.hashBudget?.bytesHashed + size >
        options.hashBudget?.maxBytes
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
      if (options.hashBudget) {
        options.hashBudget.bytesHashed += offset;
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
      status: error?.code === "ENOENT" ? "missing" : "unreadable",
      relativePath: normalizeRelPath(relPath),
      reason: "The contained file could not be hashed safely.",
      code: error?.code || "SAFE_HASH_FAILED"
    });
    return null;
  }
}

export function normalizeExcerpt(value, limit = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
