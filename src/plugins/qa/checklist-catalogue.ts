/**
 * The DS Component QA Checklist: **one table, one row per checklist item** -
 * the single declaration of what QA covers (issues #91, #132).
 *
 * A row carries everything about its item: its number (which is its identity),
 * the printed title and blurb, and - when the item is automated - the check
 * function that backs it plus the snapshot facets that check needs. A row with
 * no `run` is manual, and that absence is the whole definition of manual.
 *
 * Adding or dropping a check is therefore one edit here, not four hand-synced
 * lists. Everything else is derived: the run helper's registry and default order
 * (`checks/index.ts`), the agent-facing id list (`CHECK_IDS`, interpolated into
 * the MCP schema), the row count (never the literal 19), and which expensive
 * collector passes a filtered run needs (`requiredFacets`).
 *
 * PRD: `docs/prd-automated-qa.md`. What design actually asked for, item by item,
 * is in `docs/qa-source-interview.md`. Consult it before widening a check or
 * rewording a blurb, since the PRD overstates several items.
 *
 * Titles mostly track the PRD wording so the generated artifact matches the
 * printed checklist designers tick by hand; item 14 deliberately diverges
 * ("Easy to Use" named a goal, not the thing being measured). Every item also
 * carries a one-line `blurb` — the title alone left several rows opaque
 * ("Preferred (Instance Swapping)", "Themes (per-mode resolution)") to anyone who
 * hadn't read the PRD.
 */

import type { CheckFn } from "./types";
import { checkSetNameCasing } from "./checks/set-name-casing";
import { checkPropOrder } from "./checks/prop-order";
import { checkInteractionHoverOnly } from "./checks/interaction-hover-only";
import { checkNoConflicts } from "./checks/no-conflicts";
import { checkDescription } from "./checks/description";
import { checkPreferredValues } from "./checks/preferred-values";
import { checkTokens } from "./checks/tokens";
import { checkGrid4px } from "./checks/grid-4px";
import { checkLayerNamingStructure } from "./checks/layer-naming-structure";
import { checkNestingDepth } from "./checks/nesting-depth";
import { checkAssetProvenance } from "./checks/asset-provenance";
import { checkThemes } from "./checks/themes";
import { checkHighContrast } from "./checks/high-contrast";
import { checkResponsiveBounds } from "./checks/responsive-bounds";
import { checkDocumentation } from "./checks/documentation";
import { checkVariantPropertyBindings } from "./checks/variant-property-bindings";

/**
 * A part of the snapshot that is *not* collected unconditionally, because it is
 * expensive and - in the probe's case - the one thing in a QA run that touches
 * the document (the ADR-0001 carve-out).
 *
 * A check that reads one must declare it in `needs`, so the requirement lives
 * with the check that has it. Forgetting to declare one is not a wrong green:
 * the facet is simply never collected for a run of that check alone, and every
 * check treats absent data as `not_applicable` *with a reason* - which is what
 * a reader would then see, rather than a confident tick.
 */
export type SnapshotFacet = "colorStyles" | "theme" | "resizeProbe";

/**
 * The shape each row must satisfy. Deliberately types `checkId` as a plain
 * string: `CheckId` is derived *from* the literal below, so the shape that
 * validates the literal cannot be the thing that already knows the ids.
 */
interface CatalogueRowShape {
  /** Checklist row number - the row's identity, and its printed order. */
  n: number;
  title: string;
  /** 1 = Tier 1 automated; 2 = Tier 2 automated; null = manual-only. */
  tier: 1 | 2 | null;
  /**
   * The engine check backing this item. Present together with `run`, or absent
   * together with it: the id is the agent-facing name of exactly this row's check.
   */
  checkId?: string;
  /** The check itself. Absent means the item is manual. */
  run?: CheckFn;
  /** Snapshot facets `run` reads; see `SnapshotFacet`. */
  needs?: readonly SnapshotFacet[];
  /** One-line plain-language description of what the item checks. */
  blurb: string;
}

