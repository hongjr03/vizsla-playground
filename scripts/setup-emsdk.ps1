param(
  [string]$Repository = "",
  [string]$Ref = "",
  [string]$Commit = "",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ToolchainRoot = Join-Path $RepoRoot ".toolchains"
$EmsdkRoot = Join-Path $ToolchainRoot "emsdk"
$LockPath = Join-Path $RepoRoot "emsdk.lock.json"

if (Test-Path $LockPath) {
  $Lock = Get-Content -Raw -Path $LockPath | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($Repository) -and $Lock.repository) {
    $Repository = $Lock.repository
  }
  if ([string]::IsNullOrWhiteSpace($Ref) -and $Lock.ref) {
    $Ref = $Lock.ref
  }
  if ([string]::IsNullOrWhiteSpace($Commit) -and $Lock.commit) {
    $Commit = $Lock.commit
  }
  if ([string]::IsNullOrWhiteSpace($Version) -and $Lock.version) {
    $Version = $Lock.version
  }
}

if ([string]::IsNullOrWhiteSpace($Repository)) {
  $Repository = "https://github.com/emscripten-core/emsdk.git"
}
if ([string]::IsNullOrWhiteSpace($Version)) {
  throw "No emsdk version configured. Set -Version or update $LockPath."
}
if ([string]::IsNullOrWhiteSpace($Ref)) {
  $Ref = $Commit
}

function Invoke-NativeChecked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Invoke-NativeOutput {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  $output = & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
  return ($output -join "`n").Trim()
}

function Test-EmsdkCommitPresent {
  param([string]$Sha)

  if ([string]::IsNullOrWhiteSpace($Sha)) {
    return $false
  }

  & git -C $EmsdkRoot rev-parse --verify "$Sha^{commit}" *> $null
  return $LASTEXITCODE -eq 0
}

New-Item -ItemType Directory -Force $ToolchainRoot | Out-Null

if (!(Test-Path $EmsdkRoot)) {
  Invoke-NativeChecked git @("clone", "--filter=blob:none", "--no-recurse-submodules", $Repository, $EmsdkRoot)
}

$CurrentHead = Invoke-NativeOutput git @("-C", $EmsdkRoot, "rev-parse", "HEAD")
$TargetCommit = $Commit
if (![string]::IsNullOrWhiteSpace($TargetCommit) -and (Test-EmsdkCommitPresent $TargetCommit)) {
  $TargetCommit = Invoke-NativeOutput git @("-C", $EmsdkRoot, "rev-parse", "$TargetCommit^{commit}")
} else {
  if ([string]::IsNullOrWhiteSpace($Ref)) {
    throw "Pinned emsdk commit '$Commit' is not present locally and no fetch ref is configured."
  }
  Invoke-NativeChecked git @("-C", $EmsdkRoot, "fetch", "--depth=1", "origin", $Ref)
  if ([string]::IsNullOrWhiteSpace($Commit)) {
    $TargetCommit = Invoke-NativeOutput git @("-C", $EmsdkRoot, "rev-parse", "FETCH_HEAD^{commit}")
  } else {
    if (!(Test-EmsdkCommitPresent $Commit)) {
      throw "Fetched '$Ref', but pinned emsdk commit '$Commit' is still unavailable."
    }
    $TargetCommit = Invoke-NativeOutput git @("-C", $EmsdkRoot, "rev-parse", "$Commit^{commit}")
  }
}

if ($CurrentHead -ne $TargetCommit) {
  $Dirty = Invoke-NativeOutput git @("-C", $EmsdkRoot, "status", "--porcelain")
  if (![string]::IsNullOrWhiteSpace($Dirty)) {
    throw "emsdk checkout has local changes and is not at pinned commit '$TargetCommit'. Clean $EmsdkRoot before switching refs."
  }
  Invoke-NativeChecked git @("-C", $EmsdkRoot, "checkout", "--detach", $TargetCommit)
}

$EmsdkBat = Join-Path $EmsdkRoot "emsdk.bat"
Invoke-NativeChecked $EmsdkBat @("install", $Version)
Invoke-NativeChecked $EmsdkBat @("activate", $Version)

Write-Host "Emscripten SDK is ready at $EmsdkRoot"
Write-Host "Use: . $EmsdkRoot\emsdk_env.ps1"
