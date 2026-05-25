param(
  [string]$Repository = "",
  [string]$Ref = "",
  [string]$Commit = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VendorRoot = Join-Path $RepoRoot ".vendor"
$VizslaRoot = Join-Path $VendorRoot "vizsla"
$LockPath = Join-Path $RepoRoot "vizsla.lock.json"

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
}

if ([string]::IsNullOrWhiteSpace($Repository)) {
  $Repository = "https://github.com/pascal-lab/vizsla.git"
}
if ([string]::IsNullOrWhiteSpace($Ref)) {
  $Ref = $Commit
}
if ([string]::IsNullOrWhiteSpace($Ref)) {
  throw "No Vizsla ref configured. Set -Ref or update $LockPath."
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

function Test-VizslaCommitPresent {
  param([string]$Sha)

  if ([string]::IsNullOrWhiteSpace($Sha)) {
    return $false
  }

  & git -C $VizslaRoot rev-parse --verify "$Sha^{commit}" *> $null
  return $LASTEXITCODE -eq 0
}

New-Item -ItemType Directory -Force $VendorRoot | Out-Null

if (!(Test-Path $VizslaRoot)) {
  Invoke-NativeChecked git @("clone", "--filter=blob:none", "--no-recurse-submodules", $Repository, $VizslaRoot)
}

$CurrentHead = Invoke-NativeOutput git @("-C", $VizslaRoot, "rev-parse", "HEAD")
$TargetCommit = $Commit
if (![string]::IsNullOrWhiteSpace($TargetCommit) -and (Test-VizslaCommitPresent $TargetCommit)) {
  $TargetCommit = Invoke-NativeOutput git @("-C", $VizslaRoot, "rev-parse", "$TargetCommit^{commit}")
} else {
  try {
    Invoke-NativeChecked git @("-C", $VizslaRoot, "fetch", "--depth=1", "origin", $Ref)
  } catch {
    if ([string]::IsNullOrWhiteSpace($Commit)) {
      throw
    }
    if (!(Test-VizslaCommitPresent $Commit)) {
      throw "Could not fetch Vizsla ref '$Ref', and pinned commit '$Commit' is not present locally. $($_.Exception.Message)"
    }
  }

  if ([string]::IsNullOrWhiteSpace($Commit)) {
    $TargetCommit = Invoke-NativeOutput git @("-C", $VizslaRoot, "rev-parse", "FETCH_HEAD^{commit}")
  } else {
    if (!(Test-VizslaCommitPresent $Commit)) {
      throw "Fetched '$Ref', but pinned commit '$Commit' is still unavailable."
    }
    $TargetCommit = Invoke-NativeOutput git @("-C", $VizslaRoot, "rev-parse", "$Commit^{commit}")
  }
}

if ($CurrentHead -ne $TargetCommit) {
  $Dirty = Invoke-NativeOutput git @("-C", $VizslaRoot, "status", "--porcelain")
  if (![string]::IsNullOrWhiteSpace($Dirty)) {
    throw "Vizsla checkout has local changes and is not at pinned commit '$TargetCommit'. Clean $VizslaRoot before switching refs."
  }
  Invoke-NativeChecked git @("-C", $VizslaRoot, "checkout", "--detach", $TargetCommit)
}
Write-Host "Using Vizsla commit $TargetCommit."

$PatchRoot = Join-Path $RepoRoot "patches\vizsla"
if (Test-Path $PatchRoot) {
  foreach ($Patch in Get-ChildItem -Path $PatchRoot -Filter "*.patch" | Sort-Object Name) {
    try {
      & git -C $VizslaRoot apply --reverse --check $Patch.FullName *> $null
      $ReverseCheckExitCode = $LASTEXITCODE
    } catch {
      $ReverseCheckExitCode = if ($LASTEXITCODE -ne 0) { $LASTEXITCODE } else { 1 }
      $Error.RemoveAt(0)
    }

    if ($ReverseCheckExitCode -eq 0) {
      Write-Host "Vizsla patch already applied: $($Patch.Name)"
    } else {
      Invoke-NativeChecked git @("-C", $VizslaRoot, "apply", "--check", $Patch.FullName)
      Invoke-NativeChecked git @("-C", $VizslaRoot, "apply", $Patch.FullName)
      Write-Host "Applied Vizsla patch: $($Patch.Name)"
    }
  }
}

& (Join-Path $PSScriptRoot "sync-vscode-assets.ps1") -VizslaRoot $VizslaRoot
