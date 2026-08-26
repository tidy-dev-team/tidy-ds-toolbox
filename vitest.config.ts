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
  // No `resolve.alias`, deliberately, and worth knowing before you reach for
  // `@shared/*` in a module you want tested: this file does not inherit
  // `vite.config.ts`, where the aliases live, so an aliased import is
  // unresolvable here. Modules under test use relative specifiers.
  test: {
    globals: true,
    environment: "node",
    // mcp-server is a separate package but its pure modules are testable from
    // here; without this line nothing under it could have a unit test at all.
    // `scripts/` is build tooling rather than shipped code, but its decisions
    // are as breakable as anything else - #190 was a dogfood install that
    // silently no-opped across a version bump. Its pure helpers live in
    // `scripts/lib/` and are plain ESM, hence the second extension.
    include: [
      "src/**/*.test.ts",
      "mcp-server/src/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
  },
});
