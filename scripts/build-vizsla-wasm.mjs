import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { output, repoRoot, run } from "./script-utils.mjs";

const args = process.argv.slice(2);
const skipPrepare = args.includes("--skip-prepare");
const skipEmsdk = args.includes("--skip-emsdk");

if (args.some((arg) => !["--", "--skip-prepare", "--skip-emsdk"].includes(arg))) {
  throw new Error(`Unknown argument '${args.find((arg) => !["--", "--skip-prepare", "--skip-emsdk"].includes(arg))}'.`);
}

if (!skipPrepare) {
  run(process.execPath, [resolve(repoRoot, "scripts", "prepare-vizsla.mjs")]);
}

const emsdkRoot = resolve(repoRoot, ".toolchains", "emsdk");
const emsdkEnv = resolve(emsdkRoot, process.platform === "win32" ? "emsdk_env.bat" : "emsdk_env.sh");
if (!skipEmsdk && !existsSync(emsdkEnv)) {
  run(process.execPath, [resolve(repoRoot, "scripts", "setup-emsdk.mjs")]);
}
if (!existsSync(emsdkEnv)) {
  throw new Error(`${emsdkEnv} not found. Run pnpm setup:emsdk first.`);
}

const buildEnv = { ...process.env };
for (const entry of emsdkEnvironment(emsdkEnv)) {
  if (!entry) {
    continue;
  }
  const equals = entry.indexOf("=");
  if (equals > 0) {
    buildEnv[entry.slice(0, equals)] = entry.slice(equals + 1);
  }
}

run("rustup", ["target", "add", "--toolchain", "nightly", "wasm32-unknown-emscripten"], { env: buildEnv });
run("ninja", ["--version"], { env: buildEnv });

const emscriptenRoot = resolve(emsdkRoot, "upstream", "emscripten");
const emscriptenTool = (name) => resolve(emscriptenRoot, process.platform === "win32" ? `${name}.bat` : name);
const linkArgs = [
  "-C", "link-arg=-sENVIRONMENT=web,worker",
  "-C", "link-arg=-sMODULARIZE=1",
  "-C", "link-arg=-sEXPORT_ES6=1",
  "-C", "link-arg=-sEXPORT_NAME=createVizslaModule",
  "-C", "link-arg=-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToUTF8','lengthBytesUTF8']",
  "-C", "link-arg=-sEXPORTED_FUNCTIONS=['_malloc','_free','_vizsla_lsp_message','_vizsla_lsp_poll','_vizsla_lsp_write_file','_vizsla_lsp_reset','_vizsla_free_string']",
];

Object.assign(buildEnv, {
  EMSCRIPTEN_CMAKE_TOOLCHAIN_FILE: resolve(emscriptenRoot, "cmake", "Modules", "Platform", "Emscripten.cmake"),
  CMAKE_GENERATOR_wasm32_unknown_emscripten: "Ninja",
  EMCMAKE_wasm32_unknown_emscripten: emscriptenTool("emcmake"),
  EMMAKE_wasm32_unknown_emscripten: emscriptenTool("emmake"),
  CC_wasm32_unknown_emscripten: emscriptenTool("emcc"),
  CXX_wasm32_unknown_emscripten: emscriptenTool("em++"),
  AR_wasm32_unknown_emscripten: emscriptenTool("emar"),
  CARGO_TARGET_WASM32_UNKNOWN_EMSCRIPTEN_LINKER: emscriptenTool("emcc"),
  RUSTFLAGS: linkArgs.join(" "),
});

const crateManifest = resolve(repoRoot, "wasm", "vizsla-lsp", "Cargo.toml");
run("rustup", ["run", "nightly", "cargo", "build", "--manifest-path", crateManifest, "--target", "wasm32-unknown-emscripten", "--release"], {
  env: buildEnv,
});

const targetRoot = resolve(repoRoot, "wasm", "vizsla-lsp", "target", "wasm32-unknown-emscripten", "release");
const coreJs = resolve(targetRoot, "vizsla-lsp-wasm.js");
const coreWasm = resolve(targetRoot, "vizsla_lsp_wasm.wasm");
assertFile(coreJs, "Emscripten JavaScript output");
assertFile(coreWasm, "Emscripten WASM output");

const outWasmRoot = resolve(repoRoot, "public", "wasm");
mkdirSync(outWasmRoot, { recursive: true });
copyFileSync(coreJs, resolve(outWasmRoot, "vizsla-core.js"));
copyFileSync(coreWasm, resolve(outWasmRoot, "vizsla-core.wasm"));
copyFileSync(resolve(repoRoot, "wasm", "js", "vizsla-lsp.adapter.js"), resolve(outWasmRoot, "vizsla-lsp.js"));

console.log(`Built Vizsla WASM adapter into ${outWasmRoot}`);

function emsdkEnvironment(emsdkEnv) {
  if (process.platform === "win32") {
    const tempRoot = mkdtempSync(join(tmpdir(), "vizsla-emsdk-env-"));
    const commandPath = join(tempRoot, "env.cmd");
    writeFileSync(commandPath, '@echo off\r\ncall "%EMSDK_ENV_PATH%" >nul\r\nset\r\n');
    try {
      return output("cmd.exe", ["/d", "/c", commandPath], {
        env: { ...process.env, EMSDK_ENV_PATH: emsdkEnv },
        maxBuffer: 1024 * 1024,
      }).split(/\r?\n/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  return output("bash", ["-lc", "source \"$EMSDK_ENV\" >/dev/null && env -0"], {
    env: { ...process.env, EMSDK_ENV: emsdkEnv },
    maxBuffer: 1024 * 1024,
  }).split("\0");
}

function assertFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} not found at ${path}`);
  }
}
