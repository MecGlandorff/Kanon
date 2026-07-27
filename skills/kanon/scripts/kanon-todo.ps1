$ErrorActionPreference = "Stop"

$KanonCommand = "todo"
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
