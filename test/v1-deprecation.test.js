import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import {
  DEPRECATION_CACHE_TTL_MS,
  endDeprecationSession
} from "../src/v1/registry/cache.js";
import {
  checkExactVersionDeprecation
} from "../src/v1/registry/deprecation.js";
import {
  fixedRegistryTransport,
  MAX_REGISTRY_RESPONSE_BYTES,
  REGISTRY_ORIGIN,
  REGISTRY_TIMEOUT_MS
} from "../src/v1/registry/transport.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const metadata = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "runtime", "build-metadata.json"),
    "utf8"
  )
);
const session = {
  host: "codex-cli",
  id: "bounded-test-session"
};
const start = 1_800_000_000_000;

test("deprecated exact version is sanitized, warned, and cached as bounded data", async () => {
  const fixture = makeChecker([
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version,
      deprecated:
        "Use <script>alert(1)</script> \u001b[31mreplacement\u001b[0m \u202e now"
    })
  ]);
  const result = await fixture.check();

  assert.equal(result.status, "Deprecated");
  assert.equal(result.installed_version, metadata.package_version);
  assert.equal(result.cache, "updated");
  assert.match(result.reason, /‹script›alert\(1\)‹\/script› replacement now/);
  assert.doesNotMatch(result.reason, /\u001b|\u202e|[<>`]/);
  assert.match(
    result.warning,
    new RegExp(`^Installed Kanon version ${escapeRegex(metadata.package_version)}`)
  );
  assert.match(result.warning, /Registry text is untrusted data: <<</);
  assert.match(result.warning, /separate user-approved action/);

  const persisted = fs.readFileSync(
    path.join(fixture.pluginData, "deprecation-status-v1.json"),
    "utf8"
  );
  assert.ok(Buffer.byteLength(persisted) <= 8 * 1024);
  assert.doesNotMatch(persisted, /bounded-test-session|warning|plugin_data|url/);
  assert.doesNotMatch(persisted, /\u001b|\u202e|[<>`]/);
});

test("current exact version returns Current without deprecation prose", async () => {
  const fixture = makeChecker([
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version
    })
  ]);
  const result = await fixture.check();

  assert.deepEqual(
    pick(result, [
      "ok",
      "status",
      "package_name",
      "installed_version",
      "checked_at",
      "cache"
    ]),
    {
      ok: true,
      status: "Current",
      package_name: metadata.package_name,
      installed_version: metadata.package_version,
      checked_at: start,
      cache: "updated"
    }
  );
  assert.equal(Object.hasOwn(result, "warning"), false);
});

test("malformed and mismatched registry manifests remain Unknown", async () => {
  for (const response of [
    registryRaw("{bad json"),
    registryResponse({
      name: metadata.package_name,
      version: "9.9.9"
    }),
    registryResponse({
      name: "hostile-package",
      version: metadata.package_version
    }),
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version,
      deprecated: true
    }),
    {
      ok: true,
      status_code: 200,
      content_type: "text/html",
      body: "{}"
    },
    {
      ok: true,
      status_code: 404,
      content_type: "application/json",
      body: "{}"
    }
  ]) {
    const fixture = makeChecker([response]);
    const result = await fixture.check();
    assert.equal(result.status, "Unknown");
    assert.equal(result.ok, false);
  }
});

test("oversized response remains Unknown before JSON interpretation", async () => {
  const fixture = makeChecker([
    {
      ok: true,
      status_code: 200,
      content_type: "application/json",
      body: "x".repeat(MAX_REGISTRY_RESPONSE_BYTES + 1)
    }
  ]);
  const result = await fixture.check();
  assert.equal(result.status, "Unknown");
  assert.match(result.diagnostic, /size limit/);
});

test("same-origin redirects are bounded and cross-origin redirects are rejected", async () => {
  const redirected = makeChecker([
    {
      ok: true,
      status_code: 302,
      content_type: "",
      location: "/redirected/exact-version",
      body: ""
    },
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version
    })
  ]);
  assert.equal((await redirected.check()).status, "Current");
  assert.equal(redirected.calls.length, 2);
  assert.equal(new URL(redirected.calls[1].url).origin, REGISTRY_ORIGIN);

  const foreign = makeChecker([
    {
      ok: true,
      status_code: 302,
      content_type: "",
      location: "https://example.invalid/hostile",
      body: ""
    }
  ]);
  const foreignResult = await foreign.check();
  assert.equal(foreignResult.status, "Unknown");
  assert.match(foreignResult.diagnostic, /redirect.*unsafe/i);

  const looping = makeChecker([
    redirectResponse("/one"),
    redirectResponse("/two"),
    redirectResponse("/three")
  ]);
  const loopingResult = await looping.check();
  assert.equal(loopingResult.status, "Unknown");
  assert.match(loopingResult.diagnostic, /redirect limit/);
  assert.equal(looping.calls.length, 3);
});

