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
 * A slot clear of the page: to the left of everything on it, tops aligned with
 * the topmost item, and `index` slots further left again. An empty page puts
 * slot 0 at the origin.
 *
 * This is where a Foundation card goes, and where a component's card goes when
 * the component sits inside a frame rather than straight on the page. Several
 * Subjects can share a page, so they stack leftward by index.
 *
 * `content` is the page's own material and must never contain a card. Nor may
 * `index` be read off the canvas. Position derived from what is standing there
 * is position derived from the last publish, and it drifts without limit: a
 * card pushes the next card left, which pushes the first one further left the
 * next time round. The index belongs to the Subject and comes from the notes,
 * so the same Subject lands in the same place whichever sprint is published.
 */
export function pageEdgeSlot(
  content: Position[],
  index: number,
  cardWidth: number,
  gap: number,
): Position {
  const step = cardWidth + gap;

  // An empty page is measured as if its content started one step right of the
  // origin, which puts slot 0 at the origin.
  const left =
    content.length === 0 ? step : Math.min(...content.map((item) => item.x));
  const top =
    content.length === 0 ? 0 : Math.min(...content.map((item) => item.y));

  return { x: left - step - index * step, y: top };
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
