$ErrorActionPreference = "Stop"

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
$StableCommands = @("ask", "aswitch", "brief", "orient", "resume", "status", "steer", "verify")
$WriteCommands = @("refresh", "todo")
if ($StableCommands -ccontains $KanonCommand) {
  $RuntimeName = "kanon-v1.js"
} elseif ($WriteCommands -ccontains $KanonCommand) {
  $RuntimeName = "kanon-write.js"
} else {
  [Console]::Error.WriteLine("Kanon refused an unsupported dispatch command.")
  exit 127
}

$PluginRoot = (Microsoft.PowerShell.Management\Resolve-Path -LiteralPath (Microsoft.PowerShell.Management\Join-Path $PSScriptRoot "../..") -ErrorAction Stop).Path.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$PluginPrefix = $PluginRoot + [System.IO.Path]::DirectorySeparatorChar
$LocalKanon = Microsoft.PowerShell.Management\Join-Path $PSScriptRoot $RuntimeName
$LocalKanonItem = Microsoft.PowerShell.Management\Get-Item -LiteralPath $LocalKanon -ErrorAction Stop
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

$RepositoryRoot = (Microsoft.PowerShell.Management\Resolve-Path -LiteralPath (Microsoft.PowerShell.Management\Get-Location).Path -ErrorAction Stop).Path.TrimEnd(
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
    $PathDirectory = (Microsoft.PowerShell.Management\Resolve-Path -LiteralPath $PathEntry -ErrorAction Stop).Path
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

$NodeItem = Microsoft.PowerShell.Management\Get-Item -LiteralPath $NodeCandidate -ErrorAction Stop
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
