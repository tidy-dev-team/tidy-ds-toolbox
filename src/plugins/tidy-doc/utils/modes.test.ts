import { describe, expect, it } from "vitest";
import {
  buildModeShowcases,
  modeShowcaseLabel,
  selectPrimaryCollection,
  type ModeCollectionFact,
} from "./modes";

const theme: ModeCollectionFact = {
  id: "collection-theme",
  name: "Theme",
  defaultModeId: "light",
  modes: [
    { modeId: "light", name: "Light" },
    { modeId: "dark", name: "Dark" },
  ],
};

const density: ModeCollectionFact = {
  id: "collection-density",
  name: "Density",
  defaultModeId: "regular",
  modes: [
    { modeId: "regular", name: "Regular" },
    { modeId: "compact", name: "Compact" },
  ],
};

// A wide multi-brand theme collection (brand × scheme) — the shape the Mode
// Section should latch onto over incidental collections.
const brandTheme: ModeCollectionFact = {
  id: "collection-brand-theme",
  name: "xSA - Vertical",
  defaultModeId: "industrial-light",
  modes: [
    { modeId: "industrial-light", name: "Industrial Light" },
    { modeId: "industrial-dark", name: "Industrial Dark" },
    { modeId: "healthcare-light", name: "Healthcare Light" },
    { modeId: "healthcare-dark", name: "Healthcare Dark" },
  ],
};

describe("selectPrimaryCollection", () => {
  it("returns null for no collections", () => {
    expect(selectPrimaryCollection([])).toBeNull();
  });

  it("picks the collection with the most modes", () => {
    expect(selectPrimaryCollection([theme, brandTheme, density])).toBe(
      brandTheme,
    );
  });

  it("tie-breaks by derivation order (first wins)", () => {
    expect(selectPrimaryCollection([theme, density])).toBe(theme);
  });
});

describe("buildModeShowcases", () => {
  it("returns no showcases for no multi-mode collections", () => {
    expect(buildModeShowcases([])).toEqual({ showcases: [], dropped: 0 });
  });

  it("renders one showcase per mode of the single collection", () => {
    const result = buildModeShowcases([theme]);
    expect(result.dropped).toBe(0);
    expect(result.showcases.map(modeShowcaseLabel)).toEqual([
      "Theme: Light",
      "Theme: Dark",
    ]);
  });

  it("showcases only the widest collection, leaving the rest at default", () => {
    const result = buildModeShowcases([theme, brandTheme, density]);
    expect(result.dropped).toBe(0);
    // Every showcase pins exactly one collection — the primary — and nothing else.
    expect(result.showcases.every((s) => s.selections.length === 1)).toBe(true);
    expect(result.showcases.map(modeShowcaseLabel)).toEqual([
      "xSA - Vertical: Industrial Light",
      "xSA - Vertical: Industrial Dark",
      "xSA - Vertical: Healthcare Light",
      "xSA - Vertical: Healthcare Dark",
    ]);
  });

  it("caps showcases and reports the dropped remainder", () => {
    const wide: ModeCollectionFact = {
      id: "collection-wide",
      name: "Wide",
      defaultModeId: "m0",
      modes: Array.from({ length: 10 }, (_, i) => ({
        modeId: `m${i}`,
        name: `Mode ${i}`,
      })),
    };
    const result = buildModeShowcases([wide], 8);
    expect(result.showcases).toHaveLength(8);
    expect(result.dropped).toBe(2);
  });
});
