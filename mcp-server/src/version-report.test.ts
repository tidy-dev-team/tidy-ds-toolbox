import { describe, it, expect } from "vitest";
import {
  RAW_SOURCE_VERSION,
  describeVersionMatch,
  versionSkewNote,
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

describe("versionSkewNote", () => {
  it("explains the skew, and where to fix it, when the two halves differ", () => {
    const note = versionSkewNote("1.16.0", "1.17.2");

    expect(note).not.toBeNull();
    expect(note).toContain("1.16.0");
    expect(note).toContain("1.17.2");
    // The actionable half. A rebuilt server keeps serving until the session
    // restarts, and that is not obvious - it is what cost a whole session.
    expect(note).toMatch(/session/i);
  });

  it("says nothing when the halves agree, so an ordinary timeout stays clean", () => {
    // A note on every timeout would be noise, and noise is how the stderr
    // version line ended up unread in the first place.
    expect(versionSkewNote("1.17.2", "1.17.2")).toBeNull();
  });

  it("says nothing when the server cannot state a version", () => {
    // A raw-source server has nothing to compare, so claiming skew would warn
    // on every timeout of the dev inner loop.
    expect(versionSkewNote(RAW_SOURCE_VERSION, "1.17.2")).toBeNull();
  });

  it("says nothing when the plugin never reported one", () => {
    // Silence is not proof of skew. #189's connect log already covers the
    // plugin that predates the handshake; guessing here would attach a claim
    // to every timeout from an older build.
    expect(versionSkewNote("1.17.2", undefined)).toBeNull();
  });
});
