import {
  DEPRECATION_CACHE_TTL_MS,
  readDeprecationCache,
  writeDeprecationCache
} from "./cache.js";
import {
  readEmbeddedBuildMetadata,
  validateEmbeddedBuildMetadata
} from "../core/build-metadata.js";
import { isRecord } from "../adapters/shared.js";
import {
  fixedRegistryTransport,
  MAX_REGISTRY_REDIRECTS,
  MAX_REGISTRY_RESPONSE_BYTES,
  REGISTRY_ORIGIN,
  REGISTRY_TIMEOUT_MS
} from "./transport.js";
import {
  renderDeprecationWarning,
  sanitizeRegistryText
} from "./sanitize.js";

/**
 * @typedef {import("./transport.js").RegistryTransport} RegistryTransport
 * @typedef {{
 *   ok: true,
 *   status: "Current",
 *   package_name: string,
 *   installed_version: string,
 *   checked_at: number,
 *   cache: "hit" | "updated" | "unavailable",
 *   diagnostics: string[]
 * } | {
 *   ok: true,
 *   status: "Deprecated",
 *   package_name: string,
 *   installed_version: string,
 *   reason: string,
 *   warning: string,
 *   checked_at: number,
 *   cache: "hit" | "updated" | "unavailable",
 *   diagnostics: string[]
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   package_name?: string,
 *   installed_version?: string,
 *   diagnostic: string,
 *   diagnostics: string[]
 * }} DeprecationStatus
 * @typedef {{
 *   metadata?: unknown,
 *   host_session?: unknown,
 *   plugin_data_root?: unknown,
 *   transport?: RegistryTransport,
 *   now?: number,
 *   refresh?: boolean
 * }} DeprecationCheckOptions
 * @typedef {{
 *   ok: true,
 *   status: "Current",
 *   checked_at: number
 * } | {
 *   ok: true,
 *   status: "Deprecated",
 *   reason: string,
 *   checked_at: number
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} LiveStatus
 */

/**
 * @param {unknown} [optionsInput]
 * @returns {Promise<DeprecationStatus>}
 */
export async function checkExactVersionDeprecation(optionsInput = {}) {
  if (!isCheckOptions(optionsInput)) {
    return {
      ok: false,
      status: "Unknown",
      diagnostic: "Deprecation check input is unavailable or invalid.",
      diagnostics: []
    };
  }
  const options = optionsInput;
  const metadata = options.metadata === undefined
    ? readEmbeddedBuildMetadata()
    : validateEmbeddedBuildMetadata(options.metadata);
  if (!metadata.ok) {
    return {
      ok: false,
      status: "Unknown",
      diagnostic: "Installed package metadata is unavailable or invalid.",
      diagnostics: []
    };
  }
  const packageName = metadata.value.package_name;
  const installedVersion = metadata.value.package_version;
  const now = validNow(options.now) ? options.now : Date.now();
  const refresh = options.refresh === true;
  const cached = readDeprecationCache(
    options.plugin_data_root,
    options.host_session,
    packageName,
    installedVersion,
    now
  );
  const cacheDiagnostics = cached.ok
    ? []
    : [cached.diagnostic];
  if (cached.ok && cached.hit && !refresh) {
    return statusFromCache(cached.entry, "hit", cacheDiagnostics);
  }

  const live = await queryExactVersion(
    packageName,
    installedVersion,
    options.transport || fixedRegistryTransport,
    now
  );
  if (!live.ok) {
    if (cached.ok && cached.hit) {
      return statusFromCache(
        cached.entry,
        "hit",
        [...cacheDiagnostics, live.diagnostic]
      );
    }
    return {
      ok: false,
      status: "Unknown",
      package_name: packageName,
      installed_version: installedVersion,
      diagnostic: live.diagnostic,
      diagnostics: cacheDiagnostics
    };
  }

  /** @type {import("./cache.js").DeprecationCacheWriteEntry} */
  const entry = live.status === "Deprecated"
    ? {
        package_name: packageName,
        package_version: installedVersion,
        status: "Deprecated",
        reason: live.reason,
        checked_at: live.checked_at,
        expires_at: live.checked_at + DEPRECATION_CACHE_TTL_MS
      }
    : {
        package_name: packageName,
        package_version: installedVersion,
        status: "Current",
        checked_at: live.checked_at,
        expires_at: live.checked_at + DEPRECATION_CACHE_TTL_MS
      };
  const stored = writeDeprecationCache(
    options.plugin_data_root,
    options.host_session,
    entry,
    now
  );
  const diagnostics = boundedDiagnostics([
    ...cacheDiagnostics,
    ...(stored.ok ? [] : [stored.diagnostic])
  ]);
  return live.status === "Deprecated"
    ? {
        ok: true,
        status: "Deprecated",
        package_name: packageName,
        installed_version: installedVersion,
        reason: live.reason,
        warning: renderDeprecationWarning(installedVersion, live.reason),
        checked_at: live.checked_at,
        cache: stored.ok ? "updated" : "unavailable",
        diagnostics
      }
    : {
        ok: true,
        status: "Current",
        package_name: packageName,
        installed_version: installedVersion,
        checked_at: live.checked_at,
        cache: stored.ok ? "updated" : "unavailable",
        diagnostics
      };
}

