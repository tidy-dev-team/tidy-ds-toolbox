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
 * A card clear of the page: to the left of everything already on it, tops
 * aligned with the topmost item. An empty page puts it at the origin.
 *
 * This is where a Foundation card always goes, and where a component's card
 * goes when the component sits inside a frame rather than straight on the page.
 *
 * `siblings` must exclude the card's own previous output: a card that measured
 * itself would walk further left on every publish.
 */
export function pageEdgeCardPosition(
  siblings: Position[],
  cardWidth: number,
  gap: number,
): Position {
  if (siblings.length === 0) return { x: 0, y: 0 };

  const left = Math.min(...siblings.map((sibling) => sibling.x));
  const top = Math.min(...siblings.map((sibling) => sibling.y));

  return { x: left - cardWidth - gap, y: top };
}

/**
 * A component's card sits immediately left of the component, tops aligned.
 *
 * Only usable when the component is a direct child of the page, because `x` and
 * `y` are read relative to the parent and the card is a child of the page.
 */
export function componentCardPosition(
  component: Position,
  cardWidth: number,
  gap: number,
): Position {
  return { x: component.x - cardWidth - gap, y: component.y };
}
