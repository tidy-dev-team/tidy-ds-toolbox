import { describe, expect, it } from "vitest";

import { decodeIconDbJson } from "./decode";
import { getIconDatabase } from "./load";

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
});
