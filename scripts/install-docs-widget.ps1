param(
  [string]$VizslaRoot = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if ([string]::IsNullOrWhiteSpace($VizslaRoot)) {
  $VizslaRoot = Join-Path $RepoRoot ".vendor\vizsla"
}
if (!(Test-Path $VizslaRoot)) {
  throw "Vizsla checkout not found at $VizslaRoot. Run pnpm prepare:vizsla first."
}

pnpm build:embed

$DocsPublic = Join-Path $VizslaRoot "docs\public\vizsla-lab"
$DocsComponents = Join-Path $VizslaRoot "docs\src\components"
$DocsContent = Join-Path $VizslaRoot "docs\src\content\docs"
New-Item -ItemType Directory -Force $DocsPublic | Out-Null
New-Item -ItemType Directory -Force $DocsComponents | Out-Null
New-Item -ItemType Directory -Force $DocsContent | Out-Null

Copy-Item -Recurse -Force (Join-Path $RepoRoot "dist\embed\*") $DocsPublic
Copy-Item -Recurse -Force (Join-Path $RepoRoot "public\wasm") (Join-Path $DocsPublic "wasm")
Copy-Item -Recurse -Force (Join-Path $RepoRoot "public\vscode") (Join-Path $DocsPublic "vscode")

$Component = @'
---
const { scenario = "counter", height = "620px" } = Astro.props;
const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const assetBase = `${base}vizsla-lab/`;
---

<vizsla-lab
  docs
  scenario={scenario}
  height={height}
  wasm-base-url={`${assetBase}wasm/`}
  vscode-assets-url={`${assetBase}vscode/`}
></vizsla-lab>

<script type="module" src={`${assetBase}vizsla-lab.es.js`}></script>
'@

Set-Content -NoNewline -Encoding UTF8 (Join-Path $DocsComponents "VizslaLab.astro") $Component

$Example = @'
---
title: Vizsla Lab
description: Run the Vizsla language server directly in the browser.
---

import VizslaLab from '../../components/VizslaLab.astro';

<VizslaLab scenario="macro-guard" />
'@

Set-Content -NoNewline -Encoding UTF8 (Join-Path $DocsContent "playground.mdx") $Example
Write-Host "Installed Vizsla Lab docs widget into $VizslaRoot\docs"