/**
 * @param {string} packageName
 * @param {string} installedVersion
 * @param {RegistryTransport} transport
 * @param {number} now
 * @returns {Promise<LiveStatus>}
 */
async function queryExactVersion(
  packageName,
  installedVersion,
  transport,
  now
) {
  let url = exactVersionUrl(packageName, installedVersion);
  for (let redirects = 0; redirects <= MAX_REGISTRY_REDIRECTS; redirects += 1) {
    let raw;
    try {
      raw = await transport({
        url: url.href,
        timeout_ms: REGISTRY_TIMEOUT_MS,
        max_response_bytes: MAX_REGISTRY_RESPONSE_BYTES
      });
    } catch {
      return unknownLive("Registry transport was unavailable.");
    }
    const response = validateTransportResult(raw);
    if (!response.ok) {
      return unknownLive(transportDiagnostic(response.failure));
    }
    if (isRedirectStatus(response.status_code)) {
      if (redirects === MAX_REGISTRY_REDIRECTS) {
        return unknownLive("Registry redirect limit was exceeded.");
      }
      const redirected = sameOriginRedirect(url, response.location);
      if (!redirected.ok) {
        return unknownLive("Registry redirect was unavailable or unsafe.");
      }
      url = redirected.url;
      continue;
    }
    if (response.status_code !== 200) {
      return unknownLive("Registry returned an unsupported status.");
    }
    if (!/^application\/json(?:;|$)/i.test(response.content_type)) {
      return unknownLive("Registry response type was unavailable or invalid.");
    }
    if (Buffer.byteLength(response.body) > MAX_REGISTRY_RESPONSE_BYTES) {
      return unknownLive("Registry response exceeded the size limit.");
    }
    return parseRegistryManifest(
      response.body,
      packageName,
      installedVersion,
      now
    );
  }
  return unknownLive("Registry redirect limit was exceeded.");
}

/**
 * @param {string} packageName
 * @param {string} installedVersion
 * @returns {URL}
 */
function exactVersionUrl(packageName, installedVersion) {
  const encodedPackage = encodeURIComponent(packageName).replace("%40", "@");
  return new URL(
    `/${encodedPackage}/${encodeURIComponent(installedVersion)}`,
    REGISTRY_ORIGIN
  );
}

/**
 * @param {string} body
 * @param {string} packageName
 * @param {string} installedVersion
 * @param {number} now
 * @returns {LiveStatus}
 */
function parseRegistryManifest(body, packageName, installedVersion, now) {
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return unknownLive("Registry response was malformed.");
  }
  if (
    !isRecord(value) ||
    value.name !== packageName ||
    value.version !== installedVersion ||
    (value.deprecated !== undefined && typeof value.deprecated !== "string")
  ) {
    return unknownLive("Registry response was malformed.");
  }
  if (value.deprecated === undefined) {
    return {
      ok: true,
      status: "Current",
      checked_at: now
    };
  }
  const reason = sanitizeRegistryText(value.deprecated);
  return reason.ok
    ? {
        ok: true,
        status: "Deprecated",
        reason: reason.value,
        checked_at: now
      }
    : unknownLive("Registry deprecation text was malformed.");
}

