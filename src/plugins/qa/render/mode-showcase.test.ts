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
    const plan = planModeShowcase(theme());

    expect(plan.show).toBe(true);
    if (!plan.show) return;
    // Order is the collection's, not sorted: designers read modes in the order
    // Figma lists them, and light-then-dark is a convention we must not impose.
    expect(plan.modes).toEqual([
      { modeId: "1:0", name: "light" },
      { modeId: "1:1", name: "dark" },
    ]);
  });

  // #115 made row 17's remainder conditional for this reason: a set with no
  // theme axis renders identically in every mode, so showing it twice is two
  // identical pictures and an implication that something was compared.
  it("shows nothing when the set has only one mode", () => {
    const plan = planModeShowcase(
      theme({ modes: [{ modeId: "1:0", name: "Mode 1" }] }),
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
    );

    expect(plan.show).toBe(false);
    if (plan.show) return;
    expect(plan.reason).toMatch(/no theme collection/i);
  });

  it("shows nothing when the run never probed", () => {
    const plan = planModeShowcase(undefined);

    expect(plan.show).toBe(false);
    if (plan.show) return;
    expect(plan.reason).toMatch(/not resolved|no theme/i);
  });
});
