import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { isRecord } from "../adapters/shared.js";

const MAX_BUILD_METADATA_BYTES = 32 * 1024;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export const IMPLEMENTED_PUBLIC_SKILLS = Object.freeze([
  "kanon",
  "orient",
  "resume",
  "status",
  "verify"
]);

/**
 * @typedef {{
 *   mode: "notice",
 *   enforcement: false,
 *   hook_status: "Unknown",
 *   lifecycle_notice_hook: "Unavailable",
 *   notice_delivery: "explicit-skill-and-status-output"
 * }} HostCapability
 * @typedef {{
 *   schema: "kanon-build-metadata-v1",
 *   package_name: string,
 *   package_version: string,
 *   plugin_name: "kanon",
 *   runtime: {
 *     format: "esm",
 *     runtime_dependencies: 0
 *   },
 *   public_capabilities: {
 *     skills: string[],
 *     hosts: {
 *       "codex-cli": HostCapability,
 *       "claude-code": HostCapability
 *     },
 *     notice: {
 *       advisory: true,
 *       automatic: false,
 *       blocks: false,
 *       rewrites: false,
 *       approves: false,
 *       suppresses: false,
 *       forces_reading: false,
 *       claims_understanding: false,
 *       delivery: "explicit-skill-and-status-output",
 *       future_requirement: "host-and-platform-specific-proven-executable-argument-vector-and-environment-boundary"
 *     },
 *     receipts: {
 *       role: "advisory-continuity-evidence",
 *       enforcement: false,
 *       evaluation: "explicit-kanon-invocation-only",
 *       persistence: "validated-plugin-data-when-available",
 *       repository_fallback: false,
 *       unavailable_host_evidence: "Unknown"
 *     }
 *   }
 * }} BuildMetadata
 * @typedef {{
 *   ok: true,
 *   value: BuildMetadata
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} BuildMetadataResult
 */

/**
 * @param {URL} [metadataUrl]
 * @returns {BuildMetadataResult}
 */
export function readEmbeddedBuildMetadata(
  metadataUrl = new URL("../build-metadata.json", import.meta.url)
) {
  try {
    const file = fileURLToPath(metadataUrl);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_BUILD_METADATA_BYTES) {
      return unavailableMetadata();
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return validateEmbeddedBuildMetadata(parsed);
  } catch {
    return unavailableMetadata();
  }
}

/**
 * @param {unknown} value
 * @returns {BuildMetadataResult}
 */
export function validateEmbeddedBuildMetadata(value) {
  if (!isBuildMetadata(value)) {
    return unavailableMetadata();
  }
  return {
    ok: true,
    value
  };
}

/**
 * @param {unknown} value
 * @returns {value is BuildMetadata}
 */
function isBuildMetadata(value) {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "package_name",
      "package_version",
      "plugin_name",
      "public_capabilities",
      "runtime",
      "schema"
    ]) &&
    value.schema === "kanon-build-metadata-v1" &&
    boundedString(value.package_name, 214) &&
    boundedString(value.package_version, 128) &&
    SEMVER.test(value.package_version) &&
    value.plugin_name === "kanon" &&
    validRuntime(value.runtime) &&
    validCapabilities(value.public_capabilities)
  );
}

/**
 * @param {unknown} value
 * @returns {value is BuildMetadata["runtime"]}
 */
function validRuntime(value) {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["format", "runtime_dependencies"]) &&
    value.format === "esm" &&
    value.runtime_dependencies === 0
  );
}

/**
 * @param {unknown} value
 * @returns {value is BuildMetadata["public_capabilities"]}
 */
function validCapabilities(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["hosts", "notice", "receipts", "skills"]) ||
    !Array.isArray(value.skills) ||
    value.skills.length !== IMPLEMENTED_PUBLIC_SKILLS.length ||
    value.skills.some(
      (skill, index) => skill !== IMPLEMENTED_PUBLIC_SKILLS[index]
    ) ||
    !isRecord(value.hosts) ||
    !hasExactKeys(value.hosts, ["claude-code", "codex-cli"]) ||
    !validHost(value.hosts["codex-cli"]) ||
    !validHost(value.hosts["claude-code"]) ||
    !isRecord(value.notice) ||
    !isRecord(value.receipts)
  ) {
    return false;
  }
  const validNotice = (
    hasExactKeys(value.notice, [
      "advisory",
      "approves",
      "automatic",
      "blocks",
      "claims_understanding",
      "delivery",
      "forces_reading",
      "future_requirement",
      "rewrites",
      "suppresses"
    ]) &&
    value.notice.advisory === true &&
    value.notice.approves === false &&
    value.notice.automatic === false &&
    value.notice.blocks === false &&
    value.notice.claims_understanding === false &&
    value.notice.delivery === "explicit-skill-and-status-output" &&
    value.notice.forces_reading === false &&
    value.notice.future_requirement ===
      "host-and-platform-specific-proven-executable-argument-vector-and-environment-boundary" &&
    value.notice.rewrites === false &&
    value.notice.suppresses === false
  );
  return (
    validNotice &&
    hasExactKeys(value.receipts, [
      "enforcement",
      "evaluation",
      "persistence",
      "repository_fallback",
      "role",
      "unavailable_host_evidence"
    ]) &&
    value.receipts.role === "advisory-continuity-evidence" &&
    value.receipts.enforcement === false &&
    value.receipts.evaluation === "explicit-kanon-invocation-only" &&
    value.receipts.persistence ===
      "validated-plugin-data-when-available" &&
    value.receipts.repository_fallback === false &&
    value.receipts.unavailable_host_evidence === "Unknown"
  );
}

/**
 * @param {unknown} value
 * @returns {value is HostCapability}
 */
function validHost(value) {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "enforcement",
      "hook_status",
      "lifecycle_notice_hook",
      "mode",
      "notice_delivery"
    ]) &&
    value.mode === "notice" &&
    value.enforcement === false &&
    value.hook_status === "Unknown" &&
    value.lifecycle_notice_hook === "Unavailable" &&
    value.notice_delivery === "explicit-skill-and-status-output"
  );
}

/**
 * @param {Record<string, unknown>} value
 * @param {string[]} keys
 * @returns {boolean}
 */
function hasExactKeys(value, keys) {
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
 * @returns {BuildMetadataResult}
 */
function unavailableMetadata() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic: "Embedded build metadata is unavailable or invalid."
  };
}
