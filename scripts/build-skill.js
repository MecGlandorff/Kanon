#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "skills", "kanon");
const checkOnly = process.argv.includes("--check");
const commands = ["ask", "brief", "improve", "refactor", "refresh", "resume", "todo", "verify"];
const artifacts = [];

artifacts.push(copyArtifact("bin/kanon.js", "skills/kanon/runtime/bin/kanon.js", 0o755));
for (const entry of fs.readdirSync(path.join(root, "src"), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".js")) {
    artifacts.push(copyArtifact(`src/${entry.name}`, `skills/kanon/runtime/src/${entry.name}`));
  }
}

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
LOCAL_KANON="$SCRIPT_DIR/../runtime/bin/kanon.js"

if [[ ! -f "$LOCAL_KANON" ]]; then
  echo "Kanon skill runtime is incomplete: expected $LOCAL_KANON." >&2
  echo "Reinstall the complete self-contained Kanon skill." >&2
  exit 127
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Kanon requires Node.js 20+." >&2
  exit 127
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(\".\")[0]')"
if [[ ! "$NODE_MAJOR" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 20 )); then
  echo "Kanon requires Node.js 20+; found $(node --version)." >&2
  exit 127
fi

exec node "$LOCAL_KANON" "$COMMAND" "$@"
`;
}

function powershellWrapper(command) {
  return `$ErrorActionPreference = "Stop"

$KanonCommand = "${command}"
$LocalKanon = Join-Path $PSScriptRoot "../runtime/bin/kanon.js"

if (-not (Test-Path -LiteralPath $LocalKanon -PathType Leaf)) {
  [Console]::Error.WriteLine("Kanon skill runtime is incomplete: expected $LocalKanon.")
  [Console]::Error.WriteLine("Reinstall the complete self-contained Kanon skill.")
  exit 127
}

$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
  [Console]::Error.WriteLine("Kanon requires Node.js 20+.")
  exit 127
}

$NodeMajor = [int](& $Node.Source -p 'process.versions.node.split(".")[0]')
if ($NodeMajor -lt 20) {
  $NodeVersion = & $Node.Source --version
  [Console]::Error.WriteLine("Kanon requires Node.js 20+; found $NodeVersion.")
  exit 127
}

& $Node.Source $LocalKanon $KanonCommand @args
exit $LASTEXITCODE
`;
}
