import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Use relative asset URLs so the built app works on GitHub Pages
  // and can also be opened from dist/index.html on local machines.
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        debug: resolve(__dirname, "debug/index.html"),
        lab: resolve(__dirname, "lab/index.html"),
      },
    },
  },
  plugins: [react()],
});
