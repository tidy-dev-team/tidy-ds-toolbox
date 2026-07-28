import { describe, it, expect } from "vitest";
import { CHECKLIST_CATALOGUE } from "./checklist-catalogue";
import type { CheckId } from "./types";

/** PRD item → check mapping (docs/prd-qa-canvas-checklist.md §4). */
const PRD_ITEMS: ReadonlyArray<{
  n: number;
  title: string;
  tier: 1 | 2 | null;
  checkId?: CheckId;
}> = [
  { n: 1, title: "Storybook Alignment + Note", tier: null },
  {
    n: 2,
    title: "Components Naming Dev Alignment",
    tier: 1,
    checkId: "set-name-casing",
  },
  {
    n: 3,
    title: "Check All the Props",
    tier: 1,
    checkId: "variant-property-bindings",
  },
  {
    n: 4,
    title: "Prop Names Aligned to Catalogue",
    tier: 1,
    checkId: "prop-order",
  },
  {
    n: 5,
    title: "Tokens (Styles & Variables)",
    tier: 1,
    checkId: "tokens",
  },
  { n: 6, title: "Typography Desktop|Mobile", tier: null },
  {
    n: 7,
    title: "Responsiveness (+ Min-Max)",
    tier: 2,
    checkId: "responsive-bounds",
  },
  {
    n: 8,
    title: "Icons/Illustrations/Logos → Foundations",
    tier: 2,
    checkId: "asset-provenance",
  },
  {
    n: 9,
    title: "Layer Naming + Structure",
    tier: 1,
    checkId: "layer-naming-structure",
  },
  { n: 10, title: "4px Grid Alignment", tier: 1, checkId: "grid-4px" },
  {
    n: 11,
    title: "Interaction (Hover Only)",
    tier: 1,
    checkId: "interaction-hover-only",
  },
  {
    n: 12,
    title: "Description (AKA + Misprint)",
    tier: 1,
    checkId: "description",
  },
  { n: 13, title: "No Conflicts", tier: 1, checkId: "no-conflicts" },
  {
    n: 14,
    title: "Nested Instance Depth",
    tier: 2,
    checkId: "nesting-depth",
  },
  {
    n: 15,
    title: "Preferred (Instance Swapping)",
    tier: 1,
    checkId: "preferred-values",
  },
  {
    n: 16,
    title: "High Contrast (A11y)",
    tier: 2,
    checkId: "high-contrast",
  },
  {
    n: 17,
    title: "Themes (per-mode resolution)",
    tier: 2,
    checkId: "themes",
  },
  { n: 18, title: "Page Template", tier: null },
  {
    n: 19,
    title: "Documentation",
    tier: 2,
    checkId: "documentation",
  },
];

describe("CHECKLIST_CATALOGUE", () => {
  it("lists all 19 PRD items in order", () => {
    expect(CHECKLIST_CATALOGUE).toHaveLength(19);
    expect(CHECKLIST_CATALOGUE.map((item) => item.n)).toEqual(
      PRD_ITEMS.map((item) => item.n),
    );
  });

  it("maps each item to its engine check id where one exists", () => {
    expect(
      CHECKLIST_CATALOGUE.map((item) => ({
        n: item.n,
        title: item.title,
        tier: item.tier,
        checkId: item.checkId,
      })),
    ).toEqual(PRD_ITEMS);
  });

  it("gives every item a distinct, non-empty blurb", () => {
    const blurbs = CHECKLIST_CATALOGUE.map((item) => item.blurb);
    for (const blurb of blurbs) {
      expect(blurb.trim().length).toBeGreaterThan(0);
    }
    // Duplicates would mean a row explains itself with someone else's line.
    expect(new Set(blurbs).size).toBe(19);
  });

  it("gives every automated item a unique checkId, tiered 1 or 2", () => {
    const automated = CHECKLIST_CATALOGUE.filter((item) => item.checkId);
    expect(automated).toHaveLength(16);
    expect(new Set(automated.map((item) => item.checkId)).size).toBe(16);
    for (const item of automated) {
      expect(item.tier === 1 || item.tier === 2).toBe(true);
    }
  });
});
