$ErrorActionPreference = "Stop"

$KanonCommand = "verify"
$LocalKanon = Join-Path $PSScriptRoot "../../../bin/kanon.js"

if (Test-Path -LiteralPath $LocalKanon -PathType Leaf) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine("Kanon requires Node.js 20+ to run the local package CLI.")
    exit 127
  }

  & node $LocalKanon $KanonCommand @args
  exit $LASTEXITCODE
}

[Console]::Error.WriteLine("Kanon skill runtime is incomplete: expected $LocalKanon.")
[Console]::Error.WriteLine("Install the full Kanon skill package in Codex or Claude Code; these wrappers are not a standalone terminal interface.")
exit 127
