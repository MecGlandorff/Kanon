import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import {
  IMPLEMENTED_PUBLIC_SKILLS
} from "../../src/v1/core/build-metadata.js";

export const PUBLIC_COMMANDS = Object.freeze([
  "ask",
  "brief",
  "refresh",
  "resume",
  "todo",
  "verify"
]);

export const COMPATIBILITY_WRITE_COMMANDS = Object.freeze([
  "refresh",
  "todo"
]);

export const IMPLEMENTED_STABLE_SKILLS = Object.freeze(
  IMPLEMENTED_PUBLIC_SKILLS.filter((skill) => skill !== "kanon")
);

export const COMPATIBILITY_RUNTIME_ARTIFACT = Object.freeze([
  "bin/kanon-write.js",
  "runtime/bin/kanon-write.js"
]);

export const SHARED_WRAPPER_ARTIFACTS = Object.freeze([
  "runtime/bin/kanon-dispatch",
  "runtime/bin/kanon-dispatch.ps1"
]);

export function generatedExtensionlessWrappers() {
  return [
    SHARED_WRAPPER_ARTIFACTS[0],
    ...PUBLIC_COMMANDS.map(
      (command) => `skills/kanon/scripts/kanon-${command}`
    ),
    ...IMPLEMENTED_STABLE_SKILLS.map(
      (skill) => `skills/${skill}/scripts/kanon-${skill}`
    )
  ].sort();
}

export const V1_RUNTIME_ARTIFACTS = Object.freeze([
  ["src/v1/adapters/claude.js", "runtime/adapters/claude.js"],
  ["src/v1/adapters/codex.js", "runtime/adapters/codex.js"],
  ["src/v1/adapters/shared.js", "runtime/adapters/shared.js"],
  ["src/v1/bin/kanon.js", "runtime/bin/kanon-v1.js"],
  ["src/v1/cli.js", "runtime/cli.js"],
  ["src/v1/core/build-metadata.js", "runtime/core/build-metadata.js"],
  ["src/v1/core/handoff.js", "runtime/core/handoff.js"],
  ["src/v1/core/handoff-store.js", "runtime/core/handoff-store.js"],
  ["src/v1/core/plugin-data.js", "runtime/core/plugin-data.js"],
  ["src/v1/core/receipt.js", "runtime/core/receipt.js"],
  ["src/v1/core/receipt-store.js", "runtime/core/receipt-store.js"],
  ["src/v1/core/trust.js", "runtime/core/trust.js"],
  ["src/v1/core/steer-state.js", "runtime/core/steer-state.js"],
  ["src/v1/repository/git.js", "runtime/repository/git.js"],
  ["src/v1/repository/inspect.js", "runtime/repository/inspect.js"],
  ["src/v1/repository/read.js", "runtime/repository/read.js"],
  ["src/v1/registry/cache.js", "runtime/registry/cache.js"],
  ["src/v1/registry/deprecation.js", "runtime/registry/deprecation.js"],
  ["src/v1/registry/sanitize.js", "runtime/registry/sanitize.js"],
  ["src/v1/registry/transport.js", "runtime/registry/transport.js"],
  ["src/v1/skills/invoke.js", "runtime/skills/invoke.js"],
  ["src/v1/skills/aswitch.js", "runtime/skills/aswitch.js"],
  ["src/v1/skills/orient.js", "runtime/skills/orient.js"],
  ["src/v1/skills/resume.js", "runtime/skills/resume.js"],
  ["src/v1/skills/status.js", "runtime/skills/status.js"],
  ["src/v1/skills/steer.js", "runtime/skills/steer.js"],
  ["src/v1/skills/verify.js", "runtime/skills/verify.js"]
]);

export function collectRuntimeDependencies(
  repoRoot,
  entry = COMPATIBILITY_RUNTIME_ARTIFACT[0]
) {
  const pending = [entry];
  const visited = new Set();
  const sources = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const source = resolveContainedPath(repoRoot, current, { type: "file" });
    if (!source.ok) {
      throw new Error(
        `Unsafe runtime dependency ${current}: ${source.reason}`
      );
    }
    const contents = fs.readFileSync(source.path, "utf8");
    const pattern = /(?:from\s*|import\s*)["'](\.[^"']+)["']/g;
    let match;
    while ((match = pattern.exec(contents))) {
      const target = path
        .normalize(path.join(path.dirname(current), match[1]))
        .replaceAll("\\", "/");
      const withExtension = path.extname(target)
        ? target
        : `${target}.js`;
      if (
        withExtension.startsWith("src/") &&
        resolveContainedPath(repoRoot, withExtension, {
          type: "file"
        }).ok
      ) {
        sources.add(withExtension);
        pending.push(withExtension);
      }
    }
  }
  return Array.from(sources).sort();
}

