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
import { SEVERITY_RANK } from "../dedupe-findings";
import { findingMode } from "../finding-fields";
import type { GroupedFinding } from "../grouped-findings";
import type { ComponentSetSnapshot, VariantSnapshot } from "../snapshot";
import { variantLabel } from "../variant-label";
import type { ChecklistItem, SeverityLevel } from "../types";

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
  /**
   * The variable mode to pin on this sample's stage, when the finding is about one
   * (#173).
   *
   * Absent means "draw it as the page resolves it", which is right for a defect
   * that is not mode-specific and wrong for one that is: a contrast pair that
   * fails only in one mode, drawn unpinned, can show a state where nothing looks
   * wrong. The planner only sets this when the finding gave it both a mode id and
   * a name, so a pin is never claimed without something to pin.
   */
  pinnedModeId?: string;
  /**
   * The pinned mode's name, carried beside the id so the renderer can decide the
   * stage's backdrop without a theme table. A dark mode drawn against the white
   * card misrepresents the component as badly as a wrong mode would - see
   * `stage-surface.ts`, which owns that rule.
   */
  pinnedModeName?: string;
}

/** The samples for one row, in the order their finding lines are drawn. */
export interface RowSamples {
  /** Checklist row number. */
  n: number;
  samples: FindingSample[];
  /**
   * How much of this row's illustrable defect the pictures cover, for a line at
   * the foot of its findings block. Undefined when they cover all of it.
   *
   * Never silent when something is missing: a truncated set of pictures reads as
   * "these are all the visible defects", which is the failure the grid blocks'
   * mandatory footnote exists to prevent.
   *
   * **Deliberately a coverage statement, not a bound-attribution one, and #172's
   * "neither line appears when its bound did not bite" is not met as written.**
   * That criterion assumed each line reported its own bound. Trying it that way
   * produced a line that lied: a row of five kept three under the row bound, said
   * "2 more not shown", then lost two of the three to the checklist-wide bound and
   * showed one picture. Attributing an omission to a single cause is what breaks,
   * because two causes compose. So this line now says what the row is showing out
   * of what it had, which is true whichever bound cut - and it does appear when
   * only the checklist-wide bound bit. The header line still names that cause,
   * which no row can see. The overlap is two true statements about one omission,
   * not a contradiction.
   */
  coverageNotice?: string;
}

export interface ChecklistSamplePlan {
  rows: RowSamples[];
  /** Total pictures the plan asks for - what the operation reports. */
  total: number;
  /**
   * What the checklist-wide bound dropped, for the header summary line, or
   * undefined when it did not bite.
   *
   * On the header rather than on a row because by the time this bound bites the
   * omission belongs to no single row - putting the sentence under whichever row
   * happened to be last would attribute it arbitrarily.
   */
  droppedNotice?: string;
}

/**
 * Most samples one row may draw.
 *
 * A row can carry up to `MAX_FINDING_GROUPS` finding kinds, and on a large set
 * with a flagged check most of them can name affected variants. Three is enough
 * to show that a defect has more than one shape without turning the row into a
 * wall of pictures nobody reads.
 */
export const MAX_SAMPLES_PER_ROW = 3;

/**
 * Most samples the whole frame may draw.
 *
 * Each one is a live instance, and a set with many variants makes them expensive
 * to build as well as long to scroll. The frame is a reading surface first.
 */
export const MAX_SAMPLES_PER_CHECKLIST = 6;

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

  // One decision, shared with the check and the projection, so the caption can
  // never name a mode the stage did not pin nor a pin the caption omits.
  const mode = findingMode(group);

  return {
    groupIndex,
    variantId,
    caption: `${variantLabel(variant)}${mode ? ` - mode ${mode.name}` : ""}${coverage(
      group.affectedVariantCount,
    )}`,
    ...(mode ? { pinnedModeId: mode.id, pinnedModeName: mode.name } : {}),
  };
}

/** A sample that has not yet survived either bound. */
interface Candidate {
  sample: FindingSample;
  n: number;
  severity: SeverityLevel;
}

/** `1 variant sample` / `2 variant samples`. */
function countPhrase(n: number): string {
  return `${n} variant sample${n === 1 ? "" : "s"}`;
}

/**
 * The pictures the whole checklist should draw, within both bounds.
 *
 * Takes the rows as the renderer already holds them - item plus the grouped lines
 * it is about to draw - so the plan's `groupIndex` and the drawn lines cannot
 * disagree about which finding a sample belongs to.
 *
 * Both bounds keep the most severe candidates. Within a row that falls out for
 * free: `groupFindings` has already sorted the lines by severity precedence, so
 * the first three are the worst three. Across the checklist it does not, because
 * rows are drawn in checklist order and row 3's warnings would otherwise spend
 * the budget before row 16's failures were considered - so the whole candidate
 * set is ranked before the second bound is applied, and only then put back into
 * drawing order.
 */
