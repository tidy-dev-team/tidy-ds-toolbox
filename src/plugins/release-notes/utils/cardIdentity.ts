/**
 * Which nodes on a page this module published.
 *
 * The identity of record is the plugin-data stamp. Two frame names predate it,
 * and both have to stay matchable or a card published by an older build becomes
 * undeletable: `<Subject>-release-notes` for a Subject card, and
 * `release-notes-frame` for the aggregate.
 *
 * Pure on purpose, and in one place on purpose, because the rules differ by how
 * much damage a wrong answer does.
 *
 * A publish is routine, automatic and unconfirmed, so it deletes only what
 * carries a stamp. Clear Canvas is a button somebody presses with intent, so it
 * may also delete a frame merely named like this module's output. Those names
 * predate the stamp and cannot be distinguished from a designer's own frame,
 * which is the whole reason the split exists: guessing wrong costs a duplicate
 * card on one side and somebody's work on the other.
 *
 * The pre-stamp names matter because a file can be old enough to hold cards
 * from before the stamp existed, which no current file can demonstrate. That is
 * why the rules sit together over a plain description of a node, and are
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

/**
 * Carries this module's stamp. The identity of record, and the only thing a
 * publish is allowed to delete.
 *
 * A stamp is proof: this module wrote it. A name is not. Publishing is routine
 * and automatic and nobody confirms it, so it gets the rule that cannot be
 * wrong, even though that means it can no longer replace a pre-stamp card.
 */
export function isStampedCard(node: CardNode): boolean {
  return node.stamp !== null;
}

/**
 * Named like this module's output but carrying no stamp.
 *
 * Either a card from a build older than the stamp, or a designer's own frame
 * that happens to be called `Buttons-release-notes`. Nothing here can tell
 * those apart, which is exactly why a publish must not delete them: the cost of
 * being wrong is somebody's work, silently, on an action they did not think of
 * as destructive. A publish counts them and says so; Clear Canvas removes them,
 * because a designer asked it to.
 */
export function isLegacyNamedCard(node: CardNode): boolean {
  if (isStampedCard(node)) return false;

  return (
    hasLegacyName(node, LEGACY_AGGREGATE_FRAME_NAME) ||
    (node.isFrame && node.name.endsWith(LEGACY_CARD_NAME_SUFFIX))
  );
}

/**
 * Anything this module could have published: stamped, or merely named like it.
 *
 * Clear Canvas only. It is the union of the two rules above, so it can never
 * strand what a publish replaces, and it is the only way a pre-stamp card
 * becomes removable at all.
 */
export function isOwnedCard(node: CardNode): boolean {
  return isStampedCard(node) || isLegacyNamedCard(node);
}
