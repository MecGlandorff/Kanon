$ErrorActionPreference = "Stop"

$KanonCommand = "todo"
$LocalKanon = Join-Path $PSScriptRoot "../../../runtime/bin/kanon.js"

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
