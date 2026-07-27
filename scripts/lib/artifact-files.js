import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";

export const PUBLIC_COMMANDS = Object.freeze([
  "ask",
  "brief",
  "refresh",
  "resume",
  "todo",
  "verify"
]);

export const V1_RUNTIME_ARTIFACTS = Object.freeze([
  ["src/v1/adapters/claude.js", "runtime/adapters/claude.js"],
  ["src/v1/adapters/codex.js", "runtime/adapters/codex.js"],
  ["src/v1/adapters/notice-hook.js", "runtime/adapters/notice-hook.js"],
  ["src/v1/adapters/shared.js", "runtime/adapters/shared.js"],
  ["src/v1/core/build-metadata.js", "runtime/core/build-metadata.js"],
  ["src/v1/core/notice.js", "runtime/core/notice.js"],
  ["src/v1/registry/cache.js", "runtime/registry/cache.js"],
  ["src/v1/registry/deprecation.js", "runtime/registry/deprecation.js"],
  ["src/v1/registry/sanitize.js", "runtime/registry/sanitize.js"],
  ["src/v1/registry/transport.js", "runtime/registry/transport.js"]
]);

export function collectRuntimeDependencies(repoRoot, entry = "bin/kanon.js") {
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

export function publicSkillFiles(repoRoot) {
  const runtimeSources = collectRuntimeDependencies(repoRoot);
  return [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    "hooks/hooks.json",
    "runtime/package.json",
    "runtime/build-metadata.json",
    "runtime/bin/kanon.js",
    ...runtimeSources.map((source) => `runtime/${source}`),
    ...V1_RUNTIME_ARTIFACTS.map(([, target]) => target),
    "skills/kanon/SKILL.md",
    "skills/kanon/LICENSE",
    "skills/kanon/agents/openai.yaml",
    "skills/kanon/references/evidence-policy.md",
    "skills/kanon/references/output-contract.md",
    "skills/kanon/references/security-policy.md",
    ...PUBLIC_COMMANDS.flatMap((command) => [
      `skills/kanon/scripts/kanon-${command}`,
      `skills/kanon/scripts/kanon-${command}.ps1`
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
      skills: ["kanon"],
      hosts: {
        "codex-cli": {
          mode: "notice",
          enforcement: false,
          hook_status: "Unknown"
        },
        "claude-code": {
          mode: "notice",
          enforcement: false,
          hook_status: "Unknown"
        }
      },
      notice: {
        advisory: true,
        blocks: false,
        rewrites: false,
        approves: false,
        suppresses: false,
        forces_reading: false,
        claims_understanding: false
      }
    }
  };
}
