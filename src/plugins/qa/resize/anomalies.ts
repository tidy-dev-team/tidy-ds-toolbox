/**
 * The judgement half of #7's resize probe: measured boxes in, stated anomalies
 * out (#111). Pure, so every rule below is fixture-tested without Figma.
 *
 * **What "breaks" means here.** The originating idea was that spacing should
 * scale proportionally with the component. That is the wrong expectation and was
 * clarified as such: in auto-layout spacing deliberately does *not* scale, so
 * widening a FILL button from 120px to 400px correctly leaves padding at 16, the
 * gap at 8 and the height unchanged, and only re-positions the content block. A
 * rule that flagged "spacing did not scale" would fail every correctly built
 * component in the file.
 *
 * The intended meaning is **nothing drifted**: spacing behaved as designed,
 * geometry stayed sane, nothing collapsed, overflowed, clipped or blew apart.
 *
 * **Verdicts versus candidates.** This distinction runs through the whole design
 * and is the reason the check can be trusted. Content clipped away or collapsed
 * to nothing is wrong however it got there, so geometry alone settles it. An
 * overlap or a gap that grew is *suspicious and frequently correct* - an
 * intentional avatar stack overlaps, and `SPACE_BETWEEN` with `FILL` is exactly
 * right for a select, a dropdown, a list row or a nav item. Ruling on those needs
 * design intent, which this module does not have, so it states the measurement and
 * leaves the ruling to the human on the row.
 *
 * The payoff of measuring at all is in that second group: it turns "this property
 * combination is suspicious" into "the icon-to-label gap went from 8px to 288px",
 * which can go on a row without hedging.
 *
 * **Two of #111's measurements are deliberately not attempted, and the row says so
 * rather than implying full coverage.**
 *
 * *Padding drift* is not measured separately. Under auto-layout padding is a
 * declared number Figma does not recompute, so a drifting inset in practice shows up
 * as the gap or overflow rules firing; a padding rule of its own would mostly restate
 * them, and on a non-auto-layout frame with absolutely-positioned children it would
 * fire on layout that is working as built.
 *
 * *Shadow and stroke clipping* is not measured either, and that one is a real gap
 * rather than a redundancy. It would need ink-versus-box on every node, which is
 * exactly the comparison that cannot distinguish a clipped shadow from a perfectly
 * healthy one - see the `text-clipped` rule below, where restricting to TEXT and
 * gating on drift is what stops it reporting every shadowed frame in the file.
 * `measuredRemainder` in the check asks a human for both.
 */

import type { MeasuredBox, MeasuredNode, Measurement } from "./measured";

/**
 * Sub-pixel slack. Figma reports fractional geometry from rounding, text metrics
 * and stroke alignment, and without slack every rule here would fire on a
 * component that did not move at all.
 */
const TOLERANCE_PX = 0.5;

/**
 * Gaps get more slack than boxes. A gap is a *difference* of two measured edges,
 * so it carries both their rounding errors, and the defect this rule exists for
 * grows gaps by hundreds of pixels rather than by one.
 */
const GAP_TOLERANCE_PX = 1;

/** Below this a node has effectively disappeared. */
const COLLAPSED_PX = 0.5;

export type AnomalyKind =
  /** Content escaped a frame that clips, so it is invisible. */
  | "overflow"
  /** A node's ink no longer fits the box it is drawn in. */
  | "text-clipped"
  /** A node that had size lost it. */
  | "collapse"
  /** The component grew past a size bound it declares. */
  | "bound-ignored"
  /** Siblings that did not overlap now do. */
  | "overlap"
  /** The space between two siblings grew. */
  | "gap-grew"
  /** The root's height moved while only its width was driven. */
  | "height-changed";

/**
 * Whether geometry alone settles the question.
 *
 * `verdict` anomalies fail the row: they are defects however they arose.
 * `candidate` anomalies are stated facts a human rules on, and deliberately do
 * *not* fail the row - a wrong red on a correctly built dropdown costs more trust
 * than a missed finding, which is the same trade every check in this engine makes.
 */
export type AnomalyConfidence = "verdict" | "candidate";

