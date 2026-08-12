/**
 * #111's canvas evidence, planned purely: the baseline beside the state that
 * broke, labelled with the measured numbers.
 *
 * **Why the picture is proof rather than analysis.** Geometry has already written
 * the finding by the time this runs, so nothing needs to reason over the pixels.
 * That is what makes this block cheap and safe: no images go to an agent, no token
 * cost, no non-determinism, and no way for the tool to be confidently wrong about
 * what a picture shows. It also answers design's stage-2 ask literally - "say it
 * has a problem with responsiveness, then let it show me what the problem is" - in
 * the medium she already works in.
 *
 * **Only on the failing path.** A healthy component produces no block at all, so a
 * clean QA run costs exactly what it did before. That is the budget discipline
 * falling out of the architecture rather than being bolted on as a cap: two frames
 * on a broken component, against #112's naive 48 on every component.
 *
 * The row's status text still has to stand alone, because a text-only QA run - the
 * default, read-only mode - produces no canvas and therefore no evidence. This
 * augments a finding; it never carries one.
 */

import type { ComponentSetSnapshot, ResizeProbeSnapshot } from "../snapshot";
import type { Anomaly } from "../resize/anomalies";
import { STRESS_TEXT, textPropertyKeys } from "../resize/plan";
import type {
  NoStateGrid,
  StateGridPlan,
  StateGridRow,
  StatePanel,
} from "./state-grid";

/**
 * How many broken states to draw beside the baseline.
 *
 * Two is enough to show a narrow failure and a wide one, which are different
 * defects. Beyond that the block stops being a glance, and the findings on the row
 * already carry the full list.
 */
const MAX_STATES = 2;

/** Measured facts per cell. More than this and the caption outgrows the picture. */
const MAX_CAPTIONS = 3;

/** Groups anomalies by the state they were observed in, preserving first-seen order. */
function byState(anomalies: readonly Anomaly[]): Map<string, Anomaly[]> {
  const groups = new Map<string, Anomaly[]>();
  for (const anomaly of anomalies) {
    const existing = groups.get(anomaly.state);
    if (existing) existing.push(anomaly);
    else groups.set(anomaly.state, [anomaly]);
  }
  return groups;
}

/**
 * Verdicts before candidates, so a truncated caption list keeps the facts that
 * actually settle something rather than the ones a human still has to rule on.
 */
function captionsFor(anomalies: readonly Anomaly[]): string[] {
  const ordered = [
    ...anomalies.filter((a) => a.confidence === "verdict"),
    ...anomalies.filter((a) => a.confidence === "candidate"),
  ];
  const shown = ordered.slice(0, MAX_CAPTIONS).map((a) => a.detail);
  const hidden = ordered.length - shown.length;
  return hidden > 0 ? [...shown, `+${hidden} more on the row.`] : shown;
}

export function planResizeEvidence(
  probe: ResizeProbeSnapshot | undefined,
  snapshot: ComponentSetSnapshot,
): StateGridPlan | NoStateGrid {
  if (!probe) {
    return { reason: "the resize probe did not run for this checklist" };
  }
  if (probe.skipped) {
    return { reason: `nothing was measured: ${probe.skipped}` };
  }
  if (probe.unmoved) {
    return {
      reason:
        "driving the width did not move the component, so there is no state to show",
    };
  }

  const widthGroups = byState(probe.anomalies ?? []);
  const textGroups = byState(probe.textStress?.anomalies ?? []);
  if (widthGroups.size === 0 && textGroups.size === 0) {
    // The healthy path, and the common one. Drawing "here is your component, it
    // is fine" would be litter, and the row's green chip already says it.
    return {
      reason:
        "geometry was measured and nothing drifted, so there is nothing to show",
    };
  }

  const baseline: StatePanel = {
    label: `baseline - ${probe.baselineWidth}px`,
    captions: ["As built, for comparison."],
    width: probe.baselineWidth,
  };

  const broken: StatePanel[] = [];
  for (const [state, anomalies] of widthGroups) {
    broken.push({
      label: state,
      captions: captionsFor(anomalies),
      // Every anomaly in a group shares its state, so any of them carries the
      // width the probe had driven to.
      width: anomalies[0].measuredAtWidth,
    });
  }
  for (const [state, anomalies] of textGroups) {
    broken.push({
      label: state,
      captions: captionsFor(anomalies),
      // Deliberately no width: mixing a driven width with injected long text in
      // one picture would leave a reader unable to say which caused what.
      //
      // The probe's own string, not a shorter stand-in. A prettier sample was
      // tried and is wrong: if the drawn text is shorter than the measured text it
      // may not clip, and the picture would then quietly contradict the finding it
      // exists to prove.
      properties: Object.fromEntries(
        textPropertyKeys(snapshot).map((key) => [key, STRESS_TEXT]),
      ),
    });
  }

  const shown = broken.slice(0, MAX_STATES);
  const dropped = broken.length - shown.length;

  const rows: StateGridRow[] = [{ label: "", cells: [baseline, ...shown] }];

  return {
    title: "Resize evidence",
    subtitle: `Measured on "${probe.variantName}". The picture is proof of the finding, not the finding.`,
    // Baseline, narrowed and widened are driven to genuinely different widths
    // (see `driveWidthThrough`), so side by side the card is as wide as all
    // three put together. Stacked, it is as wide as the widest one - the
    // widened cell - and grows downward instead.
    //
    // That bounds the card by one cell rather than bounding it outright: a state
    // driven past 2000px still makes a card that wide. Clipping it would bound
    // the width, and is deliberately not done - the block exists to show what
    // the layout did at that width, and cutting the picture could cut the very
    // defect the row is reporting.
    cellDirection: "VERTICAL",
    footnote:
      `Row 7's status comes from the measurements, not from this block. ` +
      (dropped > 0
        ? `${dropped} further broken state(s) are on the row but not drawn here. `
        : "") +
      `Other variants were not measured.`,
    rows,
  };
}