/**
 * The rows themselves. `as const` so the literal survives for `CheckId` to be
 * read off it; `satisfies` so it is still checked against the row shape. Kept
 * internal because the literal's type is a union of 19 distinct row shapes, on
 * which `row.checkId` cannot be spoken of at all - consumers want the widened
 * `CHECKLIST_CATALOGUE` below.
 */
const ROWS = [
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
    run: checkSetNameCasing,
    blurb: "Set name matches the dev component name, in the agreed casing.",
  },
  {
    n: 3,
    title: "Check All the Props",
    tier: 1,
    checkId: "variant-property-bindings",
    run: checkVariantPropertyBindings,
    // The automated core is *wiring*, not appearance: Figma defines a boolean
    // property on the set but binds it per variant, so a toggle can appear in
    // the panel for a variant that has no binding and does nothing. That is
    // structural, hence a Tier 1 snapshot check.
    //
    // This blurb states the item, which is wider than the check: design asked
    // for all combinations cycled, long text always, and icon colour following
    // text colour. The check emits an unconditional `manualRemainder` for that
    // rest, so the row states the outstanding work next to its chip.
    blurb: "Every property combination renders correctly across the set.",
  },
  {
    n: 4,
    title: "Prop Names Aligned to Catalogue",
    tier: 1,
    checkId: "prop-order",
    run: checkPropOrder,
    blurb: "Property names and their order follow the shared catalogue.",
  },
  {
    n: 5,
    title: "Tokens (Styles & Variables)",
    tier: 1,
    checkId: "tokens",
    run: checkTokens,
    blurb: "Colour, spacing and type come from variables, not raw values.",
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
    run: checkResponsiveBounds,
    needs: ["resizeProbe"],
    // Both halves are automated now (#111): the advisory min/max scan, and the
    // measured resize behaviour that instances the default variant and drives its
    // width. The remainder shrinks accordingly - once geometry has been measured
    // the row asks only for what geometry cannot see (a fill that distorts when
    // stretched) rather than for the whole resize test.
    blurb:
      "Resizing behaves under auto-layout, with min/max bounds where they apply.",
  },
  {
    n: 8,
    title: "Icons/Illustrations/Logos → Foundations",
    tier: 2,
    checkId: "asset-provenance",
    run: checkAssetProvenance,
    blurb: "Nested icons, illustrations and logos come from the DS library.",
  },
  {
    n: 9,
    title: "Layer Naming + Structure",
    tier: 1,
    checkId: "layer-naming-structure",
    run: checkLayerNamingStructure,
    blurb: "Layers follow the naming pattern - no default or stray names.",
  },
  {
    n: 10,
    title: "4px Grid Alignment",
    tier: 1,
    checkId: "grid-4px",
    run: checkGrid4px,
    blurb: "Sizes and spacing land on the 4px grid.",
  },
  {
    n: 11,
    title: "Interaction (Hover Only)",
    tier: 1,
    checkId: "interaction-hover-only",
    run: checkInteractionHoverOnly,
    blurb: "Prototype interactions are limited to hover triggers.",
  },
  {
    n: 12,
    title: "Description (AKA + Misprint)",
    tier: 1,
    checkId: "description",
    run: checkDescription,
    blurb: "Description carries the also-known-as line and misprint marker.",
  },
  {
    n: 13,
    title: "No Conflicts",
    tier: 1,
    checkId: "no-conflicts",
    run: checkNoConflicts,
    blurb: "No two variants share the same property combination.",
  },
  {
    n: 14,
    title: "Nested Instance Depth",
    tier: 2,
    checkId: "nesting-depth",
    run: checkNestingDepth,
    blurb:
      "Exposed nested instances stay shallow, so the configuration panel stays readable.",
  },
  {
    n: 15,
    title: "Preferred (Instance Swapping)",
    tier: 1,
    checkId: "preferred-values",
    run: checkPreferredValues,
    blurb: "Instance-swap properties offer a curated list, not everything.",
  },
  {
    n: 16,
    title: "High Contrast (A11y)",
    tier: 2,
    checkId: "high-contrast",
    run: checkHighContrast,
    needs: ["colorStyles", "theme"],
    blurb:
      "Text meets WCAG AA contrast against the surface behind it, in every theme mode.",
  },
  {
    n: 17,
    // Deliberately names no collection. #77 rejected hardcoding
    // `Core / DNA / OldNews`, and real files bear that out: two sets in one file
    // resolved "semantic colors" and "theme" respectively, so there may be no
    // single "the theme" in a file. The check's own note names the collection
    // and modes it actually evaluated, which is what makes a wrong pick visible
    // instead of silently green (#127).
    title: "Themes (per-mode resolution)",
    tier: 2,
    checkId: "themes",
    run: checkThemes,
    needs: ["theme"],
    // States the item, which is wider than the check: design asked that the
    // component work and *look good* in every mode, while `themes` establishes
    // only that every bound variable resolves. The check emits a
    // `manualRemainder` naming the modes for the visual half, so the row carries
    // the outstanding visual review beside its chip (#115).
    blurb: "The component resolves and reads correctly in every theme mode.",
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
    run: checkDocumentation,
    // This blurb claims something about the documentation's *content*, which
    // the check cannot see - it reads Figma's documentation-link field. The
    // check emits a `manualRemainder` asking for the content review, but only
    // when a link exists; with no documentation there is nothing to review.
    blurb: "Usage guidance, do/don't examples and properties are documented.",
  },
] as const satisfies readonly CatalogueRowShape[];

