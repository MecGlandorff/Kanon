$ErrorActionPreference = "Stop"

function Resolve-KanonDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [int]$LinkDepth = 0
  )

  if ($LinkDepth -gt 64) {
    throw "Kanon refused an excessive directory-link chain."
  }

  $ResolvedPath = (Microsoft.PowerShell.Management\Resolve-Path -LiteralPath $LiteralPath -ErrorAction Stop).Path
  $PathRoot = [System.IO.Path]::GetPathRoot($ResolvedPath)
  if ([string]::IsNullOrWhiteSpace($PathRoot)) {
    throw "Kanon could not safely resolve a directory root."
  }
  $CurrentItem = [System.IO.DirectoryInfo]::new($PathRoot)
  $CurrentItem.Refresh()
  if (
    -not $CurrentItem.Exists -or
    ($CurrentItem.Attributes -band [System.IO.FileAttributes]::Directory) -eq 0
  ) {
    throw "Kanon expected a directory root while resolving a trusted path."
  }
  $CurrentPath = $CurrentItem.FullName
  $RelativePath = $ResolvedPath.Substring($PathRoot.Length)
  $PathComponents = $RelativePath.Split(
    [char[]]@(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    ),
    [System.StringSplitOptions]::RemoveEmptyEntries
  )
  foreach ($PathComponent in $PathComponents) {
    $NextPath = [System.IO.Path]::Combine($CurrentPath, $PathComponent)
    $Item = [System.IO.DirectoryInfo]::new($NextPath)
    $Item.Refresh()
    if (
      -not $Item.Exists -or
      ($Item.Attributes -band [System.IO.FileAttributes]::Directory) -eq 0
    ) {
      throw "Kanon expected a directory while resolving a trusted path."
    }
    if (
      ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
    ) {
      $ResolveLinkTarget = $Item.PSObject.Methods["ResolveLinkTarget"]
      if ($null -eq $ResolveLinkTarget) {
        throw "Kanon could not safely resolve a directory link."
      }
      $Item = $Item.ResolveLinkTarget($true)
      if (
        $null -eq $Item -or
        -not $Item.Exists -or
        ($Item.Attributes -band [System.IO.FileAttributes]::Directory) -eq 0 -or
        ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
      ) {
        throw "Kanon could not safely resolve a directory link."
      }
      $CurrentPath = Resolve-KanonDirectory -LiteralPath $Item.FullName -LinkDepth ($LinkDepth + 1)
    } else {
      $CurrentPath = $Item.FullName
    }
  }

  $FullName = [System.IO.Path]::GetFullPath($CurrentPath)
  if (
    [string]::IsNullOrWhiteSpace($FullName) -or
    -not [System.IO.Path]::IsPathRooted($FullName) -or
    $FullName.Contains([char]10) -or
    $FullName.Contains([char]13)
  ) {
    throw "Kanon could not safely resolve a directory."
  }
  $FullNameRoot = [System.IO.Path]::GetPathRoot($FullName)
  if ($FullName.Length -gt $FullNameRoot.Length) {
    $FullName = $FullName.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    )
  }
  return $FullName
}

if ($args.Count -lt 1) {
  [Console]::Error.WriteLine("Kanon requires a fixed supported command.")
  exit 127
}
$KanonCommand = [string]$args[0]
[string[]]$KanonArguments = @()
if ($args.Count -gt 1) {
  $KanonArguments = [string[]]$args[1..($args.Count - 1)]
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

$PluginRoot = Resolve-KanonDirectory (
  Microsoft.PowerShell.Management\Join-Path $PSScriptRoot "../.."
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

$RepositoryRoot = Resolve-KanonDirectory (
  (Microsoft.PowerShell.Management\Get-Location).Path
)
$RepositoryPrefix = $RepositoryRoot + [System.IO.Path]::DirectorySeparatorChar
$SafePathEntries = @()
foreach ($PathEntry in $PathValue.Split([System.IO.Path]::PathSeparator)) {
  if ([string]::IsNullOrWhiteSpace($PathEntry) -or -not [System.IO.Path]::IsPathRooted($PathEntry)) {
    continue
  }
  try {
    $PathDirectory = Resolve-KanonDirectory $PathEntry
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
$NodePath = $null
if ($NodeItem.PSIsContainer) {
  [Console]::Error.WriteLine("Kanon could not safely resolve the Node.js executable.")
  exit 127
}
$NodePath = $NodeItem.FullName
if ($NodeItem.LinkType) {
  $ResolveLinkTarget = $NodeItem.PSObject.Methods["ResolveLinkTarget"]
  if ($null -eq $ResolveLinkTarget) {
    [Console]::Error.WriteLine("Kanon could not safely resolve the Node.js executable.")
    exit 127
  }
  $NodeItem = $NodeItem.ResolveLinkTarget($true)
  if ($null -eq $NodeItem -or $NodeItem.PSIsContainer -or $NodeItem.LinkType) {
    [Console]::Error.WriteLine("Kanon could not safely resolve the Node.js executable.")
    exit 127
  }
  $NodePath = $NodeItem.FullName
}
if (
  [string]::IsNullOrWhiteSpace($NodePath) -or
  -not [System.IO.Path]::IsPathRooted($NodePath) -or
  -not [System.IO.File]::Exists($NodePath) -or
  $NodePath.Contains([char]10) -or
  $NodePath.Contains([char]13)
) {
  [Console]::Error.WriteLine("Kanon could not safely resolve the Node.js executable.")
  exit 127
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
  $NodeProbe = @(& $NodePath -p 'process.versions.node.split(String.fromCharCode(46))[0]')
  $NodeProbeExitCode = $LASTEXITCODE
  if (
    $NodeProbeExitCode -ne 0 -or
    $NodeProbe.Count -ne 1 -or
    ([string]$NodeProbe[0]) -notmatch '^(20|22|24|25)$'
  ) {
    [Console]::Error.WriteLine("Kanon requires Node.js major 20, 22, 24, or 25.")
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
