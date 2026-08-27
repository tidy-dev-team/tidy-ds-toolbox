import { describe, expect, it } from "vitest";

import { decodeIconDbJson } from "./decode";
import { getIconDatabase, getIconTextIndex } from "./load";

const EXPECTED_COUNT = 22414;

describe("icon database (gzip+base64 payload)", () => {
  it("decodes to valid JSON with the expected entry count", () => {
    const parsed = JSON.parse(decodeIconDbJson()) as {
      count: number;
      entries: unknown[];
    };
    expect(parsed.count).toBe(EXPECTED_COUNT);
    expect(parsed.entries).toHaveLength(EXPECTED_COUNT);
  });

  it("loads the full pipeline (atob -> gunzip -> parse -> bigint hash)", () => {
    const db = getIconDatabase();
    expect(db).toHaveLength(EXPECTED_COUNT);
    expect(typeof db[0].hash).toBe("bigint");
    expect(db[0].svg).toContain("<svg");
  });

  it("memoizes (same array instance on second call)", () => {
    expect(getIconDatabase()).toBe(getIconDatabase());
  });

  it("derives a text index over the whole database, memoized too", () => {
    const index = getIconTextIndex();

    expect(index).toHaveLength(EXPECTED_COUNT);
    expect(index[0].entry).toBe(getIconDatabase()[0]);
    // A rebuilt index per keystroke is the cost this memo exists to stop.
    expect(getIconTextIndex()).toBe(index);
  });
});
