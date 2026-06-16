import { describe, it, expect } from "vitest";
import { searchByText } from "./search";
import type { IconEntry } from "./query";

function entry(name: string, source: string, terms?: string): IconEntry {
  return { name, source, hash: 0n, terms };
}

const DB: IconEntry[] = [
  entry("bell", "Tabler", "bell alarm sound notification notifications ringer"),
  entry("bell-filled", "Tabler", "bell filled alarm notification"),
  entry("bell-off", "Lucide", "bell off"),
  entry("dumbbell", "Phosphor", "dumbbell gym weight exercise"),
  entry("home", "Feather", "home house"),
];

describe("searchByText", () => {
  it("returns nothing for an empty query", () => {
    expect(searchByText("", DB, 10)).toEqual([]);
    expect(searchByText("   ", DB, 10)).toEqual([]);
  });

  it("ranks an exact name match first", () => {
    const results = searchByText("bell", DB, 10);
    expect(results[0].entry.name).toBe("bell");
  });

  it("finds an icon by a harvested tag the name lacks (notification → bell)", () => {
    const results = searchByText("notification", DB, 10);
    const names = results.map((r) => r.entry.name);
    expect(names).toContain("bell");
    // "home" has no such term and must be excluded.
    expect(names).not.toContain("home");
  });

  it("prefers a name hit over a tag-only hit", () => {
    // "bell" matches bell/bell-filled/bell-off by name and dumbbell by substring.
    const results = searchByText("bell", DB, 10);
    const bellIdx = results.findIndex((r) => r.entry.name === "bell");
    const dumbbellIdx = results.findIndex((r) => r.entry.name === "dumbbell");
    expect(bellIdx).toBeLessThan(dumbbellIdx);
  });

  it("applies AND semantics across query tokens", () => {
    const results = searchByText("bell off", DB, 10);
    expect(results.map((r) => r.entry.name)).toEqual(["bell-off"]);
  });

  it("limits results to n", () => {
    expect(searchByText("bell", DB, 2).length).toBe(2);
  });

  it("tiebreaks equal scores by shorter, then alphabetical, name", () => {
    const db: IconEntry[] = [
      entry("crab", "X", "shared"), // 4 chars
      entry("crow", "X", "shared"), // 4 chars
      entry("anchor", "X", "shared"), // 6 chars
    ];
    // All match "shared" only (term exact) → equal score. Shorter names first;
    // among equal-length names, alphabetical (crab before crow).
    const results = searchByText("shared", db, 10);
    expect(results.map((r) => r.entry.name)).toEqual([
      "crab",
      "crow",
      "anchor",
    ]);
  });
});
