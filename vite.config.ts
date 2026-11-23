import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * The public build is set up with `--mode pages`, which points Vite at an env
 * directory that does not exist. No VITE_FIREBASE_* value can then reach the
 * bundle, so the GitHub Pages copy carries no key: it takes the web app config
 * from the URL fragment at runtime instead.
 */
export default defineConfig(({ mode }) => ({
  base: "./",
  envDir: mode === "pages" ? "./no-env-for-public-builds" : ".",
  build: {
    target: "es2022",
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        bench: resolve(process.cwd(), "bench/index.html"),
      },
    },
  },
}));
