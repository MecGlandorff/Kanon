#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectRuntimeDependencies,
  embeddedBuildMetadata,
  PUBLIC_COMMANDS,
  STABLE_SLICE_8_SKILLS,
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
const generatedBuildMetadata = `${JSON.stringify(
  embeddedBuildMetadata(readPackageJson()),
  null,
  2
)}\n`;
for (const relative of [
  "src/v1/build-metadata.json",
  "runtime/build-metadata.json"
]) {
  artifacts.push({
    target: path.join(root, relative),
    relative,
    contents: generatedBuildMetadata,
    mode: 0o644
  });
}

for (const command of commands) {
  const stableRead = ["ask", "brief", "resume", "verify"].includes(command);
  artifacts.push({
    target: path.join(skillRoot, "scripts", `kanon-${command}`),
    relative: `skills/kanon/scripts/kanon-${command}`,
    contents: bashWrapper(command, stableRead),
    mode: 0o755
  });
  artifacts.push({
    target: path.join(skillRoot, "scripts", `kanon-${command}.ps1`),
    relative: `skills/kanon/scripts/kanon-${command}.ps1`,
    contents: powershellWrapper(command, stableRead),
    mode: 0o644
  });
}
for (const skill of STABLE_SLICE_8_SKILLS) {
  const stableRoot = path.join(root, "skills", skill);
  artifacts.push({
    target: path.join(stableRoot, "scripts", `kanon-${skill}`),
    relative: `skills/${skill}/scripts/kanon-${skill}`,
    contents: bashWrapper(skill, true),
    mode: 0o755
  });
  artifacts.push({
    target: path.join(stableRoot, "scripts", `kanon-${skill}.ps1`),
    relative: `skills/${skill}/scripts/kanon-${skill}.ps1`,
    contents: powershellWrapper(skill, true),
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
  return ["kanon", ...STABLE_SLICE_8_SKILLS].flatMap((skill) => {
    const directory = path.join(root, "skills", skill, "scripts");
    if (!fs.existsSync(directory)) {
      return [];
    }
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) =>
        entry.isFile() && /^kanon-[^.]+(?:\.ps1)?$/.test(entry.name)
      )
      .map((entry) => `skills/${skill}/scripts/${entry.name}`);
  });
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

function bashWrapper(command, stable) {
  return `#!/bin/bash
set -euo pipefail

COMMAND="${command}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
LOCAL_KANON="$SCRIPT_DIR/../../../runtime/bin/${
  stable ? "kanon-v1.js" : "kanon.js"
}"

if [[ ! -f "$LOCAL_KANON" ]]; then
  echo "Kanon skill runtime is incomplete: expected $LOCAL_KANON." >&2
  echo "Reinstall the complete self-contained Kanon plugin." >&2
  exit 127
fi

PATH_VALUE="\${PATH-}"
if (( \${#PATH_VALUE} > 32768 )); then
  echo "Kanon refused an oversized executable search path." >&2
  exit 127
fi

REPOSITORY_ROOT="$(pwd -P)"
SAFE_PATH=""
IFS=':' read -r -a PATH_ENTRIES <<< "$PATH_VALUE"
for PATH_ENTRY in "\${PATH_ENTRIES[@]}"; do
  if [[ "$PATH_ENTRY" != /* ]]; then
    continue
  fi
  PATH_DIRECTORY="$(CDPATH= cd -- "$PATH_ENTRY" 2>/dev/null && pwd -P)" || continue
  if [[ "$PATH_DIRECTORY" == "$REPOSITORY_ROOT" || "$PATH_DIRECTORY" == "$REPOSITORY_ROOT/"* ]]; then
    continue
  fi
  SAFE_PATH="\${SAFE_PATH:+$SAFE_PATH:}$PATH_DIRECTORY"
done

NODE_CANDIDATE="$(PATH="$SAFE_PATH" type -P node || true)"
if [[ -z "$NODE_CANDIDATE" ]]; then
  echo "Kanon requires Node.js major 20, 22, 24, or 25." >&2
  exit 127
fi

NODE_PATH=""
for REALPATH_BINARY in /usr/bin/realpath /bin/realpath; do
  if [[ -x "$REALPATH_BINARY" ]]; then
    NODE_PATH="$("$REALPATH_BINARY" -- "$NODE_CANDIDATE" 2>/dev/null || true)"
    break
  fi
done
if [[ -z "$NODE_PATH" ]]; then
  if [[ -L "$NODE_CANDIDATE" ]]; then
    echo "Kanon could not safely resolve the Node.js executable." >&2
    exit 127
  fi
  NODE_DIRECTORY="$(CDPATH= cd -- "$(dirname -- "$NODE_CANDIDATE")" && pwd -P)"
  NODE_PATH="$NODE_DIRECTORY/$(basename -- "$NODE_CANDIDATE")"
fi
if [[ ! -f "$NODE_PATH" || ! -x "$NODE_PATH" || "$NODE_PATH" == *$'\\n'* ]]; then
  echo "Kanon could not safely resolve the Node.js executable." >&2
  exit 127
fi
if [[ "$NODE_PATH" == "$REPOSITORY_ROOT" || "$NODE_PATH" == "$REPOSITORY_ROOT/"* ]]; then
  echo "Kanon refused a repository-controlled Node.js executable." >&2
  exit 127
fi

NODE_MAJOR="$("$NODE_PATH" -p 'process.versions.node.split(\".\")[0]')"
if [[ ! "$NODE_MAJOR" =~ ^(20|22|24|25)$ ]]; then
  echo "Kanon requires Node.js major 20, 22, 24, or 25; found $("$NODE_PATH" --version)." >&2
  exit 127
fi

exec "$NODE_PATH" "$LOCAL_KANON" "$COMMAND" "$@"
`;
}

function powershellWrapper(command, stable) {
  return `$ErrorActionPreference = "Stop"

$KanonCommand = "${command}"
$LocalKanon = Join-Path $PSScriptRoot "../../../runtime/bin/${
  stable ? "kanon-v1.js" : "kanon.js"
}"

if (-not (Test-Path -LiteralPath $LocalKanon -PathType Leaf)) {
  [Console]::Error.WriteLine("Kanon skill runtime is incomplete: expected $LocalKanon.")
  [Console]::Error.WriteLine("Reinstall the complete self-contained Kanon plugin.")
  exit 127
}

$PathValue = [Environment]::GetEnvironmentVariable("PATH")
if ($null -eq $PathValue -or $PathValue.Length -gt 32768) {
  [Console]::Error.WriteLine("Kanon refused an unavailable or oversized executable search path.")
  exit 127
}

$RepositoryRoot = [System.IO.Path]::GetFullPath((Get-Location).Path).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$RepositoryPrefix = $RepositoryRoot + [System.IO.Path]::DirectorySeparatorChar
$SafePathEntries = @()
foreach ($PathEntry in $PathValue.Split([System.IO.Path]::PathSeparator)) {
  if ([string]::IsNullOrWhiteSpace($PathEntry) -or -not [System.IO.Path]::IsPathRooted($PathEntry)) {
    continue
  }
  try {
    $PathDirectory = (Resolve-Path -LiteralPath $PathEntry -ErrorAction Stop).Path
  } catch {
    continue
  }
  if (
    $PathDirectory.Equals($RepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $PathDirectory.StartsWith($RepositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    continue
  }
  $SafePathEntries += $PathDirectory
}

$OriginalPath = $env:PATH
try {
  $env:PATH = [string]::Join([System.IO.Path]::PathSeparator, $SafePathEntries)
  $Node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
} finally {
  $env:PATH = $OriginalPath
}
if (-not $Node) {
  [Console]::Error.WriteLine("Kanon requires Node.js major 20, 22, 24, or 25.")
  exit 127
}

$NodeItem = Get-Item -LiteralPath $Node.Source -ErrorAction Stop
$NodePath = $NodeItem.FullName
if ($NodeItem.LinkType) {
  $ResolveLinkTarget = $NodeItem.PSObject.Methods["ResolveLinkTarget"]
  if ($null -eq $ResolveLinkTarget) {
    [Console]::Error.WriteLine("Kanon could not safely resolve the Node.js executable.")
    exit 127
  }
  $NodePath = $NodeItem.ResolveLinkTarget($true).FullName
}
if (
  $NodePath.Equals($RepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
  $NodePath.StartsWith($RepositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)
) {
  [Console]::Error.WriteLine("Kanon refused a repository-controlled Node.js executable.")
  exit 127
}

$NodeMajor = [int](& $NodePath -p 'process.versions.node.split(".")[0]')
if (@(20, 22, 24, 25) -notcontains $NodeMajor) {
  $NodeVersion = & $NodePath --version
  [Console]::Error.WriteLine("Kanon requires Node.js major 20, 22, 24, or 25; found $NodeVersion.")
  exit 127
}

& $NodePath $LocalKanon $KanonCommand @args
exit $LASTEXITCODE
`;
}