/**
 * @param {unknown} value
 * @returns {import("./transport.js").RegistryTransportResult}
 */
function validateTransportResult(value) {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return transportFailure("transport");
  }
  if (value.ok === false) {
    return (
      value.status === "Unknown" &&
      (value.failure === "offline" ||
        value.failure === "timeout" ||
        value.failure === "oversized" ||
        value.failure === "transport")
    )
      ? {
          ok: false,
          status: "Unknown",
          failure: value.failure
        }
      : transportFailure("transport");
  }
  if (
    !isHttpStatus(value.status_code) ||
    typeof value.content_type !== "string" ||
    value.content_type.length > 256 ||
    typeof value.body !== "string" ||
    (value.location !== undefined &&
      (typeof value.location !== "string" || value.location.length > 2_048))
  ) {
    return transportFailure("transport");
  }
  return {
    ok: true,
    status_code: value.status_code,
    content_type: value.content_type,
    ...(value.location === undefined ? {} : { location: value.location }),
    body: value.body
  };
}

/**
 * @param {URL} current
 * @param {string | undefined} location
 * @returns {{ok: true, url: URL} | {ok: false}}
 */
function sameOriginRedirect(current, location) {
  if (!location) {
    return { ok: false };
  }
  try {
    const url = new URL(location, current);
    return (
      url.origin === REGISTRY_ORIGIN &&
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    )
      ? { ok: true, url }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {import("./cache.js").DeprecationCacheEntry} entry
 * @param {"hit"} cache
 * @param {string[]} diagnostics
 * @returns {DeprecationStatus}
 */
function statusFromCache(entry, cache, diagnostics) {
  return entry.status === "Deprecated"
    ? {
        ok: true,
        status: "Deprecated",
        package_name: entry.package_name,
        installed_version: entry.package_version,
        reason: entry.reason,
        warning: renderDeprecationWarning(entry.package_version, entry.reason),
        checked_at: entry.checked_at,
        cache,
        diagnostics: diagnostics.slice(0, 4)
      }
    : {
        ok: true,
        status: "Current",
        package_name: entry.package_name,
        installed_version: entry.package_version,
        checked_at: entry.checked_at,
        cache,
        diagnostics: diagnostics.slice(0, 4)
      };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function validNow(value) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isHttpStatus(value) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
  );
}

/**
 * @param {number} status
 * @returns {boolean}
 */
function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 307 || status === 308;
}

/**
 * @param {"offline" | "timeout" | "oversized" | "transport"} failure
 * @returns {string}
 */
function transportDiagnostic(failure) {
  switch (failure) {
    case "offline":
      return "Registry status is Unknown because the network was unavailable.";
    case "timeout":
      return "Registry status is Unknown because the request timed out.";
    case "oversized":
      return "Registry status is Unknown because the response was oversized.";
    default:
      return "Registry transport was unavailable.";
  }
}

/**
 * @param {string} diagnostic
 * @returns {LiveStatus}
 */
function unknownLive(diagnostic) {
  return {
    ok: false,
    status: "Unknown",
    diagnostic
  };
}

/**
 * @param {"offline" | "timeout" | "oversized" | "transport"} failure
 * @returns {import("./transport.js").RegistryTransportResult}
 */
function transportFailure(failure) {
  return {
    ok: false,
    status: "Unknown",
    failure
  };
}

/**
 * @param {unknown} value
 * @returns {value is DeprecationCheckOptions}
 */
function isCheckOptions(value) {
  if (!isRecord(value)) {
    return false;
  }
  const allowed = new Set([
    "host_session",
    "metadata",
    "now",
    "plugin_data_root",
    "refresh",
    "transport"
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return false;
  }
  return (
    (value.transport === undefined || typeof value.transport === "function") &&
    (value.now === undefined || validNow(value.now)) &&
    (value.refresh === undefined || typeof value.refresh === "boolean")
  );
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function boundedDiagnostics(values) {
  return Array.from(new Set(values)).slice(0, 4);
}
