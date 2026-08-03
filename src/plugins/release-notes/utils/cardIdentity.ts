/**
 * Which nodes on a page this module published.
 *
 * The identity of record is the plugin-data stamp. Two frame names predate it,
 * and both have to stay matchable or a card published by an older build becomes
 * undeletable: `<Subject>-release-notes` for a Subject card, and
 * `release-notes-frame` for the aggregate.
 *
 * Pure on purpose, and in one place on purpose, because the rules differ by how
 * much damage a wrong answer does. There are two sweeps, and they are allowed to
 * disagree in exactly one direction.
 *
 * A publish is routine and automatic, so it may only remove what it can prove is
 * its own: `isReplaceableCard`. Clear Canvas is a button somebody presses with
 * intent, so it may also remove anything merely named like this module's output:
 * `isOwnedCard`. The second must stay a superset of the first, or Clear Canvas
 * would leave behind a card a publish replaces.
 *
 * The pre-stamp names exist because a file can be old enough to hold cards from
 * before the stamp, which no current file can demonstrate. That is why the rules
 * sit together over a plain description of a node, and are fixture-tested.
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

/** Carries this module's stamp, which is the identity of record. */
export function isStampedCard(node: CardNode): boolean {
  return node.stamp !== null;
}

/**
 * What a publish removes before redrawing: its own stamped output, and the
 * pre-stamp cards it can name with certainty.
 *
 * Certainty is the whole point of `subjectNames`. A publish is routine and
 * automatic, so it may only delete a frame it can prove is its own: a stamp, the
 * one aggregate name, or `<Subject>-release-notes` for a Subject that actually
 * has notes. It must not delete by suffix. A designer frame called
 * `client-release-notes` ends with the legacy suffix and carries no stamp, and
 * sweeping those on every publish would destroy their work without asking.
 * `isOwnedCard` may do that because Clear Canvas is a button somebody presses.
 */
export function isReplaceableCard(
  node: CardNode,
  subjectNames: string[],
): boolean {
  if (isStampedCard(node)) return true;
  if (hasLegacyName(node, LEGACY_AGGREGATE_FRAME_NAME)) return true;

  return subjectNames.some((name) =>
    hasLegacyName(node, `${name}${LEGACY_CARD_NAME_SUFFIX}`),
  );
}

/**
 * Anything this module could have published: any stamped card, plus every
 * pre-stamp name including the bare suffix.
 *
 * Broader than `isReplaceableCard` on purpose, and only ever reached from Clear
 * Canvas. Sweeping by suffix is how a pre-stamp card whose Subject was since
 * renamed becomes removable at all, and it is safe to offer behind an explicit
 * action in a way it is not as a side effect of publishing.
 */
export function isOwnedCard(node: CardNode): boolean {
  return (
    isStampedCard(node) ||
    hasLegacyName(node, LEGACY_AGGREGATE_FRAME_NAME) ||
    (node.isFrame && node.name.endsWith(LEGACY_CARD_NAME_SUFFIX))
  );
}
