import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { findFirstFile, output, repoRoot, run } from "./script-utils.mjs";

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
const coreJs = findFirstFile(targetRoot, ".js");
const coreWasm = findFirstFile(targetRoot, ".wasm");
if (!coreJs || !coreWasm) {
  throw new Error(`Emscripten output did not include both JS and WASM under ${targetRoot}`);
}

const outWasmRoot = resolve(repoRoot, "public", "wasm");
mkdirSync(outWasmRoot, { recursive: true });
copyFileSync(coreJs, resolve(outWasmRoot, "vizsla-core.js"));
copyFileSync(coreWasm, resolve(outWasmRoot, "vizsla-core.wasm"));
copyFileSync(resolve(repoRoot, "wasm", "js", "vizsla-lsp.adapter.js"), resolve(outWasmRoot, "vizsla-lsp.js"));

console.log(`Built Vizsla WASM adapter into ${outWasmRoot}`);

function emsdkEnvironment(emsdkEnv) {
  if (process.platform === "win32") {
    return output("cmd.exe", ["/d", "/s", "/c", `call "${emsdkEnv}" >nul && set`], {
      maxBuffer: 1024 * 1024,
    }).split(/\r?\n/);
  }

  return output("bash", ["-lc", "source \"$EMSDK_ENV\" >/dev/null && env -0"], {
    env: { ...process.env, EMSDK_ENV: emsdkEnv },
    maxBuffer: 1024 * 1024,
  }).split("\0");
}
