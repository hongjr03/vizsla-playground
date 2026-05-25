import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { repoRoot, run } from "./script-utils.mjs";

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

vizslaRoot ||= resolve(repoRoot, ".vendor", "vizsla");
if (!existsSync(vizslaRoot)) {
  throw new Error(`Vizsla checkout not found at ${vizslaRoot}. Run pnpm prepare:vizsla first.`);
}

run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build:embed"]);

const docsPublic = resolve(vizslaRoot, "docs", "public", "vizsla-lab");
const docsComponents = resolve(vizslaRoot, "docs", "src", "components");
const docsContent = resolve(vizslaRoot, "docs", "src", "content", "docs");
mkdirSync(docsComponents, { recursive: true });
mkdirSync(docsContent, { recursive: true });

rmSync(docsPublic, { recursive: true, force: true });
cpSync(resolve(repoRoot, "dist", "embed"), docsPublic, { recursive: true, force: true });

writeFileSync(
  resolve(docsComponents, "VizslaLab.astro"),
  `---
const { scenario = "counter", height = "620px" } = Astro.props;
const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : \`\${import.meta.env.BASE_URL}/\`;
const assetBase = \`\${base}vizsla-lab/\`;
---

<vizsla-lab
  docs
  scenario={scenario}
  height={height}
  wasm-base-url={\`\${assetBase}wasm/\`}
  vscode-assets-url={\`\${assetBase}vscode/\`}
></vizsla-lab>

<script type="module" src={\`\${assetBase}vizsla-lab.es.js\`}></script>
`,
);

writeFileSync(
  resolve(docsContent, "playground.mdx"),
  `---
title: Vizsla Lab
description: Run the Vizsla language server directly in the browser.
---

import VizslaLab from '../../components/VizslaLab.astro';

<VizslaLab scenario="macro-guard" />
`,
);

console.log(`Installed Vizsla Lab docs widget into ${resolve(vizslaRoot, "docs")}`);
