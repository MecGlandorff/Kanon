import crypto from "node:crypto";
import { isRecord } from "../adapters/shared.js";
import {
  atomicWritePluginDataText,
  readPluginDataText,
  resolveExternalPluginDataRoot
} from "../core/plugin-data.js";

const CACHE_FILE = "deprecation-status-v1.json";
const CACHE_SCHEMA = "kanon-deprecation-cache-v1";
const MAX_CACHE_BYTES = 8 * 1024;
const MAX_CACHE_ENTRIES = 8;
export const DEPRECATION_CACHE_TTL_MS = 60 * 60 * 1_000;

/**
 * @typedef {{
 *   host: "codex-cli" | "claude-code",
 *   id: string
 * }} HostSession
 * @typedef {{
 *   session_key: string,
 *   package_name: string,
 *   package_version: string,
 *   status: "Current",
 *   checked_at: number,
 *   expires_at: number
 * } | {
 *   session_key: string,
 *   package_name: string,
 *   package_version: string,
 *   status: "Deprecated",
 *   reason: string,
 *   checked_at: number,
 *   expires_at: number
 * }} DeprecationCacheEntry
 * @typedef {{
 *   package_name: string,
 *   package_version: string,
 *   status: "Current",
 *   checked_at: number,
 *   expires_at: number
 * } | {
 *   package_name: string,
 *   package_version: string,
 *   status: "Deprecated",
 *   reason: string,
 *   checked_at: number,
 *   expires_at: number
 * }} DeprecationCacheWriteEntry
 * @typedef {{
 *   schema: "kanon-deprecation-cache-v1",
 *   entries: DeprecationCacheEntry[]
 * }} DeprecationCacheDocument
 * @typedef {{
 *   ok: true,
 *   hit: true,
 *   entry: DeprecationCacheEntry
 * } | {
 *   ok: true,
 *   hit: false
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} CacheReadResult
 * @typedef {{
 *   ok: true
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} CacheWriteResult
 */

/**
 * @param {unknown} pluginDataRoot
 * @param {unknown} hostSession
 * @param {string} packageName
 * @param {string} packageVersion
 * @param {number} now
 * @returns {CacheReadResult}
 */
export function readDeprecationCache(
  pluginDataRoot,
  hostSession,
  packageName,
  packageVersion,
  now
) {
  const scope = resolveCacheScope(pluginDataRoot, hostSession);
  if (!scope.ok) {
    return scope;
  }
  const loaded = readDocument(scope.root);
  if (!loaded.ok) {
    return loaded;
  }
  const entry = loaded.value.entries.find(
    (candidate) =>
      candidate.session_key === scope.sessionKey &&
      candidate.package_name === packageName &&
      candidate.package_version === packageVersion &&
      candidate.checked_at <= now &&
      candidate.expires_at > now
  );
  return entry
    ? { ok: true, hit: true, entry }
    : { ok: true, hit: false };
}

/**
 * @param {unknown} pluginDataRoot
 * @param {unknown} hostSession
 * @param {DeprecationCacheWriteEntry} entry
 * @param {number} now
 * @returns {CacheWriteResult}
 */
export function writeDeprecationCache(
  pluginDataRoot,
  hostSession,
  entry,
  now
) {
  const scope = resolveCacheScope(pluginDataRoot, hostSession);
  if (!scope.ok) {
    return scope;
  }
  const loaded = readDocument(scope.root);
  const retained = loaded.ok
    ? loaded.value.entries.filter(
        (candidate) =>
          candidate.session_key !== scope.sessionKey &&
          candidate.expires_at > now
      )
    : [];
  retained.sort((left, right) => right.checked_at - left.checked_at);
  const document = {
    schema: CACHE_SCHEMA,
    entries: [
      { ...entry, session_key: scope.sessionKey },
      ...retained.slice(0, MAX_CACHE_ENTRIES - 1)
    ]
  };
  if (!isCacheDocument(document)) {
    return cacheFailure();
  }
  return writeDocument(scope.root, document);
}

/**
 * @param {unknown} pluginDataRoot
 * @param {unknown} hostSession
 * @returns {CacheWriteResult}
 */
export function endDeprecationSession(pluginDataRoot, hostSession) {
  const scope = resolveCacheScope(pluginDataRoot, hostSession);
  if (!scope.ok) {
    return scope;
  }
  const loaded = readDocument(scope.root);
  if (!loaded.ok) {
    return loaded.status === "Unknown" &&
      loaded.diagnostic === "Deprecation cache is unavailable or invalid."
      ? loaded
      : cacheFailure();
  }
  return writeDocument(scope.root, {
    schema: CACHE_SCHEMA,
    entries: loaded.value.entries.filter(
      (entry) => entry.session_key !== scope.sessionKey
    )
  });
}

