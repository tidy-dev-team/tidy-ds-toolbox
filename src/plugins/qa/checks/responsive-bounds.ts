/**
 * #7 - responsiveness, size-bounds half only.
 *
 * Design's ask is narrow and explicitly advisory: look at min/max width and
 * height, and if there are none, *recommend* having them - the requested
 * output is literally "note, there aren't any".
 * It is also routinely skipped ("in projects where the design systems are less
 * robust, like here, we don't always go into it").
 * See docs/qa-source-interview.md#7-responsiveness--min-max.
 *
 * So this never fails; the worst status is `warn` at `low` severity.
 * The other half of item 7 - actually resizing a variant and judging whether it
 * breaks - needs a definition of "breaks" and is deliberately not attempted
 * here, which is why every result carries a `manualRemainder` so the row keeps
 * its remainder line: a green chip here must not stand for the resize test.
 *
 * **Absence of *all four* bounds is the reported case, not incompleteness.**
 * Requiring every bound on every component would put four findings on nearly
 * every set, which is how a row stops being read.
 * A component that sets some bounds has clearly been considered, so it passes -
 * with the unset ones named in `note`, keeping the row descriptive without
 * making it amber.
 *
 * Only **variant roots** are examined, since the item is about the component's
 * own resize behaviour.
 * Whether a root can hold bounds at all comes from the collector's
 * `boundsApplicable`, not from the root's own `layoutMode`: Figma allows bounds
 * on auto-layout frames *and their direct children*, so a `layoutMode: "NONE"`
 * variant inside an auto-layout component set is still a legitimate place for
 * them and must not be silently skipped.
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";

const TITLE = "Responsiveness (size bounds)";

/**
 * Unconditional, unlike #19's: resize behaviour is owed on every outcome,
 * including `not_applicable`. That a set cannot hold bounds says nothing about
 * whether it survives being resized.
 */
const RESIZE_REMAINDER =
  "Resize the component and confirm nothing breaks. Only min/max bounds are " +
  "checked automatically.";

const BOUNDS = ["minWidth", "maxWidth", "minHeight", "maxHeight"] as const;

type BoundKey = (typeof BOUNDS)[number];

function boundsSetOn(root: NodeSnapshot): BoundKey[] {
  return BOUNDS.filter((key) => root[key] !== undefined);
}

export function checkResponsiveBounds(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const roots = snapshot.variants
    .map((variant) => variant.tree)
    .filter((root) => root.boundsApplicable === true);

  if (roots.length === 0) {
    return {
      checkId: "responsive-bounds",
      title: TITLE,
      status: "not_applicable",
      findings: [],
      note:
        "Figma cannot hold min/max width or height on this component: no " +
        "variant root is an auto-layout frame or a direct child of one.",
      manualRemainder: RESIZE_REMAINDER,
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
      checkId: "responsive-bounds",
      title: TITLE,
      status: "pass",
      findings: [],
      ...(unsetNote ? { note: unsetNote } : {}),
      manualRemainder: RESIZE_REMAINDER,
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
    checkId: "responsive-bounds",
    title: TITLE,
    status: "warn",
    findings: [finding],
    note:
      "Advisory only: design treats size bounds as a recommendation, and " +
      "skips them on less robust design systems.",
    manualRemainder: RESIZE_REMAINDER,
  };
}
