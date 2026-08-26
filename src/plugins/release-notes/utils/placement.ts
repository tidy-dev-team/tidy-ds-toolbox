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

/**
 * Where a card was standing before this publish swept it away.
 *
 * A publish rebuilds every card from scratch, so the page it was on is part of
 * the answer: a card the user dragged to another page has to go back there, not
 * to the page the rules would have chosen.
 */
export interface RememberedPlacement extends Position {
  pageId: string;
}

/**
 * A card is identified across publishes by what it is about, which is exactly
 * what its stamp records. Two cards can never share a key: the aggregate is one
 * per file and every other card is one per Subject.
 */
export function cardPlacementKey(kind: string, subjectId: string): string {
  return `${kind}:${subjectId}`;
}

/**
 * Keep a card where the user left it, and compute a place only for one that has
 * never been drawn.
 *
 * The rules in this file decide where a card *starts*. They must not keep
 * deciding after that: a card is a thing on a canvas that somebody arranges
 * around the work it describes, and a publish that drags it back beside its
 * component every time makes that arrangement impossible to keep. So a card
 * that was already standing goes back to where it was standing, and the first
 * publish of a card is the only one that positions it.
 */
export function resolveCardPlacement(
  remembered: RememberedPlacement | null,
  computed: Position,
): Position {
  return remembered ? { x: remembered.x, y: remembered.y } : computed;
}
