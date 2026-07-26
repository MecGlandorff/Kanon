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
    "skills/kanon/SKILL.md",
    "skills/kanon/LICENSE",
    "skills/kanon/agents/openai.yaml",
    "skills/kanon/references/evidence-policy.md",
    "skills/kanon/references/output-contract.md",
    "skills/kanon/references/security-policy.md",
    "skills/kanon/runtime/bin/kanon.js",
    ...runtimeSources.map(
      (source) => `skills/kanon/runtime/${source}`
    ),
    ...PUBLIC_COMMANDS.flatMap((command) => [
      `skills/kanon/scripts/kanon-${command}`,
      `skills/kanon/scripts/kanon-${command}.ps1`
    ])
  ].sort();
}
