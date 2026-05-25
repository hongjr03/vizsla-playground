import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { commitPresent, git, gitOutput, readJson, repoRoot, run } from "./script-utils.mjs";

const args = process.argv.slice(2);
let repository = "";
let ref = "";
let commit = "";
let version = "";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--repository") {
    repository = args[++index] ?? "";
  } else if (arg === "--ref") {
    ref = args[++index] ?? "";
  } else if (arg === "--commit") {
    commit = args[++index] ?? "";
  } else if (arg === "--version") {
    version = args[++index] ?? "";
  } else if (arg !== "--") {
    throw new Error(`Unknown argument '${arg}'.`);
  }
}

const lock = readJson(resolve(repoRoot, "emsdk.lock.json"));
repository ||= lock.repository || "https://github.com/emscripten-core/emsdk.git";
ref ||= lock.ref || "";
commit ||= lock.commit || "";
version ||= lock.version || "";
ref ||= commit;

if (!version) {
  throw new Error("No emsdk version configured. Set --version or update emsdk.lock.json.");
}

const toolchainRoot = resolve(repoRoot, ".toolchains");
const emsdkRoot = resolve(toolchainRoot, "emsdk");

if (!existsSync(emsdkRoot)) {
  git(["clone", "--filter=blob:none", "--no-recurse-submodules", repository, emsdkRoot]);
}

let targetCommit = commit;
if (targetCommit && commitPresent(emsdkRoot, targetCommit)) {
  targetCommit = gitOutput(["-C", emsdkRoot, "rev-parse", `${targetCommit}^{commit}`]);
} else {
  if (!ref) {
    throw new Error(`Pinned emsdk commit '${commit}' is not present locally and no fetch ref is configured.`);
  }
  git(["-C", emsdkRoot, "fetch", "--depth=1", "origin", ref]);
  targetCommit = commit
    ? gitOutput(["-C", emsdkRoot, "rev-parse", `${commit}^{commit}`])
    : gitOutput(["-C", emsdkRoot, "rev-parse", "FETCH_HEAD^{commit}"]);
}

const currentHead = gitOutput(["-C", emsdkRoot, "rev-parse", "HEAD"]);
if (currentHead !== targetCommit) {
  const dirty = gitOutput(["-C", emsdkRoot, "status", "--porcelain"]);
  if (dirty) {
    throw new Error(`emsdk checkout has local changes and is not at pinned commit '${targetCommit}'. Clean ${emsdkRoot} before switching refs.`);
  }
  git(["-C", emsdkRoot, "checkout", "--detach", targetCommit]);
}

const emsdkCommand = process.platform === "win32" ? resolve(emsdkRoot, "emsdk.bat") : resolve(emsdkRoot, "emsdk");
run(emsdkCommand, ["install", version], { cwd: emsdkRoot });
run(emsdkCommand, ["activate", version], { cwd: emsdkRoot });

console.log(`Emscripten SDK is ready at ${emsdkRoot}`);
