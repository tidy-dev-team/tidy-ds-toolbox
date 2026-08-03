/**
 * Which nodes on a page this module published.
 *
 * The identity of record is the plugin-data stamp. Two frame names predate it,
 * and both have to stay matchable or a card published by an older build becomes
 * undeletable: `<Subject>-release-notes` for a Subject card, and
 * `release-notes-frame` for the aggregate.
 *
 * Pure on purpose, and in one place on purpose. Three sweeps ask this question -
 * publish replacing the aggregate, publish replacing one Subject's card, and
 * Clear Canvas removing every card - and a legacy name missing from one of them
 * strands a card that another path still replaces. That is a bug no current file
 * can show, because it needs a file old enough to hold a pre-stamp card. So the
 * three rules sit together over a plain description of a node, and are
 * fixture-tested.
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

/** The one whole-file changelog card on the `Release notes` page. */
export function isAggregateCard(node: CardNode): boolean {
  return (
    node.stamp?.kind === "aggregate" ||
    hasLegacyName(node, LEGACY_AGGREGATE_FRAME_NAME)
  );
}

/** The card belonging to one Subject. Matched by stamp, or by its old name. */
export function isCardForSubject(
  node: CardNode,
  subject: { id: string; name: string },
): boolean {
  return (
    node.stamp?.subjectId === subject.id ||
    hasLegacyName(node, `${subject.name}${LEGACY_CARD_NAME_SUFFIX}`)
  );
}

/**
 * Anything this module published: any stamped card, and every pre-stamp name.
 * This is the rule Clear Canvas sweeps with, so it has to be the union of what
 * the two narrower rules above can match.
 */
export function isOwnedCard(node: CardNode): boolean {
  return (
    node.stamp !== null ||
    hasLegacyName(node, LEGACY_AGGREGATE_FRAME_NAME) ||
    (node.isFrame && node.name.endsWith(LEGACY_CARD_NAME_SUFFIX))
  );
}
