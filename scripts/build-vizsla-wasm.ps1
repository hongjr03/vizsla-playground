param(
  [switch]$SkipPrepare,
  [switch]$SkipEmsdk
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$EmsdkRoot = Join-Path $RepoRoot ".toolchains\emsdk"
$CrateManifest = Join-Path $RepoRoot "wasm\vizsla-lsp\Cargo.toml"
$OutWasmRoot = Join-Path $RepoRoot "public\wasm"

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

if (!$SkipPrepare) {
  & (Join-Path $PSScriptRoot "prepare-vizsla.ps1")
}

if (!$SkipEmsdk -and !(Test-Path (Join-Path $EmsdkRoot "emsdk_env.ps1"))) {
  & (Join-Path $PSScriptRoot "setup-emsdk.ps1")
}

if (!(Test-Path (Join-Path $EmsdkRoot "emsdk_env.ps1"))) {
  throw "emsdk_env.ps1 not found. Run pnpm setup:emsdk first."
}

$env:EMSDK_QUIET = "1"
. (Join-Path $EmsdkRoot "emsdk_env.ps1") | Out-Null

Invoke-NativeChecked rustup @("target", "add", "--toolchain", "nightly", "wasm32-unknown-emscripten")
Invoke-NativeChecked ninja @("--version")

$EmscriptenRoot = Join-Path $EmsdkRoot "upstream\emscripten"
$Emcc = Join-Path $EmscriptenRoot "emcc.bat"
$Emxx = Join-Path $EmscriptenRoot "em++.bat"
$Emar = Join-Path $EmscriptenRoot "emar.bat"
$Emcmake = Join-Path $EmscriptenRoot "emcmake.bat"
$Emmake = Join-Path $EmscriptenRoot "emmake.bat"
$env:EMSCRIPTEN_CMAKE_TOOLCHAIN_FILE = Join-Path $EmsdkRoot "upstream\emscripten\cmake\Modules\Platform\Emscripten.cmake"
$env:CMAKE_GENERATOR_wasm32_unknown_emscripten = "Ninja"
$env:EMCMAKE_wasm32_unknown_emscripten = $Emcmake
$env:EMMAKE_wasm32_unknown_emscripten = $Emmake
$env:CC_wasm32_unknown_emscripten = $Emcc
$env:CXX_wasm32_unknown_emscripten = $Emxx
$env:AR_wasm32_unknown_emscripten = $Emar
$env:CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_LINKER = $Emcc

$LinkArgs = @(
  "-C", "link-arg=-sENVIRONMENT=web,worker",
  "-C", "link-arg=-sMODULARIZE=1",
  "-C", "link-arg=-sEXPORT_ES6=1",
  "-C", "link-arg=-sEXPORT_NAME=createVizslaModule",
  "-C", "link-arg=-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToUTF8','lengthBytesUTF8']",
  "-C", "link-arg=-sEXPORTED_FUNCTIONS=['_malloc','_free','_vizsla_lsp_message','_vizsla_lsp_poll','_vizsla_lsp_write_file','_vizsla_lsp_reset','_vizsla_free_string']"
)
$env:RUSTFLAGS = $LinkArgs -join " "

Invoke-NativeChecked rustup @("run", "nightly", "cargo", "build", "--manifest-path", $CrateManifest, "--target", "wasm32-unknown-emscripten", "--release")

New-Item -ItemType Directory -Force $OutWasmRoot | Out-Null
$TargetRoot = Join-Path $RepoRoot "wasm\vizsla-lsp\target\wasm32-unknown-emscripten\release"
$CoreJs = Get-ChildItem -Path $TargetRoot -Filter "*.js" -Recurse | Select-Object -First 1
$CoreWasm = Get-ChildItem -Path $TargetRoot -Filter "*.wasm" -Recurse | Select-Object -First 1

if (!$CoreJs -or !$CoreWasm) {
  throw "Emscripten output did not include both JS and WASM under $TargetRoot"
}

Copy-Item -Force $CoreJs.FullName (Join-Path $OutWasmRoot "vizsla-core.js")
Copy-Item -Force $CoreWasm.FullName (Join-Path $OutWasmRoot "vizsla-core.wasm")
Copy-Item -Force (Join-Path $RepoRoot "wasm\js\vizsla-lsp.adapter.js") (Join-Path $OutWasmRoot "vizsla-lsp.js")

Write-Host "Built Vizsla WASM adapter into $OutWasmRoot"
