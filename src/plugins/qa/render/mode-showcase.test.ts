import { describe, it, expect } from "vitest";
import { planModeShowcase } from "./mode-showcase";
import type { ThemeSnapshot } from "../snapshot";
import type { CheckStatus } from "../types";

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

/**
 * Most cases are about suppression rules other than theme-awareness, so that
 * defaults to true and the one test that cares sets it false.
 */
function plan(input: {
  theme: ThemeSnapshot | undefined;
  themesStatus: CheckStatus | undefined;
  bindsOwnThemeVariables?: boolean;
}) {
  return planModeShowcase({
    bindsOwnThemeVariables: true,
    ...input,
  });
}

describe("planModeShowcase", () => {
  it("shows one frame per mode, in the collection's own order", () => {
    const showcase = plan({ theme: theme(), themesStatus: "warn" });

    expect(showcase.show).toBe(true);
    if (!showcase.show) return;
    // Order is the collection's, not sorted: designers read modes in the order
    // Figma lists them, and light-then-dark is a convention we must not impose.
    expect(showcase.modes).toEqual([
      { modeId: "1:0", name: "light" },
      { modeId: "1:1", name: "dark" },
    ]);
    // Carried on the plan so a caller that has narrowed to `show: true` has
    // everything it needs, instead of re-deriving a fact already decided here.
    expect(showcase.collectionId).toBe("VariableCollectionId:1:2");
  });

  // The themes check owns the question "does this set have a theme axis at all",
  // and its own docs say not_applicable means "the component renders identically
  // in every mode, so there is nothing to compare by eye". Drawing a comparison
  // beside a row chipped n/a would contradict the row. The case that motivated
  // this: a set whose colours come only from styles, where the probe still picks
  // a collection with two modes but nothing the set binds is theme-aware.
  it("shows nothing when the themes row itself reported not applicable", () => {
    const showcase = plan({ theme: theme(), themesStatus: "not_applicable" });

    expect(showcase.show).toBe(false);
    if (showcase.show) return;
    expect(showcase.reason).toMatch(/not applicable/i);
  });

  // #115 made row 17's remainder conditional for this reason: a set with no
  // theme axis renders identically in every mode, so showing it twice is two
  // identical pictures and an implication that something was compared.
  it("shows nothing when the set has only one mode", () => {
    const showcase = plan({
      theme: theme({ modes: [{ modeId: "1:0", name: "Mode 1" }] }),
      themesStatus: "pass",
    });

    expect(showcase.show).toBe(false);
    if (showcase.show) return;
    expect(showcase.reason).toMatch(/one mode/i);
  });

  it("shows nothing when no theme collection could be determined", () => {
    // Every variable the set binds failed to load, so there is no axis to show.
    // Modes are deliberately left populated: with an empty list the single-mode
    // guard would suppress this anyway, and the test would pass without the
    // collection guard existing at all. Found by mutation - the first version of
    // this test did exactly that.
    const showcase = plan({
      theme: theme({ collectionId: undefined, collectionName: undefined }),
      themesStatus: "pass",
    });

    expect(showcase.show).toBe(false);
    if (showcase.show) return;
    expect(showcase.reason).toMatch(/no theme collection/i);
  });

  // A filtered run - `checks: ["high-contrast"]`, which needs the same theme
  // facet - never runs `themes`, so there is no verdict to defer to. An agent
  // that explicitly asked to see the modes still gets them: the set has a real
  // theme axis, and the reason to suppress was never "we lack a verdict".
  it("still shows the modes when the themes check did not run", () => {
    const showcase = plan({ theme: theme(), themesStatus: undefined });

    expect(showcase.show).toBe(true);
  });

  // The case that made the verdict look load-bearing: a set whose colours come
  // only from shared styles. The probe still resolves a two-mode collection from
  // those styles, so mode count cannot catch it - but the component binds nothing
  // of its own, renders alike in every mode, and `themes` calls it n/a. Derived
  // from the same helper that check uses, so the two cannot disagree, and it holds
  // whether or not the check ran.
  it("shows nothing when the set binds no theme variables of its own", () => {
    const showcase = plan({
      theme: theme(),
      themesStatus: undefined,
      bindsOwnThemeVariables: false,
    });

    expect(showcase.show).toBe(false);
    if (showcase.show) return;
    expect(showcase.reason).toMatch(/shared styles|binds nothing/i);
  });

  it("shows nothing when the run never probed", () => {
    // A status is supplied so the guard above cannot be what suppresses this: the
    // branch under test is "the check ran, but no theme table came back".
    const showcase = plan({ theme: undefined, themesStatus: "warn" });

    expect(showcase.show).toBe(false);
    if (showcase.show) return;
    expect(showcase.reason).toMatch(/no theme was resolved/i);
  });
});
