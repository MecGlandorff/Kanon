#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPATIBILITY_RUNTIME_ARTIFACT,
  COMPATIBILITY_WRITE_COMMANDS,
  collectRuntimeDependencies,
  embeddedBuildMetadata,
  IMPLEMENTED_STABLE_SKILLS,
  PUBLIC_COMMANDS,
  SHARED_WRAPPER_ARTIFACTS,
  V1_RUNTIME_ARTIFACTS
} from "./lib/artifact-files.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "skills", "kanon");
const checkOnly = process.argv.includes("--check");
const commands = PUBLIC_COMMANDS;
const artifacts = [];

artifacts.push(copyArtifact(...COMPATIBILITY_RUNTIME_ARTIFACT, 0o755));
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

artifacts.push({
  target: path.join(root, SHARED_WRAPPER_ARTIFACTS[0]),
  relative: SHARED_WRAPPER_ARTIFACTS[0],
  contents: bashDispatcher(),
  mode: 0o755
});
artifacts.push({
  target: path.join(root, SHARED_WRAPPER_ARTIFACTS[1]),
  relative: SHARED_WRAPPER_ARTIFACTS[1],
  contents: powershellDispatcher(),
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
for (const skill of IMPLEMENTED_STABLE_SKILLS) {
  const stableRoot = path.join(root, "skills", skill);
  artifacts.push({
    target: path.join(stableRoot, "scripts", `kanon-${skill}`),
    relative: `skills/${skill}/scripts/kanon-${skill}`,
    contents: bashWrapper(skill),
    mode: 0o755
  });
  artifacts.push({
    target: path.join(stableRoot, "scripts", `kanon-${skill}.ps1`),
    relative: `skills/${skill}/scripts/kanon-${skill}.ps1`,
    contents: powershellWrapper(skill),
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
  return ["kanon", ...IMPLEMENTED_STABLE_SKILLS].flatMap((skill) => {
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

function bashWrapper(command) {
  return `#!/bin/bash -p
set -euo pipefail

unset BASH_ENV ENV CDPATH GLOBIGNORE

SCRIPT_SOURCE="\${BASH_SOURCE[0]}"
case "$SCRIPT_SOURCE" in
  */*) SCRIPT_PARENT="\${SCRIPT_SOURCE%/*}" ;;
  *) SCRIPT_PARENT="." ;;
esac
SCRIPT_DIR="$(CDPATH= cd -- "$SCRIPT_PARENT" 2>/dev/null && pwd -P)" || {
  echo "Kanon could not resolve its installed wrapper directory." >&2
  exit 127
}
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." 2>/dev/null && pwd -P)" || {
  echo "Kanon could not resolve its installed plugin directory." >&2
  exit 127
}
DISPATCH="$PLUGIN_ROOT/runtime/bin/kanon-dispatch"
if [[ -L "$DISPATCH" || ! -f "$DISPATCH" || ! -x "$DISPATCH" ]]; then
  echo "Kanon shared dispatch runtime is unavailable or unsafe." >&2
  echo "Reinstall the complete self-contained Kanon plugin." >&2
  exit 127
fi

exec "$DISPATCH" "${command}" "$@"
`;
}

function bashDispatcher() {
  const stablePattern = stableRuntimeCommands().join("|");
  const writePattern = COMPATIBILITY_WRITE_COMMANDS.join("|");
  return `#!/bin/bash -p
set -euo pipefail

unset BASH_ENV ENV CDPATH GLOBIGNORE
unset NODE_OPTIONS NODE_PATH NODE_REDIRECT_WARNINGS NODE_REPL_HISTORY
unset NODE_V8_COVERAGE NODE_COMPILE_CACHE NODE_DEBUG NODE_DEBUG_NATIVE

if (( $# < 1 )); then
  echo "Kanon requires a fixed supported command." >&2
  exit 127
fi
COMMAND="$1"
shift
case "$COMMAND" in
  ${stablePattern}) RUNTIME_NAME="kanon-v1.js" ;;
  ${writePattern}) RUNTIME_NAME="kanon-write.js" ;;
  *)
    echo "Kanon refused an unsupported dispatch command." >&2
    exit 127
    ;;
esac

SCRIPT_SOURCE="\${BASH_SOURCE[0]}"
case "$SCRIPT_SOURCE" in
  */*) SCRIPT_PARENT="\${SCRIPT_SOURCE%/*}" ;;
  *) SCRIPT_PARENT="." ;;
esac
SCRIPT_DIR="$(CDPATH= cd -- "$SCRIPT_PARENT" 2>/dev/null && pwd -P)" || {
  echo "Kanon could not resolve its installed dispatch directory." >&2
  exit 127
}
PLUGIN_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." 2>/dev/null && pwd -P)" || {
  echo "Kanon could not resolve its installed plugin directory." >&2
  exit 127
}
LOCAL_KANON="$SCRIPT_DIR/$RUNTIME_NAME"
if [[ -L "$LOCAL_KANON" || ! -f "$LOCAL_KANON" ]]; then
  echo "Kanon skill runtime is unavailable or unsafe." >&2
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
  if [[ "$PATH_DIRECTORY" == "$PLUGIN_ROOT" || "$PATH_DIRECTORY" == "$PLUGIN_ROOT/"* ]]; then
    continue
  fi
  SAFE_PATH="\${SAFE_PATH:+$SAFE_PATH:}$PATH_DIRECTORY"
done

NODE_CANDIDATE="$(PATH="$SAFE_PATH" type -P node || true)"
if [[ -z "$NODE_CANDIDATE" || "$NODE_CANDIDATE" != /* || "$NODE_CANDIDATE" == *$'\\n'* ]]; then
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
  NODE_PARENT="\${NODE_CANDIDATE%/*}"
  NODE_NAME="\${NODE_CANDIDATE##*/}"
  if [[ -z "$NODE_PARENT" || "$NODE_PARENT" == "$NODE_CANDIDATE" || -z "$NODE_NAME" ]]; then
    echo "Kanon could not safely resolve the Node.js executable." >&2
    exit 127
  fi
  NODE_DIRECTORY="$(CDPATH= cd -- "$NODE_PARENT" 2>/dev/null && pwd -P)" || {
    echo "Kanon could not safely resolve the Node.js executable." >&2
    exit 127
  }
  NODE_PATH="$NODE_DIRECTORY/$NODE_NAME"
fi
if [[ ! -f "$NODE_PATH" || ! -x "$NODE_PATH" || "$NODE_PATH" == *$'\\n'* ]]; then
  echo "Kanon could not safely resolve the Node.js executable." >&2
  exit 127
fi
if [[ "$NODE_PATH" == "$REPOSITORY_ROOT" || "$NODE_PATH" == "$REPOSITORY_ROOT/"* ]]; then
  echo "Kanon refused a repository-controlled Node.js executable." >&2
  exit 127
fi
if [[ "$NODE_PATH" == "$PLUGIN_ROOT" || "$NODE_PATH" == "$PLUGIN_ROOT/"* ]]; then
  echo "Kanon refused a plugin-controlled Node.js executable." >&2
  exit 127
fi

NODE_MAJOR="$(PATH="$SAFE_PATH" "$NODE_PATH" -p 'process.versions.node.split(\".\")[0]')"
if [[ ! "$NODE_MAJOR" =~ ^(20|22|24|25)$ ]]; then
  echo "Kanon requires Node.js major 20, 22, 24, or 25; found $(PATH="$SAFE_PATH" "$NODE_PATH" --version)." >&2
  exit 127
fi

PATH="$SAFE_PATH" exec "$NODE_PATH" "$LOCAL_KANON" "$COMMAND" "$@"
`;
}

function powershellWrapper(command) {
  return `$ErrorActionPreference = "Stop"

$PluginRoot = (Microsoft.PowerShell.Management\\Resolve-Path -LiteralPath (Microsoft.PowerShell.Management\\Join-Path $PSScriptRoot "../../..") -ErrorAction Stop).Path.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$Dispatch = Microsoft.PowerShell.Management\\Join-Path $PluginRoot "runtime/bin/kanon-dispatch.ps1"
if (-not (Microsoft.PowerShell.Management\\Test-Path -LiteralPath $Dispatch -PathType Leaf)) {
  [Console]::Error.WriteLine("Kanon shared dispatch runtime is unavailable or unsafe.")
  [Console]::Error.WriteLine("Reinstall the complete self-contained Kanon plugin.")
  exit 127
}
$DispatchItem = Microsoft.PowerShell.Management\\Get-Item -LiteralPath $Dispatch -ErrorAction Stop
if ($DispatchItem.LinkType) {
  [Console]::Error.WriteLine("Kanon shared dispatch runtime is unavailable or unsafe.")
  exit 127
}

& $Dispatch "${command}" @args
exit $LASTEXITCODE
`;
}

function powershellDispatcher() {
  const stableCommands = stableRuntimeCommands()
    .map((command) => JSON.stringify(command))
    .join(", ");
  const writeCommands = COMPATIBILITY_WRITE_COMMANDS
    .map((command) => JSON.stringify(command))
    .join(", ");
  return `$ErrorActionPreference = "Stop"

if ($args.Count -lt 1) {
  [Console]::Error.WriteLine("Kanon requires a fixed supported command.")
  exit 127
}
$KanonCommand = [string]$args[0]
$KanonArguments = if ($args.Count -gt 1) {
  @($args[1..($args.Count - 1)])
} else {
  @()
}
$StableCommands = @(${stableCommands})
$WriteCommands = @(${writeCommands})
if ($StableCommands -ccontains $KanonCommand) {
  $RuntimeName = "kanon-v1.js"
} elseif ($WriteCommands -ccontains $KanonCommand) {
  $RuntimeName = "kanon-write.js"
} else {
  [Console]::Error.WriteLine("Kanon refused an unsupported dispatch command.")
  exit 127
}

$PluginRoot = (Microsoft.PowerShell.Management\\Resolve-Path -LiteralPath (Microsoft.PowerShell.Management\\Join-Path $PSScriptRoot "../..") -ErrorAction Stop).Path.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$PluginPrefix = $PluginRoot + [System.IO.Path]::DirectorySeparatorChar
$LocalKanon = Microsoft.PowerShell.Management\\Join-Path $PSScriptRoot $RuntimeName
$LocalKanonItem = Microsoft.PowerShell.Management\\Get-Item -LiteralPath $LocalKanon -ErrorAction Stop
if (-not $LocalKanonItem.PSIsContainer -and -not $LocalKanonItem.LinkType) {
  $LocalKanon = $LocalKanonItem.FullName
} else {
  [Console]::Error.WriteLine("Kanon skill runtime is unavailable or unsafe.")
  [Console]::Error.WriteLine("Reinstall the complete self-contained Kanon plugin.")
  exit 127
}

$PathValue = [Environment]::GetEnvironmentVariable("PATH")
if ($null -eq $PathValue -or $PathValue.Length -gt 32768) {
  [Console]::Error.WriteLine("Kanon refused an unavailable or oversized executable search path.")
  exit 127
}

$RepositoryRoot = (Microsoft.PowerShell.Management\\Resolve-Path -LiteralPath (Microsoft.PowerShell.Management\\Get-Location).Path -ErrorAction Stop).Path.TrimEnd(
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
    $PathDirectory = (Microsoft.PowerShell.Management\\Resolve-Path -LiteralPath $PathEntry -ErrorAction Stop).Path
  } catch {
    continue
  }
  if (
    $PathDirectory.Equals($RepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $PathDirectory.StartsWith($RepositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    continue
  }
  if (
    $PathDirectory.Equals($PluginRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    $PathDirectory.StartsWith($PluginPrefix, [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    continue
  }
  $SafePathEntries += $PathDirectory
}

$NodeCandidate = $null
$NodeNames = if (
  [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
) {
  @("node.exe")
} else {
  @("node")
}
foreach ($PathDirectory in $SafePathEntries) {
  foreach ($NodeName in $NodeNames) {
    $Candidate = [System.IO.Path]::Combine($PathDirectory, $NodeName)
    if ([System.IO.File]::Exists($Candidate)) {
      $NodeCandidate = $Candidate
      break
    }
  }
  if ($null -ne $NodeCandidate) {
    break
  }
}
if ($null -eq $NodeCandidate) {
  [Console]::Error.WriteLine("Kanon requires Node.js major 20, 22, 24, or 25.")
  exit 127
}

$NodeItem = Microsoft.PowerShell.Management\\Get-Item -LiteralPath $NodeCandidate -ErrorAction Stop
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
if (
  $NodePath.Equals($PluginRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
  $NodePath.StartsWith($PluginPrefix, [System.StringComparison]::OrdinalIgnoreCase)
) {
  [Console]::Error.WriteLine("Kanon refused a plugin-controlled Node.js executable.")
  exit 127
}

$OriginalPath = $env:PATH
$NodeEnvironmentNames = @(
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_REDIRECT_WARNINGS",
  "NODE_REPL_HISTORY",
  "NODE_V8_COVERAGE",
  "NODE_COMPILE_CACHE",
  "NODE_DEBUG",
  "NODE_DEBUG_NATIVE"
)
$OriginalNodeEnvironment = @{}
foreach ($NodeEnvironmentName in $NodeEnvironmentNames) {
  $OriginalNodeEnvironment[$NodeEnvironmentName] = [Environment]::GetEnvironmentVariable(
    $NodeEnvironmentName,
    [System.EnvironmentVariableTarget]::Process
  )
  [Environment]::SetEnvironmentVariable(
    $NodeEnvironmentName,
    $null,
    [System.EnvironmentVariableTarget]::Process
  )
}
$KanonExitCode = 127
try {
  $env:PATH = [string]::Join([System.IO.Path]::PathSeparator, $SafePathEntries)
  $NodeMajor = [int](& $NodePath -p 'process.versions.node.split(".")[0]')
  if (@(20, 22, 24, 25) -notcontains $NodeMajor) {
    $NodeVersion = & $NodePath --version
    [Console]::Error.WriteLine("Kanon requires Node.js major 20, 22, 24, or 25; found $NodeVersion.")
    exit 127
  }

  & $NodePath $LocalKanon $KanonCommand @KanonArguments
  $KanonExitCode = $LASTEXITCODE
} finally {
  $env:PATH = $OriginalPath
  foreach ($NodeEnvironmentName in $NodeEnvironmentNames) {
    [Environment]::SetEnvironmentVariable(
      $NodeEnvironmentName,
      $OriginalNodeEnvironment[$NodeEnvironmentName],
      [System.EnvironmentVariableTarget]::Process
    )
  }
}

exit $KanonExitCode
`;
}

function stableRuntimeCommands() {
  return Array.from(
    new Set([
      ...PUBLIC_COMMANDS.filter(
        (command) => !COMPATIBILITY_WRITE_COMMANDS.includes(command)
      ),
      ...IMPLEMENTED_STABLE_SKILLS
    ])
  ).sort();
}