/**
 * Return the exact checked-source to installed-runtime mapping for every
 * executable JavaScript module in the stable artifact.
 *
 * @param {string} repoRoot
 * @returns {[string, string][]}
 */
export function stableRuntimeArtifacts(repoRoot) {
  const compatibility = [
    [...COMPATIBILITY_RUNTIME_ARTIFACT],
    ...collectRuntimeDependencies(repoRoot).map(
      (source) => [source, `runtime/${source}`]
    )
  ];
  return [...compatibility, ...V1_RUNTIME_ARTIFACTS]
    .map(([source, target]) => [source, target])
    .sort((left, right) => left[1].localeCompare(right[1]));
}

/**
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function stableRuntimeCanonicalSources(repoRoot) {
  return Array.from(
    new Set(stableRuntimeArtifacts(repoRoot).map(([source]) => source))
  ).sort();
}

export function publicSkillFiles(repoRoot) {
  return [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    "runtime/package.json",
    "runtime/build-metadata.json",
    ...stableRuntimeArtifacts(repoRoot).map(([, target]) => target),
    ...SHARED_WRAPPER_ARTIFACTS,
    "skills/kanon/SKILL.md",
    "skills/kanon/LICENSE",
    "skills/kanon/agents/openai.yaml",
    "skills/kanon/references/evidence-policy.md",
    "skills/kanon/references/output-contract.md",
    "skills/kanon/references/security-policy.md",
    ...PUBLIC_COMMANDS.flatMap((command) => [
      `skills/kanon/scripts/kanon-${command}`,
      `skills/kanon/scripts/kanon-${command}.ps1`
    ]),
    ...IMPLEMENTED_STABLE_SKILLS.flatMap((skill) => [
      `skills/${skill}/SKILL.md`,
      `skills/${skill}/scripts/kanon-${skill}`,
      `skills/${skill}/scripts/kanon-${skill}.ps1`
    ])
  ].sort();
}

export function embeddedBuildMetadata(sourcePackage) {
  if (
    !sourcePackage ||
    typeof sourcePackage !== "object" ||
    Array.isArray(sourcePackage) ||
    typeof sourcePackage.name !== "string" ||
    sourcePackage.name.length === 0 ||
    sourcePackage.name.length > 214 ||
    typeof sourcePackage.version !== "string" ||
    sourcePackage.version.length === 0 ||
    sourcePackage.version.length > 128
  ) {
    throw new Error("Cannot generate build metadata from invalid package data.");
  }
  return {
    schema: "kanon-build-metadata-v1",
    package_name: sourcePackage.name,
    package_version: sourcePackage.version,
    plugin_name: "kanon",
    runtime: {
      format: "esm",
      runtime_dependencies: 0
    },
    public_capabilities: {
      skills: [...IMPLEMENTED_PUBLIC_SKILLS],
      hosts: {
        "codex-cli": {
          mode: "notice",
          enforcement: false,
          hook_status: "Unknown",
          lifecycle_notice_hook: "Unavailable",
          notice_delivery: "explicit-skill-and-status-output"
        },
        "claude-code": {
          mode: "notice",
          enforcement: false,
          hook_status: "Unknown",
          lifecycle_notice_hook: "Unavailable",
          notice_delivery: "explicit-skill-and-status-output"
        }
      },
      notice: {
        advisory: true,
        automatic: false,
        blocks: false,
        rewrites: false,
        approves: false,
        suppresses: false,
        forces_reading: false,
        claims_understanding: false,
        delivery: "explicit-skill-and-status-output",
        future_requirement:
          "host-and-platform-specific-proven-executable-argument-vector-and-environment-boundary"
      },
      receipts: {
        role: "advisory-continuity-evidence",
        enforcement: false,
        evaluation: "explicit-kanon-invocation-only",
        persistence: "validated-plugin-data-when-available",
        repository_fallback: false,
        unavailable_host_evidence: "Unknown"
      }
    }
  };
}
