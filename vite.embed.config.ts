import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist/embed",
    emptyOutDir: true,
    lib: {
      entry: "src/components/vizsla-lab.ts",
      name: "VizslaLab",
      formats: ["es"],
      fileName: (format) => `vizsla-lab.${format}.js`,
    },
  },
  worker: {
    format: "es",
  },
});
