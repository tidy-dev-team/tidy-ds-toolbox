import { describe, expect, it } from "vitest";
import {
  buildModeCrossProduct,
  modeShowcaseLabel,
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

describe("buildModeCrossProduct", () => {
  it("returns no showcases for no multi-mode collections", () => {
    expect(buildModeCrossProduct([])).toEqual({ showcases: [], dropped: 0 });
  });

  it("renders one showcase per mode for a single collection", () => {
    const result = buildModeCrossProduct([theme]);
    expect(result.dropped).toBe(0);
    expect(result.showcases.map(modeShowcaseLabel)).toEqual([
      "Theme: Light",
      "Theme: Dark",
    ]);
  });

  it("crosses multiple collections in collection/mode order", () => {
    const result = buildModeCrossProduct([theme, density]);
    expect(result.dropped).toBe(0);
    expect(result.showcases.map(modeShowcaseLabel)).toEqual([
      "Theme: Light · Density: Regular",
      "Theme: Light · Density: Compact",
      "Theme: Dark · Density: Regular",
      "Theme: Dark · Density: Compact",
    ]);
  });

  it("caps showcases and reports the dropped remainder", () => {
    const state: ModeCollectionFact = {
      id: "collection-state",
      name: "State",
      defaultModeId: "rest",
      modes: [
        { modeId: "rest", name: "Rest" },
        { modeId: "hover", name: "Hover" },
        { modeId: "pressed", name: "Pressed" },
      ],
    };
    const result = buildModeCrossProduct([theme, density, state], 8);
    expect(result.showcases).toHaveLength(8);
    expect(result.dropped).toBe(4);
  });
});
