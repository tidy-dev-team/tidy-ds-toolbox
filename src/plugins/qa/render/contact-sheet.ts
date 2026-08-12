/**
 * #112's contact sheet, planned purely: every property combination in one eyeful,
 * rows by variant and columns by boolean state.
 *
 * **Why this is what survived of item 3b.** #112 offered three products and told
 * the reader to re-judge them once the wiring check shipped. It has (#110,
 * `variant-property-bindings`), and that changes the answer. Option A - the plugin
 * pixel-diffing renders against each other - is now largely redundant, because dead
 * properties are exactly what it would find and what the wiring check finds better,
 * by naming the layer. Option B - an agent looking at 48 renders and writing prose -
 * is the expensive, non-deterministic one, and the only one that can mislead a
 * designer with a confidently wrong subjective finding; it is also still blocked on
 * the image bridge. What is left is option C, and it is genuinely valuable.
 *
 * **What it removes.** The worst part of manual QA on this row is clicking through
 * every combination in the properties panel one at a time, trying to remember what
 * Ghost/Hover looked like eleven clicks ago. Side by side, a human spots an inverted
 * pressed state instantly - and spots it *correctly*, because they know the design
 * intent, which is the thing no heuristic here has.
 *
 * **No verdict, deliberately.** This block never sets a status. Row 3's chip comes
 * from the wiring check, and the sheet supports the row's existing tickbox. That is
 * the whole reason it is safe to draw: it cannot be wrong about anything, because it
 * claims nothing.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import { readableVariants } from "../variant-properties";
import type {
  NoStateGrid,
  PanelProperties,
  StateGridPlan,
  StateGridRow,
  StatePanel,
} from "./state-grid";

/**
 * Boolean properties expand as 2^n, so this is the cap that actually matters.
 * Three gives eight columns, which is already a wide block.
 */
const MAX_BOOLEANS = 3;

/**
 * Total instances drawn. The combinatorial ceiling #112 asked about: a set with 200
 * combinations gets capped, not sampled at random and not refused, and the footnote
 * says exactly what was dropped. Silent truncation is the one unacceptable answer,
 * because a sheet that looks complete is worse than no sheet.
 */
const MAX_CELLS = 48;

/** A boolean combination as a properties object, plus a short column label. */
interface Combination {
  label: string;
  properties: PanelProperties;
}

/**
 * Every on/off combination of `keys`, in a stable order with all-off first.
 *
 * All-off first because that is the component's resting state, so the leftmost
 * column is the one a designer already recognises and the rest read as departures
 * from it.
 */
function combinations(
  properties: readonly { key: string; name: string }[],
): Combination[] {
  const out: Combination[] = [];
  for (let mask = 0; mask < 2 ** properties.length; mask += 1) {
    const on = properties.filter((_, i) => (mask & (1 << i)) !== 0);
    out.push({
      label: on.length === 0 ? "all off" : on.map((p) => p.name).join(" + "),
      properties: Object.fromEntries(
        properties.map((p, i) => [p.key, (mask & (1 << i)) !== 0]),
      ),
    });
  }
  return out;
}

export function planContactSheet(
  snapshot: ComponentSetSnapshot,
): StateGridPlan | NoStateGrid {
  const booleans = snapshot.properties.filter(
    (property) => property.type === "BOOLEAN",
  );
  const shownBooleans = booleans.slice(0, MAX_BOOLEANS);
  const columns = combinations(shownBooleans);

  // One variant and no booleans is a component with a single appearance. There is
  // nothing to compare, and a one-cell "contact sheet" is just a copy of the
  // component sitting next to the component.
  if (snapshot.variants.length <= 1 && shownBooleans.length === 0) {
    return {
      reason:
        "the component has a single state - no variants to compare and no boolean properties to toggle",
    };
  }

  // A variant whose combination Figma refused to report cannot be drawn. Its
  // cell would set no variant properties, so it would show the *default*
  // variant under this variant's row label - a picture contradicting its own
  // caption, which is worse than an absent row.
  const drawable = readableVariants(snapshot);
  const unreadableCount = snapshot.variants.length - drawable.length;

  if (drawable.length === 0) {
    return {
      reason:
        "Figma refused to report any variant's property combination, so no cell could be set to a known state - see row 13",
    };
  }

  const rowBudget = Math.max(1, Math.floor(MAX_CELLS / columns.length));
  const shownVariants = drawable.slice(0, rowBudget);

  const rows: StateGridRow[] = shownVariants.map((variant) => ({
    label: variant.name,
    cells: columns.map(
      (combination): StatePanel => ({
        label: combination.label,
        // No captions: there is nothing measured to say. The block is for looking
        // at, and a caption under every cell would bury the pictures.
        captions: [],
        properties: {
          // The variant axes first, then the booleans - one `setProperties` call
          // per cell, so a variant row and a boolean column are the same mechanism
          // rather than two.
          ...variant.variantProperties,
          ...combination.properties,
        },
      }),
    ),
  }));

  const droppedVariants = drawable.length - shownVariants.length;
  const droppedBooleans = booleans.slice(MAX_BOOLEANS);
  const skipped = [
    droppedVariants > 0 ? `${droppedVariants} further variant(s)` : "",
    droppedBooleans.length > 0
      ? `the ${droppedBooleans.map((p) => `"${p.name}"`).join(", ")} propert${
          droppedBooleans.length === 1 ? "y" : "ies"
        }`
      : "",
  ].filter(Boolean);

  return {
    title: "Property combinations",
    subtitle:
      "Every combination side by side, so an inverted or missing state is a glance rather than eleven clicks.",
    footnote:
      "No verdict: row 3's status comes from the wiring check, and the tick is " +
      "still yours." +
      (skipped.length > 0
        ? ` Not drawn: ${skipped.join(" and ")} - this sheet is capped at ${MAX_CELLS} instances.`
        : "") +
      // Disclosed separately from the cap, because the cap is a choice this
      // block made and this is not: the variant could not be drawn at all.
      // Silence here would let the sheet read as covering the whole set.
      (unreadableCount > 0
        ? ` ${unreadableCount} further variant(s) could not be drawn: Figma refused to report their property combination - see row 13.`
        : ""),
    rows,
  };
}
