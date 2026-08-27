import { describe, it, expect } from "vitest";
import { buildTextSearchIndex, searchByText } from "./search";
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

const INDEX = buildTextSearchIndex(DB);

describe("buildTextSearchIndex", () => {
  it("lowercases the name and splits the terms once, up front", () => {
    // The reason this exists. Splitting `terms` per entry per query allocated
    // 22k arrays on every keystroke, which was the dominant cost of a search;
    // the tokens do not change between queries, so they are computed on load.
    const index = buildTextSearchIndex([entry("Bell-Off", "X", "bell off")]);

    expect(index).toEqual([
      { entry: index[0].entry, name: "bell-off", termTokens: ["bell", "off"] },
    ]);
  });

  it("gives an entry with no terms an empty token list", () => {
    const index = buildTextSearchIndex([entry("home", "X")]);

    expect(index[0].termTokens).toEqual([]);
  });

  it("keeps the entry itself by reference, so nothing is copied per icon", () => {
    // The index is held for the session beside a 22k-entry database; copying
    // each entry would double the resident cost of the thing being optimised.
    const source = entry("home", "X", "home house");

    expect(buildTextSearchIndex([source])[0].entry).toBe(source);
  });
});

describe("searchByText", () => {
  it("returns nothing for an empty query", () => {
    expect(searchByText("", INDEX, 10)).toEqual([]);
    expect(searchByText("   ", INDEX, 10)).toEqual([]);
  });

  it("ranks an exact name match first", () => {
    const results = searchByText("bell", INDEX, 10);
    expect(results[0].entry.name).toBe("bell");
  });

  it("finds an icon by a harvested tag the name lacks (notification → bell)", () => {
    const results = searchByText("notification", INDEX, 10);
    const names = results.map((r) => r.entry.name);
    expect(names).toContain("bell");
    // "home" has no such term and must be excluded.
    expect(names).not.toContain("home");
  });

  it("prefers a name hit over a tag-only hit", () => {
    // "bell" matches bell/bell-filled/bell-off by name and dumbbell by substring.
    const results = searchByText("bell", INDEX, 10);
    const bellIdx = results.findIndex((r) => r.entry.name === "bell");
    const dumbbellIdx = results.findIndex((r) => r.entry.name === "dumbbell");
    expect(bellIdx).toBeLessThan(dumbbellIdx);
  });

  it("applies AND semantics across query tokens", () => {
    const results = searchByText("bell off", INDEX, 10);
    expect(results.map((r) => r.entry.name)).toEqual(["bell-off"]);
  });

  it("limits results to n", () => {
    expect(searchByText("bell", INDEX, 2).length).toBe(2);
  });

  it("tiebreaks equal scores by shorter, then alphabetical, name", () => {
    const db: IconEntry[] = [
      entry("crab", "X", "shared"), // 4 chars
      entry("crow", "X", "shared"), // 4 chars
      entry("anchor", "X", "shared"), // 6 chars
    ];
    // All match "shared" only (term exact) → equal score. Shorter names first;
    // among equal-length names, alphabetical (crab before crow).
    const results = searchByText("shared", buildTextSearchIndex(db), 10);
    expect(results.map((r) => r.entry.name)).toEqual([
      "crab",
      "crow",
      "anchor",
    ]);
  });
});
