import { resolve } from "node:path";
import { repoRoot, run } from "./script-utils.mjs";

const args = process.argv.slice(2);
let base = "";
let site = "";
let skipWasm = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--base" || arg === "-Base") {
    base = args[++index] ?? "";
  } else if (arg === "--site" || arg === "-Site") {
    site = args[++index] ?? "";
  } else if (arg === "--skip-wasm" || arg === "-SkipWasm") {
    skipWasm = true;
  } else if (arg !== "--") {
    throw new Error(`Unknown argument '${arg}'.`);
  }
}

function normalizeBase(value) {
  if (!value || value === "/") {
    return "/";
  }
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

if (!base && process.env.ASTRO_BASE) {
  base = process.env.ASTRO_BASE;
}

if (!base && process.env.GITHUB_REPOSITORY) {
  const repositoryName = process.env.GITHUB_REPOSITORY.split("/").at(-1);
  base = repositoryName === `${process.env.GITHUB_REPOSITORY_OWNER}.github.io` ? "/" : `/${repositoryName}/`;
}

base = normalizeBase(base);

if (!site && process.env.ASTRO_SITE) {
  site = process.env.ASTRO_SITE;
}

if (!site && process.env.GITHUB_REPOSITORY_OWNER) {
  site = `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io`;
}

const env = {
  ...process.env,
  ASTRO_BASE: base,
};
if (site) {
  env.ASTRO_SITE = site;
}

if (!skipWasm) {
  run(process.execPath, [resolve(repoRoot, "scripts", "build-vizsla-wasm.mjs")], { env });
}

run("pnpm", ["build"], { env });
