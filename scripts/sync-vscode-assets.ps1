param(
  [string]$VizslaRoot = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([string]::IsNullOrWhiteSpace($VizslaRoot)) {
  $VendorRoot = Join-Path $RepoRoot ".vendor\vizsla"
  if (Test-Path $VendorRoot) {
    $VizslaRoot = $VendorRoot
  } elseif (Test-Path "D:\Proj\vizsla\editors\vscode") {
    $VizslaRoot = "D:\Proj\vizsla"
  } else {
    throw "Vizsla checkout not found. Run pnpm prepare:vizsla first or pass -VizslaRoot."
  }
}

$VscodeRoot = Join-Path $VizslaRoot "editors\vscode"
$SyntaxRoot = Join-Path $VscodeRoot "syntaxes"
if (!(Test-Path $SyntaxRoot)) {
  throw "VS Code extension syntaxes not found at $SyntaxRoot"
}

$OutRoot = Join-Path $RepoRoot "public\vscode"
$OutSyntaxRoot = Join-Path $OutRoot "syntaxes"
New-Item -ItemType Directory -Force $OutSyntaxRoot | Out-Null

Copy-Item -Force (Join-Path $VscodeRoot "language-configuration.json") (Join-Path $OutRoot "language-configuration.json")
Copy-Item -Force (Join-Path $SyntaxRoot "verilog.tmLanguage.json") (Join-Path $OutSyntaxRoot "verilog.tmLanguage.json")
Copy-Item -Force (Join-Path $SyntaxRoot "systemverilog.tmLanguage.json") (Join-Path $OutSyntaxRoot "systemverilog.tmLanguage.json")

Write-Host "Synced Vizsla VS Code grammar assets from $VscodeRoot"
