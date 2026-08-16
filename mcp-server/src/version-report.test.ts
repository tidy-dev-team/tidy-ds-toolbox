import { describe, it, expect } from "vitest";
import {
  RAW_SOURCE_VERSION,
  describeVersionMatch,
} from "./version-report.ts";

describe("describeVersionMatch", () => {
  it("says both halves agree, and names the version once", () => {
    const line = describeVersionMatch("1.17.2", "1.17.2");

    expect(line).toContain("1.17.2");
    expect(line).not.toMatch(/mismatch/i);
    expect(line).not.toMatch(/stale/i);
  });

  it("names both versions when they differ, and says which half is harder to reload", () => {
    const line = describeVersionMatch("1.16.0", "1.17.2");

    expect(line).toMatch(/mismatch/i);
    // Both numbers, so the reader can tell which end is behind.
    expect(line).toContain("1.16.0");
    expect(line).toContain("1.17.2");
    // The actionable half: a rebuilt server keeps serving until the session
    // restarts, which is the trap this whole check exists for.
    expect(line).toMatch(/session/i);
  });

  it("attributes each version to its own half, so the reader knows which is behind", () => {
    const line = describeVersionMatch("1.16.0", "1.17.2");

    // Pinned against the two being printed in a bare pair: "1.16.0 / 1.17.2"
    // tells nobody which end is stale, which is the entire question.
    expect(line).toMatch(/server[^.]*1\.16\.0/i);
    expect(line).toMatch(/plugin[^.]*1\.17\.2/i);
  });

  it("says a plugin that reports nothing predates the check, rather than guessing", () => {
    const line = describeVersionMatch("1.17.2", undefined);

    expect(line).toMatch(/no version|did not report/i);
    // It is older than any build that does report one, and that is knowable.
    expect(line).toMatch(/older|predates/i);
    expect(line).not.toMatch(/mismatch/i);
  });

  it("declines to compare when the server runs from raw source, instead of crying mismatch", () => {
    const line = describeVersionMatch(RAW_SOURCE_VERSION, "1.17.2");

    // A raw-source server has no version to compare. Reporting that as a
    // mismatch would make the dev inner loop warn on every single connect,
    // and a warning that is always on is one nobody reads.
    expect(line).not.toMatch(/mismatch/i);
    expect(line).toMatch(/source/i);
    expect(line).toContain("1.17.2");
  });

  it("still declines to compare a raw-source server against a silent plugin", () => {
    const line = describeVersionMatch(RAW_SOURCE_VERSION, undefined);

    expect(line).not.toMatch(/mismatch/i);
    expect(line).toMatch(/source/i);
  });
});
