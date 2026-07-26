$ErrorActionPreference = "Stop"

$KanonCommand = "verify"
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
