/**
 * What the resize probe is going to do, decided before it touches anything (#111).
 *
 * Pure and separate from the probe for the usual reason in this module: the probe
 * is the figma-touching half and cannot be fixture-tested, while *which* widths to
 * drive and *how* to drive them is a judgement with real content - it settles the
 * issue's open "which widths?" question - and belongs somewhere a test can read it.
 */

import type { NodeSnapshot } from "../snapshot";

/**
 * How the width has to be driven, which follows entirely from the root's own
 * horizontal sizing.
 *
 * - `FILL` - the instance must be nested in a temporary auto-layout parent and the
 *   **parent** widened. `FILL` is meaningless outside auto-layout, so resizing the
 *   instance directly does nothing at all and would produce a confident pass on an
 *   unmeasured component.
 * - `FIXED` - resize the instance directly.
 */
export type DrivePath = "parent" | "direct";

/** One width to drive to, and why. */
export interface ResizeTarget {
  width: number;
  /** Human label, used on the row and on canvas evidence. */
  label: string;
}

export interface ResizePlan {
  path: DrivePath;
  baselineWidth: number;
  /**
   * The widths to measure at, in order. Deliberately short: each one is a full
   * measure pass over the whole subtree, and the issue's own guidance is that
   * fewer is better.
   */
  targets: ResizeTarget[];
}

/**
 * Both directions are driven, not just the widening the issue's canonical defect
 * needs.
 *
 * Widening is where `SPACE_BETWEEN` blows a hole in the middle; **narrowing** is
 * where text clips and content overflows, and that is the half a designer is most
 * likely to hit in a real layout. Two passes covers both, and clipping is the
 * commonest resize defect there is, so leaving it out to save one measurement would
 * have been a poor trade.
 */
const NARROW_FACTOR = 0.4;
const WIDE_FACTOR = 2.5;

/**
 * How far past a declared bound to drive, so the drive unambiguously *tries* to
 * violate it. Without overshooting, a component that stops exactly at its
 * `maxWidth` is indistinguishable from one that was never pushed that far.
 */
const BOUND_OVERSHOOT_PX = 200;

/**
 * Absolute ceiling on a driven width. A component with a 4000px default would
 * otherwise be driven to 10000px, where Figma's own layout starts producing
 * numbers nobody wants to reason about, for no extra evidence.
 */
const MAX_DRIVEN_PX = 4000;

/**
 * The long string the text-stress pass injects (#112's text half).
 *
 * Long enough to overflow any realistic label and to force wrapping in any
 * realistic container, and real prose rather than a repeated character so that
 * wrapping behaves the way it would with real content.
 *
 * Lives here, in the pure layer, rather than in the probe that injects it, because
 * the *evidence* block has to draw the very same string: if the drawn text were
 * shorter than the measured text it might not clip, and the picture would then
 * quietly contradict the finding it exists to prove.
 */
export const STRESS_TEXT =
  "This label is deliberately far longer than anything a designer would " +
  "reasonably put here, so that clipping and overflow have a chance to show " +
  "themselves before a user finds them.";

/** Below this a component has no meaningful width to scale from. */
const MIN_MEANINGFUL_PX = 1;

function clamp(width: number): number {
  return Math.max(
    MIN_MEANINGFUL_PX,
    Math.min(MAX_DRIVEN_PX, Math.round(width)),
  );
}

/**
 * Plan the probe for one variant root, or explain why there is nothing to probe.
 *
 * `HUG` is the interesting refusal: a hugging component is exactly as wide as its
 * content, so there is no such thing as resizing it - Figma simply recomputes it
 * back to the same width. Reporting that as a skip with the reason is honest;
 * driving it anyway and reporting a clean pass would be a green chip standing for a
 * test that could not run.
 */
export function planResizeProbe(
  root: NodeSnapshot,
): { plan: ResizePlan } | { skipped: string } {
  if (root.layoutSizingHorizontal === "HUG") {
    return {
      skipped:
        "the component hugs its content horizontally, so it has no resize " +
        "behaviour to test: Figma recomputes it back to the width of its " +
        "contents.",
    };
  }
  if (root.layoutSizingHorizontal === undefined) {
    return {
      skipped:
        "the component is not in an auto-layout context, so Figma reports no " +
        "horizontal sizing behaviour to drive.",
    };
  }
  if (!(root.width >= MIN_MEANINGFUL_PX)) {
    return {
      skipped: `the component measures ${root.width}px wide, so there is no width to scale from.`,
    };
  }

  const baselineWidth = root.width;
  const path: DrivePath =
    root.layoutSizingHorizontal === "FILL" ? "parent" : "direct";

  // Narrow enough to be past any declared minWidth, so the same pass that hunts
  // for clipping also establishes whether the bound holds.
  let narrow = baselineWidth * NARROW_FACTOR;
  if (root.minWidth !== undefined) {
    narrow = Math.min(narrow, root.minWidth - BOUND_OVERSHOOT_PX);
  }

  let wide = baselineWidth * WIDE_FACTOR;
  if (root.maxWidth !== undefined) {
    wide = Math.max(wide, root.maxWidth + BOUND_OVERSHOOT_PX);
  }

  const targets: ResizeTarget[] = [];
  const narrowWidth = clamp(narrow);
  // Only when it is actually narrower: a component whose default already sits at
  // 1px has nothing to narrow to, and driving to the same width measures nothing.
  if (narrowWidth < baselineWidth) {
    targets.push({ width: narrowWidth, label: `narrowed to ${narrowWidth}px` });
  }
  const wideWidth = clamp(wide);
  if (wideWidth > baselineWidth) {
    targets.push({ width: wideWidth, label: `widened to ${wideWidth}px` });
  }

  if (targets.length === 0) {
    return {
      skipped:
        `the component is ${baselineWidth}px wide, which leaves no room to ` +
        `drive it either narrower or wider within the probe's ${MAX_DRIVEN_PX}px limit.`,
    };
  }

  return { plan: { path, baselineWidth, targets } };
}
