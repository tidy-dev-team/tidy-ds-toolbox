/**
 * Where a card goes. Pure geometry, kept apart from the drawing so every
 * placement rule is fixture-tested without a canvas.
 */

export interface Position {
  x: number;
  y: number;
}

export interface Box extends Position {
  width: number;
}

/**
 * A Foundation card sits to the left of everything already on the page, tops
 * aligned with the topmost item. An empty page puts it at the origin.
 *
 * `siblings` must exclude the card's own previous output: a card that measured
 * itself would walk further left on every publish.
 */
export function foundationCardPosition(
  siblings: Position[],
  cardWidth: number,
  gap: number,
): Position {
  if (siblings.length === 0) return { x: 0, y: 0 };

  const left = Math.min(...siblings.map((sibling) => sibling.x));
  const top = Math.min(...siblings.map((sibling) => sibling.y));

  return { x: left - cardWidth - gap, y: top };
}

/** A component-set card sits immediately left of its set, tops aligned. */
export function componentCardPosition(
  componentSet: Position,
  cardWidth: number,
  gap: number,
): Position {
  return { x: componentSet.x - cardWidth - gap, y: componentSet.y };
}
