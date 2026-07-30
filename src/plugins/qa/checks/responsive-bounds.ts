/**
 * #7 - responsiveness. Both halves: the advisory size-bounds scan, and the
 * measured resize behaviour that shipped later (#111).
 *
 * **The bounds half is advisory and always was.** Design's ask is narrow and
 * explicitly so: look at min/max width and height, and if there are none,
 * *recommend* having them - the requested output is literally "note, there aren't
 * any". It is also routinely skipped ("in projects where the design systems are
 * less robust, like here, we don't always go into it"). See
 * docs/qa-source-interview.md#7-responsiveness--min-max. So no absence of a bound
 * can ever fail this row; the worst a bound finding gets is `warn` at `low`.
 *
 * **The resize half can fail, and that is the point.** Design named
 * responsiveness as the one item where she wanted to be *shown* the problem
 * rather than told a verdict. Content clipped away or collapsed to nothing is
 * wrong however it got there, so those findings are `fail` at `high`.
 *
 * **Why both halves are one row and one check id.** Issue #111 left this open and
 * leaned toward two ids. One won, for the reason rows 16 and 17 already
 * demonstrate: the catalogue is one row per printed checklist item, designers tick
 * that printed checklist by hand, and a phantom "row 7b" would diverge from it.
 * Rows 16 and 17 are also both Tier 2 checks that unconditionally pay for a
 * document-touching probe declared through the catalogue's `needs`, which is
 * exactly what this row now does. The distinction the two-id idea was protecting -
 * that one half cannot fail and the other can - is kept where a reader actually
 * meets it: in the severities, in the finding wording, and in the note.
 *
 * **Absence of *all four* bounds is the reported case, not incompleteness.**
 * Requiring every bound on every component would put four findings on nearly
 * every set, which is how a row stops being read.
 * A component that sets some bounds has clearly been considered, so it passes -
 * with the unset ones named in `note`, keeping the row descriptive without
 * making it amber.
 *
 * Only **variant roots** are examined for bounds, since the item is about the
 * component's own resize behaviour.
 * Whether a root can hold bounds at all comes from the collector's
 * `boundsApplicable`, not from the root's own `layoutMode`: Figma allows bounds
 * on auto-layout frames *and their direct children*, so a `layoutMode: "NONE"`
 * variant inside an auto-layout component set is still a legitimate place for
 * them and must not be silently skipped.
 */

import { stretchRisks } from "../resize/stretch-risk";
import type { Anomaly } from "../resize/anomalies";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  ResizeProbeSnapshot,
} from "../snapshot";
import type { CheckResult, CheckStatus, Finding } from "../types";

const TITLE = "Responsiveness (bounds + resize)";

/**
 * What is still owed when the probe did not measure anything - the original
 * unconditional remainder.
 *
 * Unconditional in that case, unlike #19's: that a set cannot hold bounds says
 * nothing about whether it survives being resized, so the tickbox is owed on
 * every outcome including `not_applicable`.
 */
const RESIZE_REMAINDER =
  "Resize the component and confirm nothing breaks. Only min/max bounds are " +
  "checked automatically.";

/**
 * What is still owed once geometry *has* been measured.
 *
 * Deliberately much smaller, and no longer the whole resize test. Two things
 * genuinely remain, and only two: the variants the probe did not instance, and
 * non-geometric distortion - an image or gradient fill that stretches badly, a
 * corner radius that reads wrong at width, a border that stops looking like a
 * border. Everything is in bounds, it looks bad, and geometry is silent. That is
 * the one real detection gap in this design, so it is what the row asks a human
 * for.
 */
function measuredRemainder(variantName: string, otherVariants: number): string {
  const others =
    otherVariants > 0
      ? ` Geometry was measured on "${variantName}" only, so eyeball the other ${otherVariants} variant(s).`
      : "";
  return (
    "Look for what geometry cannot see: an image or gradient that distorts when " +
    "stretched, a corner radius or border that reads wrong at width, or padding " +
    "that drifts on a frame without auto-layout." +
    others
  );
}

const BOUNDS = ["minWidth", "maxWidth", "minHeight", "maxHeight"] as const;

type BoundKey = (typeof BOUNDS)[number];

function boundsSetOn(root: NodeSnapshot): BoundKey[] {
  return BOUNDS.filter((key) => root[key] !== undefined);
}