test("timed-out and offline transports fail open to Unknown", async () => {
  for (const [failure, diagnostic] of [
    ["timeout", /timed out/],
    ["offline", /network was unavailable/]
  ]) {
    const fixture = makeChecker([
      { ok: false, status: "Unknown", failure }
    ]);
    const result = await fixture.check();
    assert.equal(result.status, "Unknown");
    assert.match(result.diagnostic, diagnostic);
  }
});

test("a valid session cache avoids transport until it expires", async () => {
  const fixture = makeChecker([
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version
    }),
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version,
      deprecated: "later"
    })
  ]);
  const first = await fixture.check();
  const cached = await fixture.check({ now: start + 1_000 });
  assert.equal(first.status, "Current");
  assert.equal(cached.status, "Current");
  assert.equal(cached.cache, "hit");
  assert.equal(fixture.calls.length, 1);

  const expired = await fixture.check({
    now: start + DEPRECATION_CACHE_TTL_MS + 1
  });
  assert.equal(expired.status, "Deprecated");
  assert.equal(fixture.calls.length, 2);
});

test("deprecated cache is sticky on failure until success proves otherwise", async () => {
  const fixture = makeChecker([
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version,
      deprecated: "Use replacement"
    }),
    { ok: false, status: "Unknown", failure: "offline" },
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version
    })
  ]);
  assert.equal((await fixture.check()).status, "Deprecated");
  const sticky = await fixture.check({ refresh: true, now: start + 1_000 });
  assert.equal(sticky.status, "Deprecated");
  assert.equal(sticky.cache, "hit");
  assert.match(sticky.diagnostics.join(" "), /network was unavailable/);

  const proven = await fixture.check({ refresh: true, now: start + 2_000 });
  assert.equal(proven.status, "Current");
  assert.equal(proven.cache, "updated");
});

test("cache keys isolate sessions and explicit session end removes the entry", async () => {
  const fixture = makeChecker([
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version
    }),
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version,
      deprecated: "Different session"
    }),
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version,
      deprecated: "After session end"
    })
  ]);
  assert.equal((await fixture.check()).status, "Current");
  const other = await fixture.check({
    host_session: { host: "codex-cli", id: "another-session" }
  });
  assert.equal(other.status, "Deprecated");
  assert.equal(fixture.calls.length, 2);

  assert.deepEqual(
    endDeprecationSession(fixture.pluginData, session),
    { ok: true }
  );
  const afterEnd = await fixture.check({ now: start + 1_000 });
  assert.equal(afterEnd.status, "Deprecated");
  assert.equal(fixture.calls.length, 3);
});

test("malformed, oversized, and linked cache files warn and recover safely", async () => {
  for (const prepare of [
    (root) => fs.writeFileSync(
      path.join(root, "deprecation-status-v1.json"),
      "{malformed"
    ),
    (root) => fs.writeFileSync(
      path.join(root, "deprecation-status-v1.json"),
      "x".repeat(8 * 1024 + 1)
    ),
    (root) => {
      const outside = path.join(root, "outside.json");
      fs.writeFileSync(outside, "outside-marker");
      fs.symlinkSync(
        outside,
        path.join(root, "deprecation-status-v1.json")
      );
    }
  ]) {
    const fixture = makeChecker([
      registryResponse({
        name: metadata.package_name,
        version: metadata.package_version
      })
    ]);
    prepare(fixture.pluginData);
    const result = await fixture.check();
    assert.equal(result.status, "Current");
    assert.match(result.diagnostics.join(" "), /cache is unavailable/);
    const outside = path.join(fixture.pluginData, "outside.json");
    if (fs.existsSync(outside)) {
      assert.equal(fs.readFileSync(outside, "utf8"), "outside-marker");
    }
  }
});

test("hostile transport values and absent cache scope remain bounded Unknown", async () => {
  for (const response of [
    null,
    {},
    { ok: "yes" },
    {
      ok: true,
      status_code: 200,
      content_type: "application/json",
      body: 42
    },
    { ok: false, status: "Unknown", failure: "injected" }
  ]) {
    const calls = [];
    const result = await checkExactVersionDeprecation({
      metadata,
      transport: async (request) => {
        calls.push(request);
        return response;
      },
      now: start
    });
    assert.equal(result.status, "Unknown");
    assert.ok(result.diagnostics.length <= 4);
    assert.equal(calls.length, 1);
  }
});

test("malformed checker options and repository cache roots are rejected", async () => {
  for (const input of [
    null,
    [],
    { refresh: "yes" },
    { now: -1 },
    { transport: "not-a-function" },
    { unexpected: true }
  ]) {
    const result = await checkExactVersionDeprecation(input);
    assert.deepEqual(result, {
      ok: false,
      status: "Unknown",
      diagnostic: "Deprecation check input is unavailable or invalid.",
      diagnostics: []
    });
  }

  const target = path.join(repoRoot, "deprecation-status-v1.json");
  assert.equal(fs.existsSync(target), false);
  const result = await checkExactVersionDeprecation({
    metadata,
    host_session: session,
    plugin_data_root: repoRoot,
    transport: async () =>
      registryResponse({
        name: metadata.package_name,
        version: metadata.package_version
      }),
    now: start
  });
  assert.equal(result.status, "Current");
  assert.equal(result.cache, "unavailable");
  assert.equal(fs.existsSync(target), false);
});

