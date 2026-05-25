$ErrorActionPreference = "Stop"

$KanonCommand = "improve"
$LocalKanon = Join-Path $PSScriptRoot "../../../bin/kanon.js"

if (Test-Path -LiteralPath $LocalKanon -PathType Leaf) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine("Kanon requires Node.js 20+ to run the local package CLI.")
    exit 127
  }

  & node $LocalKanon $KanonCommand @args
  exit $LASTEXITCODE
}

$PathKanon = $null
if ($env:OS -eq "Windows_NT" -or $IsWindows) {
  $PathKanon = Get-Command kanon.cmd -ErrorAction SilentlyContinue
}
if (-not $PathKanon) {
  $PathKanon = Get-Command kanon -ErrorAction SilentlyContinue
}

if ($PathKanon) {
  & $PathKanon.Source $KanonCommand @args
  exit $LASTEXITCODE
}

[Console]::Error.WriteLine("Kanon CLI not found. Install it with: npm install -g @mecglandorff/kanon")
exit 127
