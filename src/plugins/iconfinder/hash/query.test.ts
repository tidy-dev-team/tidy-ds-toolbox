import { describe, it, expect } from "vitest";
import {
  findTopN,
  findNearest,
  confidence,
  MAX_DIST,
  type IconEntry,
} from "./query";

describe("query and ranking", () => {
  const database: IconEntry[] = [
    { name: "exact", source: "test", hash: 0b1111_1111n },
    { name: "one-bit", source: "test", hash: 0b1111_1110n },
    { name: "two-bit", source: "test", hash: 0b1111_1100n },
    { name: "far", source: "test", hash: 0b0000_0000n },
  ];

  it("returns matches sorted by ascending distance", () => {
    const results = findTopN(0b1111_1111n, database, 3);

    expect(results.map((r) => r.entry.name)).toEqual([
      "exact",
      "one-bit",
      "two-bit",
    ]);
    expect(results[0].distance).toBe(0);
    expect(results[1].distance).toBe(1);
    expect(results[2].distance).toBe(2);
  });

  it("respects the top-N limit", () => {
    const results = findTopN(0b1111_1111n, database, 2);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.entry.name)).toEqual(["exact", "one-bit"]);
  });

  it("applies the MAX_DIST cutoff", () => {
    const results = findTopN(0b1111_1111n, database, 10, 2);
    expect(results.map((r) => r.entry.name)).toEqual(["exact", "one-bit"]);
    expect(results.every((r) => r.distance < 2)).toBe(true);
  });

  it("returns an empty array when no entries are within maxDist", () => {
    const results = findTopN(0b1111_1111n, database, 10, 1);
    expect(results).toHaveLength(1);
    expect(results[0].entry.name).toBe("exact");
  });

  it("computes confidence linearly from 1.0 down to 0.0", () => {
    expect(confidence(0)).toBe(1);
    expect(confidence(MAX_DIST / 2)).toBeCloseTo(0.5, 6);
    expect(confidence(MAX_DIST)).toBe(0);
    expect(confidence(MAX_DIST + 5)).toBe(0);
  });

  it("attaches confidence to each match result", () => {
    const results = findTopN(0b1111_1111n, database, 3);
    expect(results[0].confidence).toBe(1);
    expect(results[1].confidence).toBeCloseTo(1 - 1 / MAX_DIST, 6);
    expect(results[2].confidence).toBeCloseTo(1 - 2 / MAX_DIST, 6);
  });
});

describe("findNearest", () => {
  const database: IconEntry[] = [
    { name: "exact", source: "test", hash: 0b1111_1111n },
    { name: "far", source: "test", hash: 0b0000_0000n },
    { name: "two-bit", source: "test", hash: 0b1111_1100n },
  ];

  it("returns the N nearest with no distance threshold", () => {
    // 0b0000_0000 is 8 bits away — far past MAX_DIST — but still returned.
    const results = findNearest(0n, database, 3);
    expect(results.map((r) => r.entry.name)).toEqual([
      "far",
      "two-bit",
      "exact",
    ]);
    expect(results[0].distance).toBe(0);
    expect(results[2].distance).toBe(8);
  });

  it("respects the limit", () => {
    expect(findNearest(0n, database, 1)).toHaveLength(1);
  });
});