/**
 * A measured anomaly as a finding.
 *
 * Verdicts are `high`: geometry settled them, and clipped-away or collapsed
 * content is a defect however it arose. Candidates are `low` and say so in the
 * message, because an intentional avatar stack overlaps and `SPACE_BETWEEN` is
 * correct on a select or a list row - a wrong red there costs more trust than a
 * missed finding, which is the trade every check in this engine makes.
 */
function anomalyFinding(anomaly: Anomaly): Finding {
  const verdict = anomaly.confidence === "verdict";
  return {
    severity: verdict ? "high" : "low",
    nodeId: anomaly.nodeId,
    nodeName: anomaly.nodeName,
    message: verdict
      ? `${anomaly.state}: ${anomaly.detail}`
      : `${anomaly.state}: ${anomaly.detail} Confirm this is intended.`,
    ...(verdict
      ? {
          suggestedFix:
            "Set the size bounds that keep the component inside the range it " +
            "was designed for, or fix the layer's sizing so it survives the range.",
        }
      : {}),
  };
}

/** Every stretch risk in a variant the probe did *not* measure. */
function unmeasuredStretchRisks(
  snapshot: ComponentSetSnapshot,
  probedVariantId: string | undefined,
): ReturnType<typeof stretchRisks> {
  return stretchRisks(snapshot).filter(
    (risk) => risk.variantId !== probedVariantId,
  );
}

/**
 * What the pre-scan found in variants the probe never touched, as a sentence for
 * the remainder rather than as a finding.
 *
 * Not a finding, and not a status change, on purpose. An unmeasured
 * `SPACE_BETWEEN` container is a *suspicion*: it is exactly correct for a select,
 * a dropdown, a list row or a nav item, and turning every one of those amber
 * would make the row noise. What upgrades a suspicion to something worth a chip is
 * the probe measuring the gap, and where the probe did measure it this text is not
 * emitted at all.
 */
function stretchRiskNote(
  risks: ReturnType<typeof stretchRisks>,
): string | undefined {
  if (risks.length === 0) return undefined;
  const named = [...new Set(risks.map((risk) => `"${risk.nodeName}"`))];
  const shown = named.slice(0, 3).join(", ");
  const rest = named.length > 3 ? `, +${named.length - 3} more` : "";
  return (
    `${shown}${rest} spread content apart when stretched ` +
    `(SPACE_BETWEEN on a container that can grow), in variants the probe did ` +
    `not measure. Correct for a select or a list row; a hole in the middle of ` +
    `anything else.`
  );
}

/** The bounds half, unchanged in substance: advisory, `warn` at worst. */
function boundsOutcome(snapshot: ComponentSetSnapshot): {
  status: CheckStatus;
  findings: Finding[];
  note?: string;
} {
  const roots = snapshot.variants
    .map((variant) => variant.tree)
    .filter((root) => root.boundsApplicable === true);

  if (roots.length === 0) {
    return {
      status: "not_applicable",
      findings: [],
      note:
        "Figma cannot hold min/max width or height on this component: no " +
        "variant root is an auto-layout frame or a direct child of one.",
    };
  }

  const unbounded = roots.filter((root) => boundsSetOn(root).length === 0);

  // Which bounds nothing in the set sets - reported either way, so a passing
  // row still says what is unset instead of just going green.
  const neverSet = BOUNDS.filter((key) =>
    roots.every((root) => root[key] === undefined),
  );
  const unsetNote =
    neverSet.length > 0
      ? `Not set anywhere in the set: ${neverSet.join(", ")}.`
      : undefined;

  if (unbounded.length === 0) {
    return {
      status: "pass",
      findings: [],
      ...(unsetNote ? { note: unsetNote } : {}),
    };
  }

  // One finding for the whole set rather than one per variant: variants of a
  // component share their bound configuration, so per-variant findings would
  // repeat a single fact up to 64 times.
  const finding: Finding = {
    severity: "low",
    nodeId: unbounded[0].id,
    nodeName: unbounded[0].name,
    message:
      `No min/max width or height is set on ${unbounded.length} of ` +
      `${roots.length} variant root(s). Bounds are recommended so the ` +
      `component cannot be resized past what it was designed for.`,
    expected: "at least one of minWidth, maxWidth, minHeight, maxHeight",
    actual: "none set",
    suggestedFix:
      "Set the bounds that apply on the component's auto-layout frame, or " +
      "skip this row if the project doesn't use size bounds.",
    count: unbounded.length,
  };

  return {
    status: "warn",
    findings: [finding],
    note:
      "Advisory only: design treats size bounds as a recommendation, and " +
      "skips them on less robust design systems.",
  };
}

