import { defineConfig } from "astro/config";

export default defineConfig({
  vite: {
    worker: {
      format: "es",
    },
  },
});