test("fixed production transport refuses non-registry origins without I/O", async () => {
  const result = await fixedRegistryTransport({
    url: "https://example.invalid/hostile",
    timeout_ms: REGISTRY_TIMEOUT_MS,
    max_response_bytes: MAX_REGISTRY_RESPONSE_BYTES
  });
  assert.deepEqual(result, {
    ok: false,
    status: "Unknown",
    failure: "transport"
  });
});

test("fixed production transport pins strict bundled TLS options and bounds", async () => {
  const originalRequest = https.request;
  /** @type {URL | undefined} */
  let capturedUrl;
  /** @type {Record<string, unknown> | undefined} */
  let capturedOptions;
  let capturedTimeout;
  try {
    https.request = (url, options, onResponse) => {
      capturedUrl = url;
      capturedOptions = options;
      const request = new EventEmitter();
      request.setTimeout = (timeout) => {
        capturedTimeout = timeout;
        return request;
      };
      request.destroy = () => request;
      request.end = () => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = {
          "content-type": "application/json"
        };
        response.destroy = () => response;
        onResponse(response);
        response.emit("data", Buffer.from("{}"));
        response.emit("end");
        return request;
      };
      return request;
    };

    const result = await fixedRegistryTransport({
      url: `${REGISTRY_ORIGIN}/deterministic-no-network-fixture`,
      timeout_ms: REGISTRY_TIMEOUT_MS,
      max_response_bytes: MAX_REGISTRY_RESPONSE_BYTES
    });
    assert.deepEqual(result, {
      ok: true,
      status_code: 200,
      content_type: "application/json",
      location: "",
      body: "{}"
    });
  } finally {
    https.request = originalRequest;
  }

  assert.equal(capturedUrl?.origin, REGISTRY_ORIGIN);
  assert.equal(capturedOptions?.method, "GET");
  assert.equal(capturedOptions?.agent, false);
  assert.equal(capturedOptions?.rejectUnauthorized, true);
  assert.deepEqual(capturedOptions?.ca, tls.rootCertificates);
  assert.equal(Object.isFrozen(capturedOptions?.ca), true);
  assert.equal(capturedTimeout, REGISTRY_TIMEOUT_MS);
  assert.deepEqual(capturedOptions?.headers, {
    Accept: "application/json",
    "User-Agent": "kanon-exact-version-check/1"
  });
});

test("checker always requests only the embedded exact version at fixed bounds", async () => {
  const fixture = makeChecker([
    registryResponse({
      name: metadata.package_name,
      version: metadata.package_version
    })
  ]);
  await fixture.check();
  assert.equal(fixture.calls.length, 1);
  const request = fixture.calls[0];
  const selected = new URL(request.url);
  assert.equal(selected.origin, REGISTRY_ORIGIN);
  assert.equal(selected.search, "");
  assert.equal(selected.hash, "");
  assert.equal(
    decodeURIComponent(selected.pathname),
    `/${metadata.package_name}/${metadata.package_version}`
  );
  assert.equal(request.timeout_ms, REGISTRY_TIMEOUT_MS);
  assert.equal(
    request.max_response_bytes,
    MAX_REGISTRY_RESPONSE_BYTES
  );

  const sources = [
    "src/v1/registry/cache.js",
    "src/v1/registry/deprecation.js",
    "src/v1/registry/sanitize.js",
    "src/v1/registry/transport.js"
  ].map((relative) =>
    fs.readFileSync(path.join(repoRoot, relative), "utf8")
  ).join("\n");
  assert.doesNotMatch(
    sources,
    /node:child_process|spawn|execFile|execSync|\.npmrc|npm_config|http:\/\//
  );
});

function makeChecker(responses) {
  const pluginData = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-deprecation-")
  );
  const calls = [];
  let index = 0;
  const transport = async (request) => {
    calls.push(request);
    const response = responses[index];
    index += 1;
    if (response === undefined) {
      throw new Error("Unexpected transport call");
    }
    return response;
  };
  return {
    pluginData,
    calls,
    check: (overrides = {}) =>
      checkExactVersionDeprecation({
        metadata,
        host_session: session,
        plugin_data_root: pluginData,
        transport,
        now: start,
        ...overrides
      })
  };
}

function registryResponse(value) {
  return registryRaw(JSON.stringify(value));
}

function registryRaw(body) {
  return {
    ok: true,
    status_code: 200,
    content_type: "application/json; charset=utf-8",
    body
  };
}

function redirectResponse(location) {
  return {
    ok: true,
    status_code: 302,
    content_type: "",
    location,
    body: ""
  };
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
