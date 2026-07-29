import { describe, it, expect } from "vitest";
import {
  AUTOMATED_ITEMS,
  CHECKLIST_CATALOGUE,
  CHECK_IDS,
  itemForCheck,
  requiredFacets,
} from "./checklist-catalogue";

/**
 * The one deliberate list snapshot (#135).
 *
 * Its whole job is to make a scope change show up in a diff: adding, dropping or
 * reordering a checklist item fails here and nowhere else, and the fix is to
 * update this list on purpose. Everything below it is an invariant instead, so a
 * legitimate scope change no longer lands as a handful of red counts that each
 * had to be edited to match the code that had just been written.
 *
 * Row numbers, not PRD section numbers: `n` is the row's identity, and the
 * printed order designers tick by hand.
 */
const SHIPPED_ROWS: ReadonlyArray<readonly [number, string, string?]> = [
  [1, "Storybook Alignment + Note"],
  [2, "Components Naming Dev Alignment", "set-name-casing"],
  [3, "Check All the Props", "variant-property-bindings"],
  [4, "Prop Names Aligned to Catalogue", "prop-order"],
  [5, "Tokens (Styles & Variables)", "tokens"],
  [6, "Typography Desktop|Mobile"],
  [7, "Responsiveness (+ Min-Max)", "responsive-bounds"],
  [8, "Icons/Illustrations/Logos → Foundations", "asset-provenance"],
  [9, "Layer Naming + Structure", "layer-naming-structure"],
  [10, "4px Grid Alignment", "grid-4px"],
  [11, "Interaction (Hover Only)", "interaction-hover-only"],
  [12, "Description (AKA + Misprint)", "description"],
  [13, "No Conflicts", "no-conflicts"],
  [14, "Nested Instance Depth", "nesting-depth"],
  [15, "Preferred (Instance Swapping)", "preferred-values"],
  [16, "High Contrast (A11y)", "high-contrast"],
  [17, "Themes (per-mode resolution)", "themes"],
  [18, "Page Template"],
  [19, "Documentation", "documentation"],
];

describe("CHECKLIST_CATALOGUE", () => {
  it("ships exactly these rows, in this order", () => {
    expect(
      CHECKLIST_CATALOGUE.map((item) => [item.n, item.title, item.checkId]),
    ).toEqual(SHIPPED_ROWS.map(([n, title, check]) => [n, title, check]));
  });

  it("numbers rows 1..length with no gaps or duplicates", () => {
    expect(CHECKLIST_CATALOGUE.map((item) => item.n)).toEqual(
      CHECKLIST_CATALOGUE.map((_, i) => i + 1),
    );
  });

  it("gives every row a distinct title and a distinct, non-empty blurb", () => {
    const titles = CHECKLIST_CATALOGUE.map((item) => item.title);
    const blurbs = CHECKLIST_CATALOGUE.map((item) => item.blurb);
    for (const text of [...titles, ...blurbs]) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
    // Duplicates would mean a row explains itself with someone else's line.
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(blurbs).size).toBe(blurbs.length);
  });

  // `checkId` and `run` are the same fact about a row - the id names the check,
  // the function is the check - so a row carrying one without the other either
  // runs nothing under a published id, or runs something no caller can ask for
  // by name.
  it("pairs checkId with run, or has neither", () => {
    for (const item of CHECKLIST_CATALOGUE) {
      expect(item.checkId === undefined).toBe(item.run === undefined);
    }
  });

  it("claims each check id on exactly one row, with a runnable function", () => {
    expect(new Set(CHECK_IDS).size).toBe(CHECK_IDS.length);
    for (const id of CHECK_IDS) {
      const claimants = CHECKLIST_CATALOGUE.filter(
        (item) => item.checkId === id,
      );
      expect(claimants).toHaveLength(1);
      expect(typeof itemForCheck(id)?.run).toBe("function");
    }
  });

  it("tiers every automated row 1 or 2, and every manual row null", () => {
    for (const item of CHECKLIST_CATALOGUE) {
      if (item.run) {
        expect(item.tier === 1 || item.tier === 2).toBe(true);
      } else {
        expect(item.tier).toBeNull();
      }
    }
  });

  it("declares needs only on automated rows, with no empty or repeated facet", () => {
    for (const item of CHECKLIST_CATALOGUE) {
      if (!item.needs) continue;
      expect(item.run).toBeDefined();
      expect(item.needs.length).toBeGreaterThan(0);
      expect(new Set(item.needs).size).toBe(item.needs.length);
    }
  });
});

describe("requiredFacets", () => {
  // The wiring #134 is about: the expensive passes a run performs are derived
  // from the requested checks' own declarations, so a new check that reads a
  // facet cannot be left seeing undefined because a second list went unedited.
  it("collects the union of the requested rows' needs", () => {
    expect([...requiredFacets(["high-contrast"])].sort()).toEqual([
      "colorStyles",
      "theme",
    ]);
    expect([...requiredFacets(["themes"])]).toEqual(["theme"]);
    expect([...requiredFacets(["themes", "high-contrast"])].sort()).toEqual([
      "colorStyles",
      "theme",
    ]);
  });

  it("collects nothing for a run of checks that declare no needs", () => {
    // The property that keeps a filtered run inert: no style round trips, and
    // above all no probe frame, hence no document write at all.
    expect([...requiredFacets(["tokens", "grid-4px"])]).toEqual([]);
    expect([...requiredFacets([])]).toEqual([]);
  });

  it("collects every declared facet when no filter is given", () => {
    const declared = new Set(
      AUTOMATED_ITEMS.flatMap((item) => item.needs ?? []),
    );
    expect([...requiredFacets()].sort()).toEqual([...declared].sort());
    expect(declared.size).toBeGreaterThan(0);
  });
});
