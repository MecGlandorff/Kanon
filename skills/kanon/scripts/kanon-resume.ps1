$ErrorActionPreference = "Stop"

$PluginRoot = (Microsoft.PowerShell.Management\Resolve-Path -LiteralPath (Microsoft.PowerShell.Management\Join-Path $PSScriptRoot "../../..") -ErrorAction Stop).Path.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$Dispatch = Microsoft.PowerShell.Management\Join-Path $PluginRoot "runtime/bin/kanon-dispatch.ps1"
if (-not (Microsoft.PowerShell.Management\Test-Path -LiteralPath $Dispatch -PathType Leaf)) {
  [Console]::Error.WriteLine("Kanon shared dispatch runtime is unavailable or unsafe.")
  [Console]::Error.WriteLine("Reinstall the complete self-contained Kanon plugin.")
  exit 127
}
$DispatchItem = Microsoft.PowerShell.Management\Get-Item -LiteralPath $Dispatch -ErrorAction Stop
if ($DispatchItem.LinkType) {
  [Console]::Error.WriteLine("Kanon shared dispatch runtime is unavailable or unsafe.")
  exit 127
}

& $Dispatch "resume" @args
exit $LASTEXITCODE
