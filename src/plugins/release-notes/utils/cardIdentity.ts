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
 * carries a stamp. Delete from canvas shows both kinds of candidate first.
 * The user must select any unverified legacy-name match individually because
 * those names cannot be distinguished from a designer's own frame.
 *
 * The pre-stamp names matter because a file can be old enough to hold cards
 * from before the stamp existed, which no current file can demonstrate. That is
 * why the rules sit together over a plain description of a node, and are
 * fixture-tested.
 */

import type { ClearCanvasCandidateOwnership } from "../types";
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
  isTopLevel?: boolean;
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

/**
 * A card is identified across publishes by what it is about, which is exactly
 * what its stamp records. Two cards can never share a key: the aggregate is one
 * per file and every other card is one per Subject.
 *
 * It takes the stamp rather than its two fields so the key derives from the
 * identity of record instead of running alongside it - a kind this module does
 * not publish cannot be spelled here, and the two arguments cannot be swapped.
 */
export function cardPlacementKey(
  stamp: Pick<CardStamp, "kind" | "subjectId">,
): string {
  return `${stamp.kind}:${stamp.subjectId}`;
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
 * as destructive. A publish counts them and says so. Delete from canvas shows
 * them as unverified candidates and requires an individual selection.
 */
export function isLegacyNamedCard(node: CardNode): boolean {
  if (isStampedCard(node)) return false;

  return (
    hasLegacyName(node, LEGACY_AGGREGATE_FRAME_NAME) ||
    (node.isFrame && node.name.endsWith(LEGACY_CARD_NAME_SUFFIX))
  );
}

/**
 * Classify a top-level frame that may be shown in the Delete from canvas review.
 *
 * A verified stamp proves this module created the frame.
 * A legacy name only identifies an unverified match because a designer may have
 * used the same name.
 */
export function classifyCardCandidate(
  node: CardNode,
): ClearCanvasCandidateOwnership | null {
  if (node.isTopLevel !== true || !node.isFrame) return null;
  if (isStampedCard(node)) return "verified-stamped";
  if (isLegacyNamedCard(node)) return "unverified-legacy-name";
  return null;
}

/** Whether this node belongs in the explicit Delete from canvas review. */
export function isClearCanvasCandidate(node: CardNode): boolean {
  return classifyCardCandidate(node) !== null;
}

/**
 * Compatibility name for callers that need the union of the two identity rules.
 *
 * This does not authorize deletion or make a node a review candidate.
 */
export function isOwnedCard(node: CardNode): boolean {
  return isStampedCard(node) || isLegacyNamedCard(node);
}