/**
 * @param {unknown} pluginDataRoot
 * @param {unknown} hostSession
 * @returns {{
 *   ok: true,
 *   root: string,
 *   sessionKey: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }}
 */
function resolveCacheScope(pluginDataRoot, hostSession) {
  if (!isHostSession(hostSession)) {
    return cacheFailure();
  }
  try {
    const selected = resolveExternalPluginDataRoot(
      pluginDataRoot,
      process.cwd()
    );
    if (!selected.ok) {
      return cacheFailure();
    }
    return {
      ok: true,
      root: selected.root,
      sessionKey: crypto
        .createHash("sha256")
        .update(`${hostSession.host}\0${hostSession.id}`, "utf8")
        .digest("hex")
    };
  } catch {
    return cacheFailure();
  }
}

/**
 * @param {unknown} value
 * @returns {value is HostSession}
 */
function isHostSession(value) {
  return (
    isRecord(value) &&
    exactKeys(value, ["host", "id"]) &&
    (value.host === "codex-cli" || value.host === "claude-code") &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 256
  );
}

/**
 * @param {string} root
 * @returns {{
 *   ok: true,
 *   value: DeprecationCacheDocument
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }}
 */
function readDocument(root) {
  const loaded = readPluginDataText(
    root,
    CACHE_FILE,
    MAX_CACHE_BYTES
  );
  if (!loaded.ok) {
    return cacheFailure();
  }
  if (!loaded.found) {
    return {
      ok: true,
      value: { schema: CACHE_SCHEMA, entries: [] }
    };
  }
  try {
    const value = JSON.parse(loaded.text);
    return isCacheDocument(value)
      ? { ok: true, value }
      : cacheFailure();
  } catch {
    return cacheFailure();
  }
}

/**
 * @param {string} root
 * @param {DeprecationCacheDocument} document
 * @returns {CacheWriteResult}
 */
function writeDocument(root, document) {
  if (!isCacheDocument(document)) {
    return cacheFailure();
  }
  const written = atomicWritePluginDataText(
    root,
    CACHE_FILE,
    `${JSON.stringify(document)}\n`,
    MAX_CACHE_BYTES
  );
  return written.ok ? { ok: true } : cacheFailure();
}

/**
 * @param {unknown} value
 * @returns {value is DeprecationCacheDocument}
 */
function isCacheDocument(value) {
  return (
    isRecord(value) &&
    exactKeys(value, ["entries", "schema"]) &&
    value.schema === CACHE_SCHEMA &&
    Array.isArray(value.entries) &&
    value.entries.length <= MAX_CACHE_ENTRIES &&
    value.entries.every(isCacheEntry)
  );
}

/**
 * @param {unknown} value
 * @returns {value is DeprecationCacheEntry}
 */
function isCacheEntry(value) {
  if (
    !isRecord(value) ||
    (value.status !== "Current" && value.status !== "Deprecated") ||
    !/^[0-9a-f]{64}$/.test(
      typeof value.session_key === "string" ? value.session_key : ""
    ) ||
    !boundedString(value.package_name, 214) ||
    !boundedString(value.package_version, 128) ||
    !isSafeInteger(value.checked_at) ||
    !isSafeInteger(value.expires_at) ||
    value.checked_at < 0 ||
    value.expires_at <= value.checked_at ||
    value.expires_at - value.checked_at > DEPRECATION_CACHE_TTL_MS
  ) {
    return false;
  }
  return value.status === "Current"
    ? exactKeys(value, [
        "checked_at",
        "expires_at",
        "package_name",
        "package_version",
        "session_key",
        "status"
      ])
    : exactKeys(value, [
        "checked_at",
        "expires_at",
        "package_name",
        "package_version",
        "reason",
        "session_key",
        "status"
      ]) &&
        boundedString(value.reason, 512) &&
        !/[<>`\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(
          value.reason
        );
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * @param {Record<string, unknown>} value
 * @param {string[]} keys
 * @returns {boolean}
 */
function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is string}
 */
function boundedString(value, maximum) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum
  );
}

/**
 * @returns {{
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: "Deprecation cache is unavailable or invalid."
 * }}
 */
function cacheFailure() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic: "Deprecation cache is unavailable or invalid."
  };
}
