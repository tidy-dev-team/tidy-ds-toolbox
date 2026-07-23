/**
 * Static 19-item DS Component QA Checklist catalogue (issue #91).
 * Single source mapping PRD sections to engine check ids.
 */

import type { CheckId } from "./types";

export interface CatalogueItem {
  n: number;
  title: string;
  /** 1 = Tier 1 automated; 2 = planned Tier 2; null = manual-only. */
  tier: 1 | 2 | null;
  /** Present when an engine check backs this item. */
  checkId?: CheckId;
}

/** All 19 PRD checklist items, in PRD order. */
export const CHECKLIST_CATALOGUE: readonly CatalogueItem[] = [
  { n: 1, title: "Storybook Alignment + Note", tier: null },
  {
    n: 2,
    title: "Components Naming Dev Alignment",
    tier: 1,
    checkId: "set-name-casing",
  },
  { n: 3, title: "Check All the Props", tier: null },
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
  { n: 7, title: "Responsiveness (+ Min-Max)", tier: null },
  {
    n: 8,
    title: "Icons/Illustrations/Logos → Foundations",
    tier: 2,
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
  { n: 14, title: "Easy to Use (Nested Components)", tier: null },
  {
    n: 15,
    title: "Preferred (Instance Swapping)",
    tier: 1,
    checkId: "preferred-values",
  },
  { n: 16, title: "High Contrast (A11y)", tier: null },
  { n: 17, title: "Themes (Core/DNA/OldNews)", tier: null },
  { n: 18, title: "Page Template", tier: null },
  { n: 19, title: "Documentation", tier: null },
];