/**
 * The stable, agent-facing id of every automated check - read off the table
 * rather than restated, so the compiler (not a test, and not review) is what
 * guarantees the id vocabulary and the checklist cannot disagree. An id no row
 * claims cannot be spelled anywhere.
 */
export type CheckId = Extract<
  (typeof ROWS)[number],
  { checkId: string }
>["checkId"];

/** One checklist row, widened so the optional keys can be read on any row. */
export interface CatalogueItem extends Omit<CatalogueRowShape, "checkId"> {
  checkId?: CheckId;
}

/** Every checklist item, in printed order. The count is `.length`, never a literal. */
export const CHECKLIST_CATALOGUE: readonly CatalogueItem[] = ROWS;

/** Rows an engine check backs, narrowed so `checkId`/`run` are no longer optional. */
export type AutomatedItem = CatalogueItem &
  Required<Pick<CatalogueItem, "checkId" | "run">>;

/** The automated rows, in checklist order. */
export const AUTOMATED_ITEMS: readonly AutomatedItem[] =
  CHECKLIST_CATALOGUE.filter(
    (item): item is AutomatedItem =>
      item.checkId !== undefined && item.run !== undefined,
  );

/**
 * Every check id, in checklist order - the default run order, and the list
 * interpolated into the MCP schema and asserted against `/tidy-qa` (#133) so an
 * added or dropped check cannot leave an agent told something untrue.
 */
export const CHECK_IDS: readonly CheckId[] = AUTOMATED_ITEMS.map(
  (item) => item.checkId,
);

/** The row backing `id`, or undefined when no row claims it. */
export function itemForCheck(id: string): AutomatedItem | undefined {
  return AUTOMATED_ITEMS.find((item) => item.checkId === id);
}

/**
 * The snapshot facets a run of `requested` needs collecting (an absent filter
 * means the whole catalogue). Pure, so the union is testable without Figma -
 * the enrichment it drives is not (see `prepareSnapshot` in collector.ts).
 */
export function requiredFacets(
  requested?: readonly string[],
): Set<SnapshotFacet> {
  const facets = new Set<SnapshotFacet>();
  for (const item of AUTOMATED_ITEMS) {
    if (requested !== undefined && !requested.includes(item.checkId)) continue;
    for (const facet of item.needs ?? []) facets.add(facet);
  }
  return facets;
}
