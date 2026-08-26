// THROWAWAY - vite config for the bridge-status UI prototype only.
// Run: npm run prototype:bridge   (see src/prototype/bridge-status/README.md)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
  root: "src/prototype/bridge-status",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __INGEST_ENDPOINT__: JSON.stringify(""),
    __INGEST_TOKEN__: JSON.stringify(""),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@shell": new URL("./src", import.meta.url).pathname,
      "@plugins": new URL("./src/plugins", import.meta.url).pathname,
      "@shared": new URL("./src/shared", import.meta.url).pathname,
    },
  },
  server: { open: true, port: 5199 },
});
