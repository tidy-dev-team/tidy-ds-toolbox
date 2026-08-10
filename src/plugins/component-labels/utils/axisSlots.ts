/**
 * Slots along one axis of a variant grid.
 *
 * A label belongs to a *band* of the grid - a column, or a row - not to a
 * single variant. The old code found the band by taking the topmost (or
 * leftmost) variant and keeping everything that overlapped it, which reads
 * one row and one column and assumes the rest of the grid repeats them.
 * That holds only for a full rectangular matrix. A ragged set - one where
 * "Selected step" runs 1..2 under "Total steps=2" but 1..6 under
 * "Total steps=6" - has rows that the first column never reaches, and those
 * rows silently went unlabelled.
 *
 * These functions read every child instead, and group them into bands. The
 * geometry is the only input, so the whole decision is pure and testable
 * apart from the drawing.
 */

/** The geometry a slot needs from a node. */
export interface AxisBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `"x"` groups nodes into columns, `"y"` into rows. */
export type Axis = "x" | "y";

export interface AxisSlot<T extends AxisBox> {
  /** Every node in this band, in ascending order along the axis. */
  readonly nodes: readonly T[];
  /** Near edge of the band: the smallest x (or y) of its nodes. */
  readonly start: number;
  /** Far edge of the band: the largest x + width (or y + height). */
  readonly end: number;
  /** Midpoint of the band, where the band's label belongs. */
  readonly center: number;
}

/**
 * How far a node's near edge may sit from the band's near edge, as a share
 * of the smaller of the two nodes. Half tolerates a row whose cells differ
 * in size or are centred against each other, while a cell that starts a
 * clear step further along opens a new band.
 *
 * Near edges, rather than overlap, decide the band: cells of one row are
 * aligned, and a much taller cell overlaps the whole rows below it without
 * belonging to them.
 */
const ALIGNMENT_SHARE = 0.5;

function startOf(box: AxisBox, axis: Axis): number {
  return axis === "x" ? box.x : box.y;
}

function extentOf(box: AxisBox, axis: Axis): number {
  return axis === "x" ? box.width : box.height;
}

function crossStartOf(box: AxisBox, axis: Axis): number {
  return axis === "x" ? box.y : box.x;
}

/**
 * Whether `node` belongs to the band `anchor` opened. The test is against
 * the band's first node rather than the band's grown extent, so a band
 * cannot drift one tolerance at a time across the whole grid.
 */
function sharesBand(anchor: AxisBox, node: AxisBox, axis: Axis): boolean {
  const gap = Math.abs(startOf(node, axis) - startOf(anchor, axis));
  const smaller = Math.min(extentOf(anchor, axis), extentOf(node, axis));

  return gap <= Math.max(smaller, 0) * ALIGNMENT_SHARE;
}

/**
 * Group nodes into the bands of the grid along one axis, near edge first.
 *
 * Every node lands in exactly one band, so a ragged set reports every row
 * it has, not only the rows its first column happens to cover.
 */
export function collectAxisSlots<T extends AxisBox>(
  nodes: readonly T[],
  axis: Axis,
): AxisSlot<T>[] {
  const sorted = [...nodes].sort(
    (a, b) =>
      startOf(a, axis) - startOf(b, axis) ||
      crossStartOf(a, axis) - crossStartOf(b, axis),
  );

  const bands: T[][] = [];

  for (const node of sorted) {
    const current = bands[bands.length - 1];
    if (current && sharesBand(current[0], node, axis)) {
      current.push(node);
    } else {
      bands.push([node]);
    }
  }

  return bands.map((band) => {
    let start = Infinity;
    let end = -Infinity;
    for (const node of band) {
      start = Math.min(start, startOf(node, axis));
      end = Math.max(end, startOf(node, axis) + extentOf(node, axis));
    }
    return { nodes: band, start, end, center: (start + end) / 2 };
  });
}

/**
 * The variant value a slot is labelled with, and the node that value came
 * from.
 *
 * A well-formed band agrees on one value, so any member answers. A band
 * whose members disagree - a genuinely scrambled set - is labelled with the
 * value most of them hold, rather than with whatever sits nearest the edge.
 * Returns null when no node in the band carries the property at all.
 */
export function chooseSlotValue<T extends AxisBox>(
  slot: AxisSlot<T>,
  valueOf: (node: T) => string,
): { value: string; node: T } | null {
  const seen = new Map<string, { count: number; node: T }>();

  for (const node of slot.nodes) {
    const value = valueOf(node);
    if (!value) continue;

    const entry = seen.get(value);
    if (entry) {
      entry.count += 1;
    } else {
      seen.set(value, { count: 1, node });
    }
  }

  let best: { value: string; count: number; node: T } | null = null;
  for (const [value, entry] of seen) {
    if (!best || entry.count > best.count) {
      best = { value, count: entry.count, node: entry.node };
    }
  }

  return best ? { value: best.value, node: best.node } : null;
}
