/**
 * Which findings get a picture, which variant it is of, and what the caption says
 * (#171).
 *
 * Pure, and deliberately so. Everything decided here is a claim the frame makes
 * to a reader - "this variant", "1 of 18 affected variants" - and every one of
 * those is fixture-testable without Figma. What is left for `renderChecklist` is
 * instancing and clipping.
 *
 * That split matters more in this engine than most. Three separate visual defects
 * shipped past a full unit suite and were only caught by rendering the frame and
 * looking at it (#146), so the smaller the part that can only be checked by eye,
 * the better.
 *
 * The variant is never guessed. A finding says which variants it is about or gets
 * no sample: the alternative is walking up from the representative offender to
 * whatever variant contains it, which finds *a* real variant but cannot say how
 * many others share the defect - and a sample whose caption cannot state its own
 * coverage reads as "this is the problem" when it is one of eighteen.
 */

import { showsVisibleDefect } from "../checklist-catalogue";
import type { GroupedFinding } from "../grouped-findings";
import type { ComponentSetSnapshot, VariantSnapshot } from "../snapshot";
import type { ChecklistItem } from "../types";

/** One picture to draw: which variant, and what to say under it. */
export interface FindingSample {
  /**
   * Index into the row's grouped findings, so the renderer can hang the sample
   * off the line it belongs to rather than at the foot of the row.
   */
  groupIndex: number;
  /** The variant component to instance. */
  variantId: string;
  /** Printed beneath the instance. States what it is and how much it covers. */
  caption: string;
}

/** The samples for one row, in the order their finding lines are drawn. */
export interface RowSamples {
  /** Checklist row number. */
  n: number;
  samples: FindingSample[];
}

export interface ChecklistSamplePlan {
  rows: RowSamples[];
  /** Total pictures the plan asks for - what the operation reports. */
  total: number;
}

/** A row as the renderer holds it: the item, and the lines it will draw. */
export interface PlannableRow {
  item: ChecklistItem;
  groups: readonly GroupedFinding[];
}

/**
 * Rows whose findings may be illustrated at all.
 *
 * `fail` and `warn` are the only statuses that carry findings, so gating on them
 * is belt-and-braces rather than a rule - but it is the rule design stated, and
 * stating it here means a future status that somehow carries findings does not
 * silently start drawing pictures.
 */
function rowQualifies(item: ChecklistItem): boolean {
  if (item.status !== "fail" && item.status !== "warn") return false;
  return showsVisibleDefect(item.checkId);
}

/** Every variant in the set, by id. Built once per plan rather than per finding. */
function variantIndex(
  snapshot: ComponentSetSnapshot,
): Map<string, VariantSnapshot> {
  return new Map(snapshot.variants.map((variant) => [variant.id, variant]));
}

/**
 * `size=s, type=outlined, state=loading` - the variant's property values, which
 * is how a designer identifies a variant, falling back to the node name for a
 * standalone component that has none.
 */
function variantLabel(variant: VariantSnapshot): string {
  const pairs = Object.entries(variant.variantProperties);
  if (pairs.length === 0) return variant.name;
  return pairs.map(([property, value]) => `${property}=${value}`).join(", ");
}

/**
 * What the caption says about coverage.
 *
 * The denominator is `affectedVariantCount`, never the length of the id list: the
 * ids are capped, so on a finding covering more variants than the cap the list
 * would report the cap and shrink the problem. A count of 1 gets no fraction at
 * all, since "1 of 1 affected variants" is a longer way of saying nothing.
 */
function coverage(count: number | undefined): string {
  if (count === undefined || count <= 1) return "";
  return ` - 1 of ${count} affected variants`;
}

/**
 * The sample for one finding line, or nothing.
 *
 * Nothing happens more often than something, and every case is deliberate: a
 * check that declared no affected variants, an id naming a variant this snapshot
 * does not contain (a set that changed under the run). In each the finding line
 * still stands on its own, and no caption is printed, so the frame never claims
 * coverage it cannot show.
 */
function sampleFor(
  group: GroupedFinding,
  groupIndex: number,
  variants: Map<string, VariantSnapshot>,
): FindingSample | undefined {
  const [variantId] = group.affectedVariantIds ?? [];
  if (variantId === undefined) return undefined;

  const variant = variants.get(variantId);
  if (variant === undefined) return undefined;

  return {
    groupIndex,
    variantId,
    caption: `${variantLabel(variant)}${coverage(group.affectedVariantCount)}`,
  };
}

/**
 * The pictures the whole checklist should draw.
 *
 * Takes the rows as the renderer already holds them - item plus the grouped lines
 * it is about to draw - so the plan's `groupIndex` and the drawn lines cannot
 * disagree about which finding a sample belongs to.
 */
export function planChecklistSamples(
  rows: readonly PlannableRow[],
  snapshot: ComponentSetSnapshot,
): ChecklistSamplePlan {
  const variants = variantIndex(snapshot);
  const planned: RowSamples[] = [];
  let total = 0;

  for (const row of rows) {
    if (!rowQualifies(row.item)) continue;

    const samples: FindingSample[] = [];
    row.groups.forEach((group, index) => {
      const sample = sampleFor(group, index, variants);
      if (sample) samples.push(sample);
    });

    if (samples.length === 0) continue;
    planned.push({ n: row.item.n, samples });
    total += samples.length;
  }

  return { rows: planned, total };
}
