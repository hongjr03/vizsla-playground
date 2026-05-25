import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { directoryExists, repoRoot } from "./script-utils.mjs";

const args = process.argv.slice(2);
let vizslaRoot = "";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--vizsla-root") {
    vizslaRoot = args[++index] ?? "";
  } else if (arg !== "--") {
    throw new Error(`Unknown argument '${arg}'.`);
  }
}

if (!vizslaRoot) {
  const vendorRoot = resolve(repoRoot, ".vendor", "vizsla");
  if (directoryExists(vendorRoot)) {
    vizslaRoot = vendorRoot;
  } else if (process.platform === "win32" && directoryExists("D:\\Proj\\vizsla")) {
    vizslaRoot = "D:\\Proj\\vizsla";
  }
}

if (!vizslaRoot) {
  throw new Error("Vizsla checkout not found. Run pnpm prepare:vizsla first or pass --vizsla-root.");
}

const vscodeRoot = resolve(vizslaRoot, "editors", "vscode");
const syntaxRoot = resolve(vscodeRoot, "syntaxes");
if (!directoryExists(syntaxRoot)) {
  throw new Error(`VS Code extension syntaxes not found at ${syntaxRoot}`);
}

const outRoot = resolve(repoRoot, "public", "vscode");
const outSyntaxRoot = resolve(outRoot, "syntaxes");
mkdirSync(outSyntaxRoot, { recursive: true });

copyFileSync(resolve(vscodeRoot, "language-configuration.json"), resolve(outRoot, "language-configuration.json"));
copyFileSync(resolve(syntaxRoot, "verilog.tmLanguage.json"), resolve(outSyntaxRoot, "verilog.tmLanguage.json"));
copyFileSync(resolve(syntaxRoot, "systemverilog.tmLanguage.json"), resolve(outSyntaxRoot, "systemverilog.tmLanguage.json"));

console.log(`Synced Vizsla VS Code grammar assets from ${vscodeRoot}`);
