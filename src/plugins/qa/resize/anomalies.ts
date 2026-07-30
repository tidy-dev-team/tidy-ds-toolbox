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
 * **One of #111's measurements is deliberately not attempted, and the row says so
 * rather than implying full coverage.**
 *
 * *Padding drift* is not measured separately. Under auto-layout padding is a
 * declared number Figma does not recompute, so a drifting inset in practice shows up
 * as the gap or overflow rules firing; a padding rule of its own would mostly restate
 * them, and on a non-auto-layout frame with absolutely-positioned children it would
 * fire on layout that is working as built.
 *
 * `measuredRemainder` in the check asks a human for it.
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
  /** Glyphs have left their box and a clipping ancestor hides them. */
  | "text-clipped"
  /** Glyphs have left their box with nothing clipping them, so they spill over. */
  | "text-overflows"
  /** A shadow, stroke or glow is cropped by a clipping ancestor. */
  | "effect-clipped"
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
  /**
   * Nearest ancestor that clips its content, if any - the thing that decides
   * whether ink leaving a box is *cut off* or merely untidy.
   *
   * Threaded down the walk rather than looked up, because "is this ink actually
   * hidden" is a question about the whole ancestor chain: the clipper is often a
   * card two levels above the text, not its own parent.
   */
  clipper: MeasuredNode | undefined,
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

  // The immediate parent does not clip, but a higher ancestor does. A node
  // escaping a clipping grandparent through a non-clipping parent has its
  // content cut off just the same, so it needs its own overflow finding.
  if (
    parent?.clipsContent !== true &&
    clipper !== undefined &&
    !contains(clipper.box, node.box)
  ) {
    out.push({
      kind: "overflow",
      confidence: "verdict",
      nodeId: node.id,
      nodeName: node.name,
      detail:
        `"${node.name}" extends outside "${clipper.name}", which clips its ` +
        `content, so part of it is not drawn: ` +
        `${px(node.box.width)}×${px(node.box.height)} at ` +
        `(${px(node.box.x - clipper.box.x)}, ${px(node.box.y - clipper.box.y)}) ` +
        `inside ${px(clipper.box.width)}×${px(clipper.box.height)}.`,
      ...stamp,
    });
  }

  const was = baseline.get(node.id);

  // Ink that has left its own box. Three guards, and the rule is wrong without any
  // one of them.
  //
  // **Drift, not absolute.** Anything with a drop shadow or an outside stroke draws
  // ink outside its bounding box permanently, so what establishes a defect is the
  // resize making the overhang *worse* - never that ink and box merely disagree.
  //
  // **Cut off only when something actually clips it.** Ink leaving its own box is not
  // by itself proof of clipping: with no clipping ancestor the text simply spills
  // over whatever is next to it, which looks wrong but is visible, and calling that
  // "cut off" at `high` would be a confident claim about something that did not
  // happen. So the verdict needs the ink to escape the nearest *clipping* ancestor;
  // without one it is a candidate, worded for what was really measured.
  //
  // **Text and effects are different findings.** Glyphs disappearing is a content
  // defect; a shadow or border cropped at an edge is cosmetic and sometimes
  // deliberate, so it is only ever a candidate.
  //
  // The remaining limit, stated on the row rather than hidden: ink Figma has
  // *already* cropped is reported at its cropped size, so text whose glyphs are cut
  // while its box still fits its clipper is invisible to this.
  const overhang = inkOverhang(node);
  const before = was ? inkOverhang(was) : 0;
  if (overhang - before > TOLERANCE_PX && node.renderBox) {
    const hidden =
      clipper !== undefined && !contains(clipper.box, node.renderBox);
    const isText = node.type === "TEXT";
    const grew = `overhanging its ${px(node.box.width)}×${px(node.box.height)} box by ${px(overhang)}, where it overhung by ${px(before)} at the baseline`;
    if (hidden && isText) {
      out.push({
        kind: "text-clipped",
        confidence: "verdict",
        nodeId: node.id,
        nodeName: node.name,
        detail:
          `"${node.name}" draws text ${grew}, and "${clipper.name}" clips it, so ` +
          `part of the text is not drawn.`,
        ...stamp,
      });
    } else if (hidden) {
      out.push({
        kind: "effect-clipped",
        confidence: "candidate",
        nodeId: node.id,
        nodeName: node.name,
        detail:
          `"${node.name}" draws a shadow, stroke or glow ${grew}, and ` +
          `"${clipper.name}" clips it, so part of it is cropped.`,
        ...stamp,
      });
    } else if (isText) {
      out.push({
        kind: "text-overflows",
        confidence: "candidate",
        nodeId: node.id,
        nodeName: node.name,
        detail:
          `"${node.name}" draws text ${grew}. Nothing clips it, so the text ` +
          `stays visible but spills over whatever sits beside it.`,
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

  // A node that clips becomes the clipper for everything beneath it; otherwise the
  // nearest one above stays in force.
  const inner = node.clipsContent === true ? node : clipper;
  for (const child of visibleChildren(node)) {
    absoluteAnomalies(child, node, inner, at, baseline, out);
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
    // A gap only means anything when it *is* a gap. Two siblings stacked at the
    // same x give `gap = -width`, so narrowing shrinks the width and the gap
    // "grows" from -280px to -204px - an artifact of the node getting narrower,
    // with no space opening up anywhere. Found on a real dropdown, where it
    // produced every finding row 7 reported and all of them were noise.
    //
    // Overlapping siblings are the overlap rule's business, and it stays quiet
    // when they already overlapped at the baseline, which is the correct answer:
    // the resize did not do that.
    if (wasGap < -TOLERANCE_PX || gap < -TOLERANCE_PX) continue;
    out.push({
      kind: "gap-grew",
      confidence: "candidate",
      // The parent owns its children's spacing, so the parent is what a designer
      // opens to change it.
      nodeId: node.id,
      nodeName: node.name,
      // The measurement only. What a grown gap *means* is the same sentence on
      // every one of these findings, so it is said once in the check's note
      // instead of repeated per finding - on a set that produced eight of them,
      // the repeated clause was most of the payload.
      detail:
        `the gap between "${prev.name}" and "${next.name}" went from ` +
        `${px(wasGap)} to ${px(gap)}.`,
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

  // The root's own `clipsContent` is picked up inside the walk, so the chain starts
  // empty rather than assuming the component clips.
  absoluteAnomalies(resized.root, undefined, undefined, resized, was, out);
  driftAnomalies(resized.root, resized, was, out);

  // Height is asked of the root alone: a child's height following its content is
  // auto-layout working, while the *component* growing taller when only its
  // width was driven is the thing worth naming. Growth on narrowing is a label
  // wrapping (near-universal; would bury the signal), and shrinkage on widening
  // is the same label unwrapping (correct). So only growth on widening is
  // reported.
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