export function planChecklistSamples(
  rows: readonly PlannableRow[],
  snapshot: ComponentSetSnapshot,
): ChecklistSamplePlan {
  const variants = variantIndex(snapshot);
  const candidates: Candidate[] = [];
  /**
   * How many distinct pictures each row could have drawn, before either bound.
   *
   * Distinct is the operative word: a row whose findings all point at one variant
   * wants one picture, not one per finding, so its coverage line does not claim to
   * be hiding repeats it would never have drawn.
   */
  const wantedPerRow = new Map<number, number>();

  for (const row of rows) {
    if (!rowQualifies(row.item)) continue;

    const forRow: Candidate[] = [];
    /**
     * Pictures already drawn on this row, so no two are the same picture.
     *
     * Found on canvas, not in a test. On the real `button`, three findings - a
     * missing `label`, a missing `icon L`, a missing `icon R` - all have no target
     * in the same 18 loading variants, so each picked the same first affected
     * variant and the row drew three identical pictures with three identical
     * captions. It reads as a rendering bug. Nothing is lost by dropping those
     * repeats: the picture cannot show *which* property is missing, because all
     * three are missing in that variant.
     *
     * **Keyed on the variant *and* the pinned mode**, which the first version got
     * wrong. Keyed on the variant alone it silently dropped every Light-mode
     * contrast finding on `button`, because those pairs fail on the same variants
     * as their Dark counterparts - so the row showed three pictures all captioned
     * "mode Dark" while equally real Light failures went unillustrated. One variant
     * in two modes is two different images, each proving its own finding, and
     * exactly not a repeat.
     *
     * Within a row only. The same variant on row 3 and on row 16 illustrates two
     * different defects, and each row's picture is the evidence for its own.
     */
    const drawn = new Set<string>();
    row.groups.forEach((group, index) => {
      const sample = sampleFor(group, index, variants);
      if (!sample) return;
      // NUL-joined so a variant id containing the separator cannot collide with a
      // mode id; neither Figma id contains one.
      const key = `${sample.variantId} ${sample.pinnedModeId ?? ""}`;
      if (drawn.has(key)) return;
      drawn.add(key);
      forRow.push({ sample, n: row.item.n, severity: group.severity });
    });

    if (forRow.length === 0) continue;
    wantedPerRow.set(row.item.n, forRow.length);
    candidates.push(...forRow.slice(0, MAX_SAMPLES_PER_ROW));
  }

  // Ranked by severity only, with ties left in the order they were collected -
  // which is checklist order, then line order within a row. A stable sort is what
  // makes the choice reproducible rather than dependent on how the rows arrived.
  //
  // Not `compareFindingPrecedence`, deliberately: that also orders by count and
  // then message, which would decide *drawing* order too and lose the property
  // that samples appear beside the lines they belong to, in line order.
  const ranked = [...candidates].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
  const kept = new Set(ranked.slice(0, MAX_SAMPLES_PER_CHECKLIST));
  const droppedOverall = Math.max(
    0,
    candidates.length - MAX_SAMPLES_PER_CHECKLIST,
  );

  const planned: RowSamples[] = [];
  let total = 0;
  for (const row of rows) {
    const wanted = wantedPerRow.get(row.item.n);
    if (wanted === undefined) continue;

    const samples = candidates
      .filter((candidate) => candidate.n === row.item.n && kept.has(candidate))
      .map((candidate) => candidate.sample);

    // Counted against what the row *wanted*, after both bounds have had their
    // say - not against the per-row bound alone. A row of five keeps three, and
    // the checklist-wide bound can then take two of those three: a notice derived
    // from the row bound would say "2 not shown" beside a single picture, which
    // understates by two. Stating "showing 1 of 5" cannot drift, whichever bound
    // did the cutting.
    planned.push({
      n: row.item.n,
      samples,
      ...(samples.length < wanted
        ? {
            coverageNotice: `Showing ${samples.length} of ${countPhrase(wanted)} for this row.`,
          }
        : {}),
    });
    total += samples.length;
  }

  return {
    rows: planned,
    total,
    // The checklist-wide bound names its own cause, which no row can: a row knows
    // it is showing fewer than it wanted, not that the frame ran out of budget.
    ...(droppedOverall > 0
      ? {
          droppedNotice: `${countPhrase(droppedOverall)} not shown (at most ${MAX_SAMPLES_PER_CHECKLIST} per checklist).`,
        }
      : {}),
  };
}
