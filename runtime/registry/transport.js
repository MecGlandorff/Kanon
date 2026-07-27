import https from "node:https";

export const REGISTRY_ORIGIN = "https://registry.npmjs.org";
export const REGISTRY_TIMEOUT_MS = 2_500;
export const MAX_REGISTRY_RESPONSE_BYTES = 64 * 1024;
export const MAX_REGISTRY_REDIRECTS = 2;

/**
 * @typedef {{
 *   url: string,
 *   timeout_ms: number,
 *   max_response_bytes: number
 * }} RegistryTransportRequest
 * @typedef {{
 *   ok: true,
 *   status_code: number,
 *   content_type: string,
 *   location?: string,
 *   body: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   failure: "offline" | "timeout" | "oversized" | "transport"
 * }} RegistryTransportResult
 * @typedef {(request: RegistryTransportRequest) => Promise<unknown>}
 *   RegistryTransport
 */

/**
 * Perform one bounded HTTPS request. Callers still validate this result as an
 * external boundary.
 *
 * @param {RegistryTransportRequest} request
 * @returns {Promise<RegistryTransportResult>}
 */
export function fixedRegistryTransport(request) {
  const selected = validateRequest(request);
  if (!selected.ok) {
    return Promise.resolve(transportFailure("transport"));
  }
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    /**
     * @param {RegistryTransportResult} result
     * @returns {void}
     */
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const networkRequest = https.request(
      selected.url,
      {
        method: "GET",
        agent: false,
        headers: {
          Accept: "application/json",
          "User-Agent": "kanon-exact-version-check/1"
        }
      },
      (response) => {
        const statusCode = response.statusCode;
        if (!isHttpStatus(statusCode)) {
          response.destroy();
          finish(transportFailure("transport"));
          return;
        }
        const contentType = singleHeader(response.headers["content-type"]);
        const location = singleHeader(response.headers.location);
        if (isRedirectStatus(statusCode)) {
          response.destroy();
          finish({
            ok: true,
            status_code: statusCode,
            content_type: contentType,
            ...(location === undefined ? {} : { location }),
            body: ""
          });
          return;
        }

        /** @type {Buffer[]} */
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(String(chunk));
          bytes += buffer.length;
          if (bytes > request.max_response_bytes) {
            response.destroy();
            finish(transportFailure("oversized"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          finish({
            ok: true,
            status_code: statusCode,
            content_type: contentType,
            ...(location === undefined ? {} : { location }),
            body: Buffer.concat(chunks, bytes).toString("utf8")
          });
        });
        response.on("aborted", () => {
          finish(transportFailure("transport"));
        });
        response.on("error", () => {
          finish(transportFailure("transport"));
        });
      }
    );
    networkRequest.setTimeout(request.timeout_ms, () => {
      timedOut = true;
      networkRequest.destroy();
      finish(transportFailure("timeout"));
    });
    networkRequest.on("error", () => {
      finish(transportFailure(timedOut ? "timeout" : "offline"));
    });
    networkRequest.end();
  });
}

/**
 * @param {RegistryTransportRequest} request
 * @returns {{ok: true, url: URL} | {ok: false}}
 */
function validateRequest(request) {
  try {
    const url = new URL(request.url);
    if (
      url.origin !== REGISTRY_ORIGIN ||
      url.protocol !== "https:" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      request.timeout_ms !== REGISTRY_TIMEOUT_MS ||
      request.max_response_bytes !== MAX_REGISTRY_RESPONSE_BYTES
    ) {
      return { ok: false };
    }
    return { ok: true, url };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {string | string[] | undefined} value
 * @returns {string}
 */
function singleHeader(value) {
  return typeof value === "string" && value.length <= 2_048 ? value : "";
}

/**
 * @param {number} status
 * @returns {boolean}
 */
function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 307 || status === 308;
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
 * @param {"offline" | "timeout" | "oversized" | "transport"} failure
 * @returns {RegistryTransportResult}
 */
function transportFailure(failure) {
  return {
    ok: false,
    status: "Unknown",
    failure
  };
}
