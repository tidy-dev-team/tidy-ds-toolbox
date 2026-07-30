/**
 * What the resize probe *observes* - the plain-JSON boundary between the
 * figma-touching probe and the pure judgement made from it (#111, issue #7's
 * unshipped half).
 *
 * The same two-layer split the collector already uses: `resize-probe.ts` mutates
 * a scratch clone and records boxes, and everything that decides whether a box
 * arrangement is *wrong* is a pure function over these types, with fixtures.
 * Geometry detects; nothing here looks at a pixel.
 *
 * Coordinates are absolute canvas coordinates, straight from
 * `absoluteBoundingBox` / `absoluteRenderBounds`. Absolute rather than
 * parent-relative on purpose: every question the anomaly detector asks is about
 * one box against another (containment, intersection, the gap between two
 * siblings), and absolute boxes make each of those plain arithmetic with no
 * accumulated offset to get wrong.
 */

/** One node's measured rectangle. Matches Figma's `Rect`. */
export interface MeasuredBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One measured node, mirroring the *snapshot* tree rather than the clone's own
 * children.
 *
 * Mirroring the snapshot is what makes the measurement addressable. The probe
 * measures a throwaway clone whose node ids stop existing the moment it is torn
 * down, so a finding that named them could not be jumped to. Walking the clone
 * and the snapshot tree in lockstep instead means every measured node carries the
 * *source* id - the layer inside the real component - which is what a designer
 * opens.
 *
 * It also settles how deep to measure, for free and consistently: the snapshot
 * deliberately stops at nested instances (their interiors belong to another
 * component, per #8), so the probe stops there too. A nested instance's own box
 * is still measured, because overflow and overlap are questions about that box.
 */
export interface MeasuredNode {
  /** Id of the corresponding layer in the *real* component, not in the clone. */
  id: string;
  name: string;
  /** Figma node type, carried so text-specific rules can find text nodes. */
  type: string;
  /** Whether the node was visible when measured; hidden nodes are not judged. */
  visible: boolean;
  box: MeasuredBox;
  /**
   * Real ink bounds - glyphs, strokes and shadows - when Figma reports them.
   *
   * This is the only way to see clipping. `box` is the layout rectangle, which
   * stays put when the text inside it is cut off; `absoluteRenderBounds` is what
   * actually got drawn, so text that no longer fits shows up as render bounds
   * that have shrunk relative to the layout box rather than as any change in the
   * box itself.
   *
   * Absent when Figma reports `null`, which it does for a node that renders
   * nothing at all.
   */
  renderBox?: MeasuredBox;
  /**
   * Whether the node clips its children. Load-bearing for the overflow rule:
   * content spilling out of a clipping frame is *invisible*, which is the defect;
   * spilling out of a non-clipping frame is merely untidy and often deliberate
   * (a badge hanging off a corner, an avatar overlapping its container).
   */
  clipsContent?: boolean;
  children: MeasuredNode[];
}

/**
 * One measurement of the whole subtree, at one width.
 *
 * `width` is the width the probe asked for, not the width the root ended up at:
 * the difference between the two is itself a finding, since a component that
 * declines to grow past its declared `maxWidth` is the bound working, and one
 * that grows anyway is the bound being ignored.
 */
export interface Measurement {
  /** What the probe drove the width to. */
  requestedWidth: number;
  /** Human label for the state, e.g. "widened to 400px" - used on evidence. */
  label: string;
  root: MeasuredNode;
}
