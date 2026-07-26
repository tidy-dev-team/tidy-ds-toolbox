import { describe, expect, it } from "vitest";
import {
  selectPrimaryCollection,
  type ModeCollectionFact,
} from "./theme-collection";

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

// A wide multi-brand theme collection (brand × scheme) — the shape selection
// should latch onto over incidental collections.
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
