#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectRuntimeDependencies,
  embeddedBuildMetadata,
  PUBLIC_COMMANDS,
  V1_RUNTIME_ARTIFACTS
} from "./lib/artifact-files.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "skills", "kanon");
const checkOnly = process.argv.includes("--check");
const commands = PUBLIC_COMMANDS;
const artifacts = [];

artifacts.push(copyArtifact("bin/kanon.js", "runtime/bin/kanon.js", 0o755));
for (const sourceRelative of collectRuntimeDependencies(root)) {
  artifacts.push(
    copyArtifact(
      sourceRelative,
      `runtime/${sourceRelative}`
    )
  );
}
for (const [sourceRelative, targetRelative] of V1_RUNTIME_ARTIFACTS) {
  artifacts.push(copyArtifact(sourceRelative, targetRelative));
}
artifacts.push({
  target: path.join(root, "runtime", "build-metadata.json"),
  relative: "runtime/build-metadata.json",
  contents: `${JSON.stringify(
    embeddedBuildMetadata(readPackageJson()),
    null,
    2
  )}\n`,
  mode: 0o644
});

for (const command of commands) {
  artifacts.push({
    target: path.join(skillRoot, "scripts", `kanon-${command}`),
    relative: `skills/kanon/scripts/kanon-${command}`,
    contents: bashWrapper(command),
    mode: 0o755
  });
  artifacts.push({
    target: path.join(skillRoot, "scripts", `kanon-${command}.ps1`),
    relative: `skills/kanon/scripts/kanon-${command}.ps1`,
    contents: powershellWrapper(command),
    mode: 0o644
  });
}

const mismatches = [];
const expected = new Set(artifacts.map((artifact) => artifact.relative));
const generatedFiles = [
  ...listJavaScriptFiles("runtime"),
  ...listJavaScriptFiles("skills/kanon/runtime"),
  ...listWrapperFiles()
];
for (const relative of generatedFiles) {
  if (!expected.has(relative)) {
    mismatches.push(relative);
    if (!checkOnly) {
      fs.unlinkSync(path.join(root, relative));
    }
  }
}
for (const artifact of artifacts) {
  const current = readFile(artifact.target);
  if (current !== artifact.contents) {
    mismatches.push(artifact.relative);
    if (!checkOnly) {
      fs.mkdirSync(path.dirname(artifact.target), { recursive: true });
      fs.writeFileSync(artifact.target, artifact.contents, "utf8");
    }
  }
  if (!checkOnly && process.platform !== "win32") {
    fs.chmodSync(artifact.target, artifact.mode);
  }
}

if (checkOnly && mismatches.length) {
  process.stderr.write(
    `Generated Kanon skill artifacts are stale. Run npm run build:skill.\n${mismatches.map((file) => `- ${file}`).join("\n")}\n`
  );
  process.exitCode = 1;
} else if (!checkOnly) {
  removeEmptyDirectories(path.join(skillRoot, "runtime"));
  process.stdout.write(`Synchronized ${artifacts.length} Kanon skill artifact(s).\n`);
}

function copyArtifact(sourceRelative, targetRelative, mode = 0o644) {
  return {
    target: path.join(root, targetRelative),
    relative: targetRelative,
    contents: fs.readFileSync(path.join(root, sourceRelative), "utf8"),
    mode
  };
}

function listJavaScriptFiles(relativeDirectory) {
  const files = [];
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) {
    return files;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(relative));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(relative);
    }
  }
  return files.sort();
}

function listWrapperFiles() {
  const directory = path.join(skillRoot, "scripts");
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() && /^kanon-[^.]+(?:\.ps1)?$/.test(entry.name)
    )
    .map((entry) => `skills/kanon/scripts/${entry.name}`);
}

function removeEmptyDirectories(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyDirectories(path.join(directory, entry.name));
    }
  }
  if (
    fs.readdirSync(directory).length === 0
  ) {
    fs.rmdirSync(directory);
  }
}

function readPackageJson() {
  const filePath = path.join(root, "package.json");
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 256 * 1024) {
    throw new Error("package.json is unavailable or exceeds 256 KiB.");
  }
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("package.json must contain a JSON object.");
  }
  return value;
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function bashWrapper(command) {
  return `#!/usr/bin/env bash
set -euo pipefail

COMMAND="${command}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
LOCAL_KANON="$SCRIPT_DIR/../../../runtime/bin/kanon.js"

if [[ ! -f "$LOCAL_KANON" ]]; then
  echo "Kanon skill runtime is incomplete: expected $LOCAL_KANON." >&2
  echo "Reinstall the complete self-contained Kanon plugin." >&2
  exit 127
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Kanon requires Node.js major 20, 22, 24, or 25." >&2
  exit 127
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(\".\")[0]')"
if [[ ! "$NODE_MAJOR" =~ ^(20|22|24|25)$ ]]; then
  echo "Kanon requires Node.js major 20, 22, 24, or 25; found $(node --version)." >&2
  exit 127
fi

exec node "$LOCAL_KANON" "$COMMAND" "$@"
`;
}

function powershellWrapper(command) {
  return `$ErrorActionPreference = "Stop"

$KanonCommand = "${command}"
$LocalKanon = Join-Path $PSScriptRoot "../../../runtime/bin/kanon.js"

if (-not (Test-Path -LiteralPath $LocalKanon -PathType Leaf)) {
  [Console]::Error.WriteLine("Kanon skill runtime is incomplete: expected $LocalKanon.")
  [Console]::Error.WriteLine("Reinstall the complete self-contained Kanon plugin.")
  exit 127
}

$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
  [Console]::Error.WriteLine("Kanon requires Node.js major 20, 22, 24, or 25.")
  exit 127
}

$NodeMajor = [int](& $Node.Source -p 'process.versions.node.split(".")[0]')
if (@(20, 22, 24, 25) -notcontains $NodeMajor) {
  $NodeVersion = & $Node.Source --version
  [Console]::Error.WriteLine("Kanon requires Node.js major 20, 22, 24, or 25; found $NodeVersion.")
  exit 127
}

& $Node.Source $LocalKanon $KanonCommand @args
exit $LASTEXITCODE
`;
}