export interface Anomaly {
  kind: AnomalyKind;
  confidence: AnomalyConfidence;
  /** The layer in the *real* component, so the finding can be jumped to. */
  nodeId: string;
  nodeName: string;
  /** The measurement, in words and numbers, ready to put on a row. */
  detail: string;
  /** Width the probe had driven the component to when this was observed. */
  measuredAtWidth: number;
  /** The measured state's label, e.g. "widened to 400px" - used on evidence. */
  state: string;
}

function right(box: MeasuredBox): number {
  return box.x + box.width;
}

function bottom(box: MeasuredBox): number {
  return box.y + box.height;
}

/** Whether `inner` sits inside `outer`, allowing sub-pixel slack. */
function contains(outer: MeasuredBox, inner: MeasuredBox): boolean {
  return (
    inner.x >= outer.x - TOLERANCE_PX &&
    inner.y >= outer.y - TOLERANCE_PX &&
    right(inner) <= right(outer) + TOLERANCE_PX &&
    bottom(inner) <= bottom(outer) + TOLERANCE_PX
  );
}

/** Whether two boxes share any area. Touching edges do not count. */
function intersects(a: MeasuredBox, b: MeasuredBox): boolean {
  return (
    a.x < right(b) - TOLERANCE_PX &&
    b.x < right(a) - TOLERANCE_PX &&
    a.y < bottom(b) - TOLERANCE_PX &&
    b.y < bottom(a) - TOLERANCE_PX
  );
}

/**
 * How far a node's ink escapes its own layout box, on its worst edge. Zero when the
 * ink fits, or when Figma reports no render bounds at all.
 */
function inkOverhang(node: MeasuredNode): number {
  const ink = node.renderBox;
  if (!ink) return 0;
  return Math.max(
    0,
    node.box.x - ink.x,
    node.box.y - ink.y,
    right(ink) - right(node.box),
    bottom(ink) - bottom(node.box),
  );
}

function px(value: number): string {
  // Whole pixels where the number is whole, one decimal otherwise: findings read
  // as "8px to 288px", not "8.0px to 288.0px".
  return `${Math.round(value * 10) / 10}px`;
}

