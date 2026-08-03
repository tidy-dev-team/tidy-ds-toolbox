/**
 * Which nodes on a page this module published.
 *
 * The identity of record is the plugin-data stamp. Two frame names predate it,
 * and both have to stay matchable or a card published by an older build becomes
 * undeletable: `<Subject>-release-notes` for a Subject card, and
 * `release-notes-frame` for the aggregate.
 *
 * Pure on purpose, and one rule on purpose. There used to be three sweeps -
 * publish replacing the aggregate, publish replacing one Subject's card, and
 * Clear Canvas removing every card - and a legacy name missing from one of them
 * stranded a card that another path still replaced. That is a bug no current
 * file can show, because it needs a file old enough to hold a pre-stamp card.
 *
 * A publish is now a whole-file redraw, so it sweeps with the same rule Clear
 * Canvas does and the narrower two are gone. Three rules that had to agree
 * became one that cannot disagree with itself.
 */

import {
  LEGACY_AGGREGATE_FRAME_NAME,
  LEGACY_CARD_NAME_SUFFIX,
} from "./constants";

export interface CardStamp {
  kind: "aggregate" | "component-set" | "foundation-page";
  /** Empty for the aggregate, which is about every Subject rather than one. */
  subjectId: string;
  builtAt: string;
}

/** All the rules need to know about a node sitting on a page. */
export interface CardNode {
  isFrame: boolean;
  name: string;
  stamp: CardStamp | null;
}

/** A stamp, or null when the node carries none or carries something unreadable. */
export function parseCardStamp(raw: string): CardStamp | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CardStamp;
    return typeof parsed?.kind === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function hasLegacyName(node: CardNode, name: string): boolean {
  return node.isFrame && node.name === name;
}

/**
 * Anything this module published: any stamped card, and every pre-stamp name,
 * the aggregate's and a Subject card's alike.
 *
 * The only ownership rule there is. Both sweeps that exist use it, so a card
 * this matches is a card either of them will remove.
 */
export function isOwnedCard(node: CardNode): boolean {
  return (
    node.stamp !== null ||
    hasLegacyName(node, LEGACY_AGGREGATE_FRAME_NAME) ||
    (node.isFrame && node.name.endsWith(LEGACY_CARD_NAME_SUFFIX))
  );
}