/**
 * Everything the resize probe established, or why it established nothing.
 *
 * `measured` is what decides whether the row's remainder still owes the whole
 * resize test. It is deliberately false for `unmoved`: when the probe drove the
 * width and the component did not move, "bounds Figma is enforcing" and "the probe
 * could not drive it" are indistinguishable from in here, and a clean measurement
 * is worthless either way. That is the one outcome where a green chip would be
 * actively misleading, so the row falls back to owing the manual test.
 */
function probeOutcome(probe: ResizeProbeSnapshot | undefined): {
  measured: boolean;
  /**
   * The probe ran, tried to drive the width, and came back unable to say anything.
   * Distinct from `!measured`: a probe that never ran, or declined for a stated
   * reason, leaves the row exactly as the bounds half found it, while this actively
   * contradicts a green chip.
   */
  unmeasurable: boolean;
  findings: Finding[];
  notes: string[];
  hasVerdict: boolean;
  hasCandidate: boolean;
} {
  const notes: string[] = [];
  const nothing = {
    measured: false,
    unmeasurable: false,
    findings: [],
    notes,
    hasVerdict: false,
    hasCandidate: false,
  };
  if (!probe) {
    return nothing;
  }
  if (probe.skipped) {
    notes.push(`Resize behaviour was not measured: ${probe.skipped}`);
    return nothing;
  }
  if (probe.unmoved) {
    notes.push(
      "Resize behaviour could not be measured: driving the width did not move " +
        "the component at all, so either Figma is holding it at a fixed size or " +
        "it cannot be driven from a plugin. Nothing about its resize behaviour " +
        "is established either way.",
    );
    return { ...nothing, unmeasurable: true };
  }

  const anomalies = [
    ...(probe.anomalies ?? []),
    ...(probe.textStress?.anomalies ?? []),
  ];
  const findings = anomalies.map(anomalyFinding);

  const states = probe.states ?? [];
  notes.push(
    `Measured on "${probe.variantName}" at ${
      states.length > 0 ? states.join(" and ") : "its default width"
    }.`,
  );
  if (probe.textStress?.skipped) {
    notes.push(`Long text was not tested: ${probe.textStress.skipped}`);
  }

  return {
    measured: true,
    unmeasurable: false,
    findings,
    notes,
    hasVerdict: anomalies.some((a) => a.confidence === "verdict"),
    hasCandidate: anomalies.some((a) => a.confidence === "candidate"),
  };
}

export function checkResponsiveBounds(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const bounds = boundsOutcome(snapshot);
  const probe = probeOutcome(snapshot.resizeProbe);

  // Escalation only ever runs one way. The bounds half cannot lift a `fail` the
  // resize half reached, and the resize half cannot lower a `warn` the bounds
  // half reached.
  let status = bounds.status;
  if (probe.hasVerdict) {
    status = "fail";
  } else if (probe.hasCandidate && status !== "fail") {
    status = "warn";
  } else if (probe.unmeasurable && status === "pass") {
    // The probe drove the width and the component did not move, so nothing about its
    // resize behaviour is established - and a green chip on a row titled
    // "Responsiveness" would read as though it were. The bounds half genuinely
    // passed, which is why this is `warn` and not `fail`, and the note says which
    // half spoke.
    //
    // Only from `pass`. A `warn` or `fail` the bounds half reached already asks for
    // attention, and `not_applicable` means neither half evaluated anything, which
    // its own chip states more honestly than an amber would.
    status = "warn";
  } else if (status === "not_applicable" && probe.measured) {
    // The bounds half had nothing to say, but the resize half measured this
    // component and found it clean. That is a real verdict, and leaving the row
    // `not_applicable` would throw it away.
    status = "pass";
  }

  const otherVariants = snapshot.variants.filter(
    (variant) => variant.id !== snapshot.resizeProbe?.variantId,
  ).length;
  const risks = unmeasuredStretchRisks(
    snapshot,
    snapshot.resizeProbe?.variantId,
  );
  const riskNote = stretchRiskNote(risks);

  const notes = [
    ...(bounds.note ? [bounds.note] : []),
    ...probe.notes,
    ...(riskNote ? [riskNote] : []),
  ];

  const remainder = probe.measured
    ? measuredRemainder(snapshot.resizeProbe?.variantName ?? "", otherVariants)
    : RESIZE_REMAINDER;

  return {
    checkId: "responsive-bounds",
    title: TITLE,
    status,
    findings: [...probe.findings, ...bounds.findings],
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
    manualRemainder: remainder,
  };
}
