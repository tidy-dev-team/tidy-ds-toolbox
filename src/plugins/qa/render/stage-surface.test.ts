import { describe, it, expect } from "vitest";
import {
  DARK_STAGE,
  LIGHT_STAGE,
  needsOutline,
  planStageSurfaces,
} from "./stage-surface";

function modes(...names: string[]) {
  return names.map((name, i) => ({ modeId: `1:${i}`, name }));
}

describe("planStageSurfaces", () => {
  it("gives a light mode a light backdrop and a dark mode a dark one", () => {
    const plan = planStageSurfaces(modes("light", "dark"));

    expect(plan.byMode).toEqual({ "1:0": LIGHT_STAGE, "1:1": DARK_STAGE });
    expect(plan.allInferred).toBe(true);
  });

  it("reads mode names whatever their casing or wording", () => {
    const plan = planStageSurfaces(modes("Light Mode", "Night"));

    expect(plan.byMode).toEqual({ "1:0": LIGHT_STAGE, "1:1": DARK_STAGE });
  });

  // The backdrop is inferred from the mode's *name*, which is the only signal
  // available - the theme table holds the component's own tokens, never the page
  // surface (#141). So a name that says nothing gets the neutral dark, and the
  // block says the inference was incomplete rather than implying it knew.
  it("falls back to the neutral dark when a name says nothing", () => {
    const plan = planStageSurfaces(modes("brand", "neutral"));

    expect(plan.byMode).toEqual({ "1:0": DARK_STAGE, "1:1": DARK_STAGE });
    expect(plan.allInferred).toBe(false);
  });

  it("does not read 'light' out of the middle of a word", () => {
    const plan = planStageSurfaces(modes("Highlight"));

    expect(plan.byMode).toEqual({ "1:0": DARK_STAGE });
  });

  it("covers every mode it is given", () => {
    const plan = planStageSurfaces(modes("light", "dark", "high contrast"));

    expect(Object.keys(plan.byMode)).toEqual(["1:0", "1:1", "1:2"]);
  });
});

describe("needsOutline", () => {
  // A white stage on the white card has no visible edge, so the light column
  // would read as having no stage at all while the dark one clearly does.
  it("outlines a backdrop that would vanish into the card", () => {
    expect(needsOutline(LIGHT_STAGE)).toBe(true);
  });

  it("leaves a backdrop that already stands out alone", () => {
    expect(needsOutline(DARK_STAGE)).toBe(false);
  });
});
