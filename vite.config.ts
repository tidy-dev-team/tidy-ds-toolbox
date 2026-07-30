import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Usage-analytics ingest (#43). The token is the shared secret the build
    // carries; it is read from the environment at build time and NEVER
    // committed. Builds without TIDY_INGEST_TOKEN ship an empty token, which
    // disables sending (see src/shared/analytics/transport.ts).
    __INGEST_ENDPOINT__: JSON.stringify(
      "https://toolbox-logs.wearekido.dev/events",
    ),
    __INGEST_TOKEN__: JSON.stringify(process.env.TIDY_INGEST_TOKEN ?? ""),
  },
  plugins: [react(), viteSingleFile()],
  build: {
    target: "esnext",
    assetsInlineLimit: 100000000,
    // Vite would otherwise wipe dist/ before writing, taking `dist/code.js` with
    // it - the plugin thread's bundle, which esbuild writes in a *separate* step
    // afterwards. Between the two, manifest.json points at a file that does not
    // exist, and reloading the plugin in Figma fails with
    // "Unable to load code: ENOENT ... dist/code.js". That window is seconds long
    // and lands exactly during the dogfood loop, where rebuilding and reloading
    // is the whole activity. Nothing stale accumulates: vite-plugin-singlefile
    // inlines everything into the one index.html it emits.
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      "@shell": "/src",
      "@plugins": "/src/plugins",
      "@shared": "/src/shared",
    },
  },
});
