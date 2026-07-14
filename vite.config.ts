import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Percorsi relativi: la stessa build funziona su qualsiasi repository GitHub Pages.
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
