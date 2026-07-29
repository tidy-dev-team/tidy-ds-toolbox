import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors the Vite build's `define` block for the handful of globals
  // referenced at module scope (transport.ts's ingest endpoint/token) so
  // importing those modules under Vitest doesn't throw ReferenceError.
  define: {
    __APP_VERSION__: JSON.stringify("test"),
    __INGEST_ENDPOINT__: JSON.stringify("https://example.invalid/events"),
    __INGEST_TOKEN__: JSON.stringify(""),
  },
  test: {
    globals: true,
    environment: "node",
    // mcp-server is a separate package but its pure modules are testable from
    // here; without this line nothing under it could have a unit test at all.
    include: ["src/**/*.test.ts", "mcp-server/src/**/*.test.ts"],
  },
});
