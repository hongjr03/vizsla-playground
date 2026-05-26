import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { commitPresent, git, gitOutput, readJson, repoRoot, run, tryRun } from "./script-utils.mjs";

const args = process.argv.slice(2);
let repository = "";
let ref = "";
let commit = "";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--repository") {
    repository = args[++index] ?? "";
  } else if (arg === "--ref") {
    ref = args[++index] ?? "";
  } else if (arg === "--commit") {
    commit = args[++index] ?? "";
  } else if (arg !== "--") {
    throw new Error(`Unknown argument '${arg}'.`);
  }
}

const lock = readJson(resolve(repoRoot, "vizsla.lock.json"));
repository ||= lock.repository || "https://github.com/pascal-lab/vizsla.git";
ref ||= lock.ref || "";
commit ||= lock.commit || "";
ref ||= commit;

if (!ref) {
  throw new Error("No Vizsla ref configured. Set --ref or update vizsla.lock.json.");
}

const vendorRoot = resolve(repoRoot, ".vendor");
const vizslaRoot = resolve(vendorRoot, "vizsla");
const patchRoot = resolve(repoRoot, "patches", "vizsla");
const patches = existsSync(patchRoot) ? gitOutput(["ls-files", "patches/vizsla/*.patch"]).split(/\r?\n/).filter(Boolean).sort() : [];

if (!existsSync(vizslaRoot)) {
  git(["clone", "--filter=blob:none", "--no-recurse-submodules", repository, vizslaRoot]);
}

let targetCommit = commit;
if (targetCommit && commitPresent(vizslaRoot, targetCommit)) {
  targetCommit = gitOutput(["-C", vizslaRoot, "rev-parse", `${targetCommit}^{commit}`]);
} else {
  try {
    git(["-C", vizslaRoot, "fetch", "--depth=1", "origin", ref]);
  } catch (error) {
    if (!commit || !commitPresent(vizslaRoot, commit)) {
      throw error;
    }
  }
  targetCommit = commit
    ? gitOutput(["-C", vizslaRoot, "rev-parse", `${commit}^{commit}`])
    : gitOutput(["-C", vizslaRoot, "rev-parse", "FETCH_HEAD^{commit}"]);
}

const currentHead = gitOutput(["-C", vizslaRoot, "rev-parse", "HEAD"]);
if (currentHead !== targetCommit) {
  let dirty = gitOutput(["-C", vizslaRoot, "status", "--porcelain"]);
  if (dirty) {
    reverseAppliedPatches(vizslaRoot, patches);
    dirty = gitOutput(["-C", vizslaRoot, "status", "--porcelain"]);
  }
  if (dirty) {
    throw new Error(`Vizsla checkout has local changes and is not at pinned commit '${targetCommit}'. Clean ${vizslaRoot} before switching refs.`);
  }
  git(["-C", vizslaRoot, "checkout", "--detach", targetCommit]);
}

console.log(`Using Vizsla commit ${targetCommit}.`);

for (const patch of patches) {
  const patchPath = resolve(repoRoot, patch);
  if (tryRun("git", ["-C", vizslaRoot, "apply", "--reverse", "--check", patchPath])) {
    console.log(`Vizsla patch already applied: ${patchName(patch)}`);
    continue;
  }
  git(["-C", vizslaRoot, "apply", "--check", patchPath]);
  git(["-C", vizslaRoot, "apply", patchPath]);
  console.log(`Applied Vizsla patch: ${patchName(patch)}`);
}

run(process.execPath, [resolve(repoRoot, "scripts", "sync-vscode-assets.mjs"), "--vizsla-root", vizslaRoot]);

function reverseAppliedPatches(root, patchFiles) {
  for (const patch of [...patchFiles].reverse()) {
    const patchPath = resolve(repoRoot, patch);
    if (!tryRun("git", ["-C", root, "apply", "--reverse", "--check", patchPath])) {
      continue;
    }
    git(["-C", root, "apply", "--reverse", patchPath]);
    console.log(`Reversed applied Vizsla patch before switching refs: ${patchName(patch)}`);
  }
}

function patchName(patch) {
  return patch.split(/[\\/]/).pop();
}
