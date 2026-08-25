import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// maplibre-gl loads its worker and its shared chunk via a URL string built
// at runtime (`new URL('./maplibre-gl-worker.mjs', <its own script URL>)`,
// same pattern for maplibre-gl-shared.mjs), not a static
// `new Worker(new URL(...))` expression -- so Rollup's worker bundling
// (which only recognizes the static form) never picks either file up or
// copies it into the production build, and both requests 404 at runtime
// (confirmed live: 404s into the SPA's own index.html, which the browser
// then rejects as a non-JS MIME type for a module script). Copy the files
// Rollup misses into the same assets/ dir as the bundled JS (where
// maplibre resolves those relative URLs against) so they're actually
// there once built. Dev mode never hits this because Vite's dev server
// serves node_modules files directly at their real path.
const MAPLIBRE_RUNTIME_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

function copyMaplibreWorker(): Plugin {
  return {
    name: "copy-maplibre-worker",
    apply: "build",
    closeBundle() {
      const destDir = fileURLToPath(new URL("./dist/assets/", import.meta.url));
      mkdirSync(destDir, { recursive: true });
      for (const file of MAPLIBRE_RUNTIME_FILES) {
        const src = fileURLToPath(new URL(`./node_modules/maplibre-gl/dist/${file}`, import.meta.url));
        copyFileSync(src, destDir + file);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), copyMaplibreWorker()],

  // maplibre-gl ships its own web worker bundle; Vite's dep pre-bundler
  // mishandles that entry point, so it's excluded from optimization.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
