import { describe, it, expect } from "vitest";
import { planModeShowcase } from "./mode-showcase";
import type { ThemeSnapshot } from "../snapshot";

function theme(partial: Partial<ThemeSnapshot> = {}): ThemeSnapshot {
  return {
    collectionId: "VariableCollectionId:1:2",
    collectionName: "semantic colors",
    modes: [
      { modeId: "1:0", name: "light" },
      { modeId: "1:1", name: "dark" },
    ],
    variables: {},
    ...partial,
  };
}

describe("planModeShowcase", () => {
  it("shows one frame per mode, in the collection's own order", () => {
    const plan = planModeShowcase(theme(), "warn");

    expect(plan.show).toBe(true);
    if (!plan.show) return;
    // Order is the collection's, not sorted: designers read modes in the order
    // Figma lists them, and light-then-dark is a convention we must not impose.
    expect(plan.modes).toEqual([
      { modeId: "1:0", name: "light" },
      { modeId: "1:1", name: "dark" },
    ]);
    // Carried on the plan so a caller that has narrowed to `show: true` has
    // everything it needs, instead of re-deriving a fact already decided here.
    expect(plan.collectionId).toBe("VariableCollectionId:1:2");
  });

  // The themes check owns the question "does this set have a theme axis at all",
  // and its own docs say not_applicable means "the component renders identically
  // in every mode, so there is nothing to compare by eye". Drawing a comparison
  // beside a row chipped n/a would contradict the row. The case that motivated
  // this: a set whose colours come only from styles, where the probe still picks
  // a collection with two modes but nothing the set binds is theme-aware.
  it("shows nothing when the themes row itself reported not applicable", () => {
    const plan = planModeShowcase(theme(), "not_applicable");

    expect(plan.show).toBe(false);
    if (plan.show) return;
    expect(plan.reason).toMatch(/not applicable/i);
  });

  // #115 made row 17's remainder conditional for this reason: a set with no
  // theme axis renders identically in every mode, so showing it twice is two
  // identical pictures and an implication that something was compared.
  it("shows nothing when the set has only one mode", () => {
    const plan = planModeShowcase(
      theme({ modes: [{ modeId: "1:0", name: "Mode 1" }] }),
      "pass",
    );

    expect(plan.show).toBe(false);
    if (plan.show) return;
    expect(plan.reason).toMatch(/one mode/i);
  });

  it("shows nothing when no theme collection could be determined", () => {
    // Every variable the set binds failed to load, so there is no axis to show.
    // Modes are deliberately left populated: with an empty list the single-mode
    // guard would suppress this anyway, and the test would pass without the
    // collection guard existing at all. Found by mutation - the first version of
    // this test did exactly that.
    const plan = planModeShowcase(
      theme({ collectionId: undefined, collectionName: undefined }),
      "pass",
    );

    expect(plan.show).toBe(false);
    if (plan.show) return;
    expect(plan.reason).toMatch(/no theme collection/i);
  });

  // A filtered run can collect a theme without evaluating row 17: high-contrast
  // needs the same facet, so `checks: ["high-contrast"]` resolves modes while
  // `themes` never runs. Drawing row 17's evidence when row 17 was not judged
  // would also skip the not-applicable rule entirely, since there is no verdict
  // to defer to - a style-only set would get a comparison it does not warrant.
  it("shows nothing when the themes check did not run", () => {
    const plan = planModeShowcase(theme(), undefined);

    expect(plan.show).toBe(false);
    if (plan.show) return;
    expect(plan.reason).toMatch(/did not run/i);
  });

  it("shows nothing when the run never probed", () => {
    // A status is supplied so the guard above cannot be what suppresses this: the
    // branch under test is "the check ran, but no theme table came back".
    const plan = planModeShowcase(undefined, "warn");

    expect(plan.show).toBe(false);
    if (plan.show) return;
    expect(plan.reason).toMatch(/no theme was resolved/i);
  });
});