/** Every node in the tree, keyed by its source id. */
function index(root: MeasuredNode): Map<string, MeasuredNode> {
  const byId = new Map<string, MeasuredNode>();
  const visit = (node: MeasuredNode) => {
    byId.set(node.id, node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return byId;
}

/**
 * Nodes are paired between the two measurements **by source id, not by position**.
 *
 * Position would be the obvious choice given both trees mirror the same snapshot,
 * but it breaks precisely where it matters: a resize that hides a layer, or a
 * measurement taken while a boolean property is flipped, changes what is present
 * without changing what anything *is*. Pairing by id degrades to "not compared"
 * for a node that appears in only one state, which is the safe direction.
 */
function visibleChildren(node: MeasuredNode): MeasuredNode[] {
  // A hidden node keeps whatever box it last had, so judging one puts findings on
  // a state nobody can see.
  return node.children.filter((child) => child.visible);
}

/**
 * Anomalies visible in the resized state on its own - the ones where the baseline
 * cannot change the answer, because clipped-away and collapsed content is wrong
 * regardless of what it looked like before.
 */
function absoluteAnomalies(
  node: MeasuredNode,
  parent: MeasuredNode | undefined,
  at: Measurement,
  baseline: Map<string, MeasuredNode>,
  out: Anomaly[],
): void {
  const stamp = { measuredAtWidth: at.requestedWidth, state: at.label };

  // Overflow, but only out of a frame that *clips*. Spilling out of a
  // non-clipping frame is routine and often deliberate - a badge hanging off a
  // corner, an avatar overlapping its container - so treating it as a defect
  // would put a finding on a large share of healthy components.
  if (parent?.clipsContent === true && !contains(parent.box, node.box)) {
    out.push({
      kind: "overflow",
      confidence: "verdict",
      nodeId: node.id,
      nodeName: node.name,
      detail:
        `"${node.name}" extends outside "${parent.name}", which clips its ` +
        `content, so part of it is not drawn: ` +
        `${px(node.box.width)}×${px(node.box.height)} at ` +
        `(${px(node.box.x - parent.box.x)}, ${px(node.box.y - parent.box.y)}) ` +
        `inside ${px(parent.box.width)}×${px(parent.box.height)}.`,
      ...stamp,
    });
  }

  const was = baseline.get(node.id);

  // Clipping is only visible by comparing ink to layout box: the box stays put when
  // the text inside it is cut off, and `renderBox` is what shrinks or spills.
  //
  // **Two guards, and the check is wrong without either.**
  //
  // TEXT only. `absoluteRenderBounds` is *larger* than the bounding box for any node
  // with a drop shadow or an outside stroke, so a bare ink-versus-box comparison
  // reads every shadowed frame in the file as clipped and reds this row at every
  // measured width. Only glyphs can be cut off, so only glyphs are asked about.
  //
  // And drift, not absolute. Text can carry an effect too, so what establishes a
  // defect is that the resize made the overhang *worse* - not that ink and box
  // disagree, which they may always have done.
  //
  // The limit of this: ink Figma has already clipped away is reported at its clipped
  // size, so a text box that fits its parent while its glyphs are cut is invisible
  // here. `measuredRemainder` in the check asks a human for that, along with the
  // shadow-or-border-cut-off case this deliberately does not attempt.
  if (node.type === "TEXT") {
    const overhang = inkOverhang(node);
    const before = was ? inkOverhang(was) : 0;
    if (overhang - before > TOLERANCE_PX) {
      out.push({
        kind: "text-clipped",
        confidence: "verdict",
        nodeId: node.id,
        nodeName: node.name,
        detail:
          `"${node.name}" draws ${px(node.renderBox?.width ?? 0)} of ink in a ` +
          `${px(node.box.width)} box, overhanging it by ${px(overhang)} where it ` +
          `overhung by ${px(before)} at the baseline, so it is cut off.`,
        ...stamp,
      });
    }
  }

  const collapsed =
    node.box.width < COLLAPSED_PX || node.box.height < COLLAPSED_PX;
  // Only a node that *had* size and lost it. One that was already zero-sized was
  // not broken by the resize, and this row is not the place to report it.
  const hadSize =
    was !== undefined &&
    was.box.width >= COLLAPSED_PX &&
    was.box.height >= COLLAPSED_PX;
  if (collapsed && hadSize) {
    out.push({
      kind: "collapse",
      confidence: "verdict",
      nodeId: node.id,
      nodeName: node.name,
      detail:
        `"${node.name}" collapsed from ${px(was.box.width)}×` +
        `${px(was.box.height)} to ${px(node.box.width)}×` +
        `${px(node.box.height)}.`,
      ...stamp,
    });
  }

  for (const child of visibleChildren(node)) {
    absoluteAnomalies(child, node, at, baseline, out);
  }
}

/**
 * Anomalies that are only meaningful as a *change*: an overlap or a gap that was
 * already there is how the component was built, not something the resize did.
 */
function driftAnomalies(
  node: MeasuredNode,
  at: Measurement,
  baseline: Map<string, MeasuredNode>,
  out: Anomaly[],
): void {
  const stamp = { measuredAtWidth: at.requestedWidth, state: at.label };
  const siblings = visibleChildren(node);

  for (let i = 0; i < siblings.length; i += 1) {
    for (let j = i + 1; j < siblings.length; j += 1) {
      const a = siblings[i];
      const b = siblings[j];
      const wasA = baseline.get(a.id);
      const wasB = baseline.get(b.id);
      // Both have to have been measured before for "newly" to mean anything.
      if (!wasA || !wasB) continue;
      if (!intersects(a.box, b.box)) continue;
      if (intersects(wasA.box, wasB.box)) continue;
      out.push({
        kind: "overlap",
        confidence: "candidate",
        nodeId: a.id,
        nodeName: a.name,
        detail:
          `"${a.name}" and "${b.name}" did not overlap at ` +
          `${px(wasA.box.width)} wide and now do.`,
        ...stamp,
      });
    }
  }

  // Only the horizontal axis. The probe drives width, so a vertical gap moving is
  // a consequence rather than the thing being tested, and reporting both axes
  // would double every finding on a vertical component.
  const ordered = [...siblings].sort((a, b) => a.box.x - b.box.x);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const next = ordered[i];
    const wasPrev = baseline.get(prev.id);
    const wasNext = baseline.get(next.id);
    if (!wasPrev || !wasNext) continue;
    const gap = next.box.x - right(prev.box);
    const wasGap = wasNext.box.x - right(wasPrev.box);
    if (gap - wasGap <= GAP_TOLERANCE_PX) continue;
    out.push({
      kind: "gap-grew",
      confidence: "candidate",
      // The parent owns its children's spacing, so the parent is what a designer
      // opens to change it.
      nodeId: node.id,
      nodeName: node.name,
      detail:
        `the gap between "${prev.name}" and "${next.name}" went from ` +
        `${px(wasGap)} to ${px(gap)}. Correct for a component that spreads its ` +
        `content (a select, a list row, a nav item); a hole in the middle of ` +
        `anything else.`,
      ...stamp,
    });
  }

  for (const child of siblings) driftAnomalies(child, at, baseline, out);
}

/**
 * Compare one resized state against the baseline and state what drifted.
 *
 * Verdicts are ordered before candidates so a caller that truncates keeps the
 * findings that actually settle something.
 */
export function detectAnomalies(
  baseline: Measurement,
  resized: Measurement,
): Anomaly[] {
  const was = index(baseline.root);
  const out: Anomaly[] = [];

  absoluteAnomalies(resized.root, undefined, resized, was, out);
  driftAnomalies(resized.root, resized, was, out);

  // Height is asked of the root alone: a child's height following its content is
  // auto-layout working, while the *component* changing height when only its
  // width was driven is the thing worth naming.
  //
  // Growth on *widening* only, which excludes two cases for two different reasons.
  // A component getting shorter as it widens is a wrapping label unwrapping, which is
  // correct. And a component getting taller as it *narrows* is the same label wrapping
  // the other way, which is equally correct and happens on nearly every component with
  // text in it - so reporting the narrowing pass here would bury the widening signal
  // this rule exists for.
  const wasRoot = was.get(resized.root.id);
  if (
    wasRoot &&
    resized.root.box.height - wasRoot.box.height > TOLERANCE_PX &&
    resized.requestedWidth > baseline.requestedWidth
  ) {
    out.push({
      kind: "height-changed",
      confidence: "candidate",
      nodeId: resized.root.id,
      nodeName: resized.root.name,
      detail:
        `height went from ${px(wasRoot.box.height)} to ` +
        `${px(resized.root.box.height)} while only the width was driven.`,
      measuredAtWidth: resized.requestedWidth,
      state: resized.label,
    });
  }

  return [
    ...out.filter((a) => a.confidence === "verdict"),
    ...out.filter((a) => a.confidence === "candidate"),
  ];
}

/** The size bounds the component declares, as the snapshot records them. */
export interface DeclaredBounds {
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Whether the component honoured a bound it declares - the free bonus this
 * harness makes possible (#111).
 *
 * `responsive-bounds` can only see that a `maxWidth` *exists*; driving the width
 * past it and measuring is what establishes that it works. Nothing else in the
 * engine verifies a declared bound, and a bound that does not hold is worse than
 * an absent one, because the file claims a guarantee it does not keep.
 *
 * A verdict, not a candidate: the component itself declared the number, so there
 * is no design intent left to consult.
 */
export function detectBoundAnomalies(
  resized: Measurement,
  bounds: DeclaredBounds,
): Anomaly[] {
  const out: Anomaly[] = [];
  const width = resized.root.box.width;
  const stamp = {
    confidence: "verdict" as const,
    nodeId: resized.root.id,
    nodeName: resized.root.name,
    measuredAtWidth: resized.requestedWidth,
    state: resized.label,
  };

  // Only when the probe actually drove the width past the bound: a component
  // sitting comfortably inside its maximum says nothing either way.
  if (
    bounds.maxWidth !== undefined &&
    resized.requestedWidth > bounds.maxWidth + TOLERANCE_PX &&
    width > bounds.maxWidth + TOLERANCE_PX
  ) {
    out.push({
      kind: "bound-ignored",
      detail:
        `declares maxWidth ${px(bounds.maxWidth)} but grew to ${px(width)} ` +
        `when driven to ${px(resized.requestedWidth)}.`,
      ...stamp,
    });
  }
  if (
    bounds.minWidth !== undefined &&
    resized.requestedWidth < bounds.minWidth - TOLERANCE_PX &&
    width < bounds.minWidth - TOLERANCE_PX
  ) {
    out.push({
      kind: "bound-ignored",
      detail:
        `declares minWidth ${px(bounds.minWidth)} but shrank to ${px(width)} ` +
        `when driven to ${px(resized.requestedWidth)}.`,
      ...stamp,
    });
  }
  return out;
}
