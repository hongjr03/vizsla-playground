# Vizsla Playground

Browser playground for Vizsla with an Astro page and an embeddable docs widget.

## Local Build

```sh
pnpm install
pnpm build:wasm
pnpm dev
```

Open `http://127.0.0.1:5177/`.

The docs-style embedded widget example is available at `http://127.0.0.1:5177/embed-example/`.

## GitHub Pages

Set the repository Pages source to GitHub Actions, then push to `main` or `master`, or run the `GitHub Pages` workflow manually.

The workflow calls:

```sh
pnpm build:pages
```

`build:pages` builds the Vizsla WASM adapter, runs the Astro build, and derives `ASTRO_BASE` from `GITHUB_REPOSITORY` so project pages work under `/<repo>/`.

For a local Pages-style build without rebuilding WASM:

```sh
pnpm build:pages -- --base /vizsla-playground/ --skip-wasm
```
