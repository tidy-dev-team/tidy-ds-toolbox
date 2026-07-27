/**
 * Static 19-item DS Component QA Checklist catalogue (issue #91).
 * Single source mapping PRD sections to engine check ids.
 *
 * PRD: `docs/prd-automated-qa.md`. What design actually asked for, item by item,
 * is in `docs/qa-source-interview.md`. Consult it before widening a check or
 * rewording a blurb, since the PRD overstates several items.
 *
 * Titles mostly track the PRD wording so the generated artifact matches the
 * printed checklist designers tick by hand; item 14 deliberately diverges
 * ("Easy to Use" named a goal, not the thing being measured). Every item also
 * carries a one-line `blurb` — the title alone left several rows opaque
 * ("Preferred (Instance Swapping)", "Themes (Core/DNA/OldNews)") to anyone who
 * hadn't read the PRD.
 */

import type { CheckId } from "./types";

export interface CatalogueItem {
  n: number;
  title: string;
  /** 1 = Tier 1 automated; 2 = Tier 2 (automated once it carries a checkId, otherwise still planned); null = manual-only. */
  tier: 1 | 2 | null;
  /** Present when an engine check backs this item. */
  checkId?: CheckId;
  /** One-line plain-language description of what the item checks. */
  blurb: string;
}

/** All 19 PRD checklist items, in PRD order. */
export const CHECKLIST_CATALOGUE: readonly CatalogueItem[] = [
  {
    n: 1,
    title: "Storybook Alignment + Note",
    tier: null,
    // Per the source interview the *note* is what gets ticked here, not the
    // comparison; design explicitly scoped Storybook diffing out of this item.
    blurb:
      "A note records any deliberate deviations from the Storybook implementation.",
  },
  {
    n: 2,
    title: "Components Naming Dev Alignment",
    tier: 1,
    checkId: "set-name-casing",
    blurb: "Set name matches the dev component name, in the agreed casing.",
  },
  {
    n: 3,
    title: "Check All the Props",
    tier: 1,
    checkId: "variant-property-bindings",
    // The automated core is *wiring*, not appearance: Figma defines a boolean
    // property on the set but binds it per variant, so a toggle can appear in
    // the panel for a variant that has no binding and does nothing. That is
    // structural, hence a Tier 1 snapshot check.
    //
    // This blurb states the item, which is wider than the check: design asked
    // for all combinations cycled, long text always, and icon colour following
    // text colour. The check emits an unconditional `manualRemainder` for that
    // rest, so the row keeps a tickbox next to its chip.
    blurb: "Every property combination renders correctly across the set.",
  },
  {
    n: 4,
    title: "Prop Names Aligned to Catalogue",
    tier: 1,
    checkId: "prop-order",
    blurb: "Property names and their order follow the shared catalogue.",
  },
  {
    n: 5,
    title: "Tokens (Styles & Variables)",
    tier: 1,
    checkId: "tokens",
    blurb: "Colour, spacing and type come from variables — not raw values.",
  },
  {
    n: 6,
    title: "Typography Desktop|Mobile",
    tier: null,
    blurb: "Type scales switch correctly between desktop and mobile modes.",
  },
  {
    n: 7,
    title: "Responsiveness (+ Min-Max)",
    tier: 2,
    checkId: "responsive-bounds",
    // Only the size-bounds half is automated; the check emits a
    // `manualRemainder` so the row keeps its tickbox for the resize test.
    blurb:
      "Resizing behaves under auto-layout, with min/max bounds where they apply.",
  },
  {
    n: 8,
    title: "Icons/Illustrations/Logos → Foundations",
    tier: 2,
    checkId: "asset-provenance",
    blurb: "Nested icons, illustrations and logos come from the DS library.",
  },
  {
    n: 9,
    title: "Layer Naming + Structure",
    tier: 1,
    checkId: "layer-naming-structure",
    blurb: "Layers follow the naming pattern — no default or stray names.",
  },
  {
    n: 10,
    title: "4px Grid Alignment",
    tier: 1,
    checkId: "grid-4px",
    blurb: "Sizes and spacing land on the 4px grid.",
  },
  {
    n: 11,
    title: "Interaction (Hover Only)",
    tier: 1,
    checkId: "interaction-hover-only",
    blurb: "Prototype interactions are limited to hover triggers.",
  },
  {
    n: 12,
    title: "Description (AKA + Misprint)",
    tier: 1,
    checkId: "description",
    blurb: "Description carries the also-known-as line and misprint marker.",
  },
  {
    n: 13,
    title: "No Conflicts",
    tier: 1,
    checkId: "no-conflicts",
    blurb: "No two variants share the same property combination.",
  },
  {
    n: 14,
    title: "Nested Instance Depth",
    tier: 2,
    checkId: "nesting-depth",
    blurb:
      "Exposed nested instances stay shallow, so the configuration panel stays readable.",
  },
  {
    n: 15,
    title: "Preferred (Instance Swapping)",
    tier: 1,
    checkId: "preferred-values",
    blurb: "Instance-swap properties offer a curated list, not everything.",
  },
  {
    n: 16,
    title: "High Contrast (A11y)",
    tier: 2,
    checkId: "high-contrast",
    blurb:
      "Text meets WCAG AA contrast against the surface behind it, in every theme mode.",
  },
  {
    n: 17,
    title: "Themes (Core/DNA/OldNews)",
    tier: 2,
    checkId: "themes",
    blurb: "Every bound variable resolves in all theme modes, with no gaps.",
  },
  {
    n: 18,
    title: "Page Template",
    tier: null,
    blurb: "The component is placed on its documentation page template.",
  },
  {
    n: 19,
    title: "Documentation",
    tier: 2,
    checkId: "documentation",
    // This blurb claims something about the documentation's *content*, which
    // the check cannot see - it reads Figma's documentation-link field. The
    // check emits a `manualRemainder` asking for the content review, but only
    // when a link exists; with no documentation there is nothing to review.
    blurb: "Usage guidance, do/don't examples and properties are documented.",
  },
];
