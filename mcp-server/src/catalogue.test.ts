// Exposure gate for the test-only sleeper Operations (#192): they must not
// appear in the agent-facing tool list unless a human has deliberately set
// TIDY_ENABLE_TEST_OPERATIONS=1 in this server's own environment. See
// catalogue.ts's comment above TEST_ONLY_CATALOGUE for the full reasoning,
// and src/shared/operations/test-sleep-operations.ts for why the gate lives
// here rather than in the plugin-thread registry.

import { describe, it, expect, afterEach, vi } from "vitest";

const SLEEP_IDS = [
  "tidy_test_sleep_cancellable",
  "tidy_test_sleep_ignore_token",
  "tidy_test_sleep_uncancellable",
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("test-only Operations exposure gate", () => {
  it("omits all three sleeper ids from CATALOGUE when the env var is unset", async () => {
    vi.stubEnv("TIDY_ENABLE_TEST_OPERATIONS", "");
    vi.resetModules();
    const { CATALOGUE } = await import("./catalogue");
    const ids = CATALOGUE.map((e) => e.id);
    for (const id of SLEEP_IDS) expect(ids).not.toContain(id);
  });

  it("omits them for any value other than the exact string '1'", async () => {
    vi.stubEnv("TIDY_ENABLE_TEST_OPERATIONS", "true");
    vi.resetModules();
    const { CATALOGUE } = await import("./catalogue");
    const ids = CATALOGUE.map((e) => e.id);
    for (const id of SLEEP_IDS) expect(ids).not.toContain(id);
  });

  it("includes all three sleeper ids when TIDY_ENABLE_TEST_OPERATIONS=1", async () => {
    vi.stubEnv("TIDY_ENABLE_TEST_OPERATIONS", "1");
    vi.resetModules();
    const { CATALOGUE } = await import("./catalogue");
    const ids = CATALOGUE.map((e) => e.id);
    for (const id of SLEEP_IDS) expect(ids).toContain(id);
  });

  it("gives every exposed sleeper entry a Bridge timeoutMs well below a plausible durationMs", async () => {
    vi.stubEnv("TIDY_ENABLE_TEST_OPERATIONS", "1");
    vi.resetModules();
    const { CATALOGUE } = await import("./catalogue");
    for (const id of SLEEP_IDS) {
      const entry = CATALOGUE.find((e) => e.id === id);
      expect(entry, `missing catalogue entry for ${id}`).toBeDefined();
      const timeoutMs = entry?.timeoutMs;
      expect(timeoutMs).toBeDefined();
      expect(timeoutMs ?? Infinity).toBeLessThan(10_000);
    }
  });
});
