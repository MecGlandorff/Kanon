import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MARKETPLACE_NAME = "kanon-guard-spike-codex";
export const PLUGIN_NAME = "kanon-guard-spike-codex";
export const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
export const PLUGIN_VERSION = "0.0.0";
export const DENIAL_MARKER_NAME = "kanon-guard-spike-deny-shell.txt";

const FIXTURE_RELATIVE_ROOT =
  "spikes/guard-feasibility/codex-cli/marketplace";
const PLUGIN_RELATIVE_ROOT =
  `${FIXTURE_RELATIVE_ROOT}/plugins/${PLUGIN_NAME}`;

export const FIXTURE_FILE_HASHES = Object.freeze({
  [`${FIXTURE_RELATIVE_ROOT}/.agents/plugins/marketplace.json`]:
    "9749484d9cd4957bbe27980773ba2bce79711d643a2a78367d2391c13b03f5e1",
  [`${PLUGIN_RELATIVE_ROOT}/.codex-plugin/plugin.json`]:
    "75d2b81c3da5f609601bdb390fd8768cb207e87b2c5d4b41c780f8cc037fb718",
  [`${PLUGIN_RELATIVE_ROOT}/hooks/hooks.json`]:
    "84c3d699a037cf2358a70a19ee3a241402eabce7d823cafc139f4a159f33b581",
  [`${PLUGIN_RELATIVE_ROOT}/scripts/probe-core.mjs`]:
    "48f644562af4884a1d08134f577bf0dbbf8352b284906cb839fc34af20e10561",
  [`${PLUGIN_RELATIVE_ROOT}/scripts/probe-hook.mjs`]:
    "feb6732095f73bb426e56e2737406b39445a31e5f8ee988d649d13d0475bdfb9"
});

export function fixturePaths(repoRoot) {
  const marketplaceRoot = path.join(repoRoot, FIXTURE_RELATIVE_ROOT);
  return {
    marketplaceRoot,
    pluginRoot: path.join(marketplaceRoot, "plugins", PLUGIN_NAME)
  };
}

export function verifyFixtureIdentity(repoRoot) {
  const observed = [];
  for (const [relative, expectedSha256] of Object.entries(
    FIXTURE_FILE_HASHES
  )) {
    const absolute = path.join(repoRoot, relative);
    const stat = fs.lstatSync(absolute);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      fs.realpathSync(absolute) !== absolute
    ) {
      throw new Error(`Unsafe disposable fixture file: ${relative}`);
    }
    const actualSha256 = sha256(fs.readFileSync(absolute));
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Disposable fixture identity mismatch: ${relative}`);
    }
    observed.push(`${relative}\0${actualSha256}\n`);
  }

  const { marketplaceRoot, pluginRoot } = fixturePaths(repoRoot);
  const marketplace = readJson(
    path.join(
      marketplaceRoot,
      ".agents",
      "plugins",
      "marketplace.json"
    )
  );
  const manifest = readJson(
    path.join(pluginRoot, ".codex-plugin", "plugin.json")
  );
  const hooks = readJson(path.join(pluginRoot, "hooks", "hooks.json"));
  const entry = marketplace?.plugins?.[0];
  if (
    marketplace?.name !== MARKETPLACE_NAME ||
    marketplace.plugins?.length !== 1 ||
    entry?.name !== PLUGIN_NAME ||
    entry?.source?.source !== "local" ||
    entry?.source?.path !== `./plugins/${PLUGIN_NAME}` ||
    entry?.policy?.installation !== "AVAILABLE" ||
    entry?.policy?.authentication !== "ON_INSTALL" ||
    manifest?.name !== PLUGIN_NAME ||
    manifest?.version !== PLUGIN_VERSION ||
    !Array.isArray(hooks?.hooks?.SessionStart) ||
    !hooks.hooks.SessionStart.some(
      (group) => group?.matcher === "startup|resume|compact"
    ) ||
    !Array.isArray(hooks?.hooks?.PreToolUse) ||
    !hooks.hooks.PreToolUse.some((group) => group?.matcher === "^Bash$")
  ) {
    throw new Error("Disposable fixture structure or identity changed.");
  }

  return {
    verified: true,
    bundleSha256: sha256(observed.sort().join(""))
  };
}

export function denialProbe(markerFile) {
  if (!path.isAbsolute(markerFile)) {
    throw new Error("The denial marker path must be absolute.");
  }
  return [
    "Use the Bash tool exactly once and do not use any other tool.",
    `Run printf '%s\\n' ${shellQuote("KANON_GUARD_SPIKE_DENY")} > ${shellQuote(markerFile)}.`,
    "Do not inspect files, do not use network access, and do not retry if the tool is denied."
  ].join(" ");
}

export function parseMarketplaceList(output) {
  const parsed = parseBoundedJson(output);
  if (
    !plainObject(parsed) ||
    !boundedArray(parsed.marketplaces) ||
    !parsed.marketplaces.every(plainObject)
  ) {
    return null;
  }
  const matches = parsed.marketplaces.filter(
    (entry) => entry.name === MARKETPLACE_NAME
  );
  return {
    exactNamePresent: matches.length > 0,
    duplicateExactNames: matches.length > 1,
    entries: parsed.marketplaces,
    match: matches.length === 1 ? matches[0] : null
  };
}

export function parsePluginList(output) {
  const parsed = parseBoundedJson(output);
  if (
    !plainObject(parsed) ||
    !boundedArray(parsed.installed) ||
    !parsed.installed.every(plainObject)
  ) {
    return null;
  }
  const matches = parsed.installed.filter(
    (entry) =>
      entry.name === PLUGIN_NAME ||
      entry.pluginId === PLUGIN_ID
  );
  return {
    exactNamePresent: matches.length > 0,
    duplicateExactNames: matches.length > 1,
    otherInstalledPluginsPresent:
      parsed.installed.some(
        (entry) =>
          entry.installed === true &&
          entry.name !== PLUGIN_NAME &&
          entry.pluginId !== PLUGIN_ID
      ),
    entries: parsed.installed,
    match: matches.length === 1 ? matches[0] : null
  };
}

export function marketplaceIdentityMatches(state, marketplaceRoot) {
  if (!state?.match || state.duplicateExactNames) return false;
  const entry = state.match;
  return (
    entry.name === MARKETPLACE_NAME &&
    canonicalCandidate(entry.root) === fs.realpathSync(marketplaceRoot) &&
    entry.marketplaceSource?.sourceType === "local"
  );
}

export function pluginIdentityMatches(state, pluginRoot) {
  if (!state?.match || state.duplicateExactNames) return false;
  const entry = state.match;
  return (
    entry.pluginId === PLUGIN_ID &&
    entry.name === PLUGIN_NAME &&
    entry.marketplaceName === MARKETPLACE_NAME &&
    entry.version === PLUGIN_VERSION &&
    entry.installed === true &&
    entry.enabled === true &&
    entry.source?.source === "local" &&
    canonicalCandidate(entry.source?.path) === fs.realpathSync(pluginRoot) &&
    entry.marketplaceSource?.sourceType === "local" &&
    entry.installPolicy === "AVAILABLE" &&
    entry.authPolicy === "ON_INSTALL"
  );
}

function parseBoundedJson(output) {
  if (
    typeof output !== "string" ||
    Buffer.byteLength(output) > 8 * 1024 * 1024
  ) {
    return null;
  }
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function boundedArray(value) {
  return Array.isArray(value) && value.length <= 1_024;
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalCandidate(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) return null;
  try {
    return fs.realpathSync(value);
  } catch {
    return null;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
