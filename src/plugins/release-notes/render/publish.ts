/**
 * Publishing: put a card beside every Subject the sprint touched, and rebuild
 * the aggregate changelog page.
 *
 * A card is found again by its plugin-data stamp, never by frame name or
 * position, so renaming a Subject or dragging a card cannot orphan it or make
 * a second one appear.
 */

import type { PublishResult, Sprint, Subject } from "../types";
import {
  CARD_GAP,
  CARD_STAMP_KEY,
  RELEASE_NOTES_PAGE_NAME,
} from "../utils/constants";
import {
  isAggregateCard,
  isCardForSubject,
  isOwnedCard,
  parseCardStamp,
  type CardNode,
  type CardStamp,
} from "../utils/cardIdentity";
import { distinctSubjects } from "../utils/notes";
import {
  componentCardPosition,
  pageEdgeCardPosition,
} from "../utils/placement";
import { resolveCardFonts } from "./primitives";
import { buildSubjectCard } from "./subjectCard";
import { buildAggregateChangelog } from "./aggregateChangelog";
import { findParentPage } from "../utils/componentSetHelpers";

function stamp(frame: FrameNode, value: Omit<CardStamp, "builtAt">): void {
  frame.setPluginData(
    CARD_STAMP_KEY,
    JSON.stringify({ ...value, builtAt: new Date().toISOString() }),
  );
}

/** A node as the ownership rules see it: a frame, a name, and its stamp. */
function describe(node: SceneNode): CardNode {
  return {
    isFrame: node.type === "FRAME",
    name: node.name,
    stamp:
      "getPluginData" in node
        ? parseCardStamp(node.getPluginData(CARD_STAMP_KEY))
        : null,
  };
}

function getOrCreateReleaseNotesPage(figma: PluginAPI): PageNode {
  const existing = figma.root.children.find(
    (child) => child.type === "PAGE" && child.name === RELEASE_NOTES_PAGE_NAME,
  ) as PageNode | undefined;

  if (existing) return existing;

  const page = figma.createPage();
  page.name = RELEASE_NOTES_PAGE_NAME;
  return page;
}

/**
 * Where a Subject's card goes: the page it lives on, and the node it sits
 * beside. `anchor: null` means there is nothing to sit beside, and the card
 * goes to the left edge of the page instead.
 */
interface CardTarget {
  page: PageNode;
  anchor: SceneNode | null;
}

function resolveCardTarget(
  figma: PluginAPI,
  subject: Subject,
): CardTarget | null {
  const node = figma.getNodeById(subject.id);
  if (!node) return null;

  // A Foundation page is the canvas itself, so it has nothing to sit beside.
  if (subject.kind === "foundation-page") {
    return node.type === "PAGE" ? { page: node, anchor: null } : null;
  }

  if (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT") return null;

  // A note can outlive the shape of its subject: a component picked while it
  // stood alone can later be combined into a set. The set is then the thing
  // placed on the page, so it is the set that decides where the card goes.
  const placed = node.parent?.type === "COMPONENT_SET" ? node.parent : node;

  const page = findParentPage(placed);
  if (!page) return null;

  // Only a component sitting straight on the page can anchor its own card. Read
  // from inside a documentation frame, `x` and `y` are relative to that frame,
  // so a page-level card placed at those numbers lands somewhere arbitrary. And
  // even measured correctly it would sit on top of the frame it describes. Such
  // a component uses the page edge instead, the same as a Foundation page.
  const anchor = placed.parent?.type === "PAGE" ? placed : null;

  return { page, anchor };
}

function placeCard(
  target: CardTarget,
  card: FrameNode,
  subject: Subject,
): void {
  // Measure before appending, and never count a card of this Subject: a card
  // that measured itself would walk further left on every publish.
  const siblings = target.page.children
    .filter((child) => !isCardForSubject(describe(child), subject))
    .map((child) => ({ x: child.x, y: child.y }));

  target.page.appendChild(card);

  const position = target.anchor
    ? componentCardPosition(target.anchor, card.width, CARD_GAP)
    : pageEdgeCardPosition(siblings, card.width, CARD_GAP);

  card.x = position.x;
  card.y = position.y;
}

export async function publishSprintNotes(
  figma: PluginAPI,
  sprints: Sprint[],
  sprint: Sprint,
): Promise<PublishResult> {
  const fonts = await resolveCardFonts(figma);

  if (fonts.fallback) {
    figma.notify(
      "Satoshi is not available here, so the release notes were drawn with Inter.",
      { timeout: 6000 },
    );
  }

  let cardsBuilt = 0;

  // Aggregate changelog: one card holding every sprint.
  const aggregatePage = getOrCreateReleaseNotesPage(figma);
  for (const child of [...aggregatePage.children]) {
    if (isAggregateCard(describe(child))) child.remove();
  }

  const aggregate = buildAggregateChangelog(figma, fonts, sprints);
  stamp(aggregate, { kind: "aggregate", subjectId: "" });
  aggregatePage.appendChild(aggregate);
  aggregate.x = 0;
  aggregate.y = 0;
  cardsBuilt += 1;

  // One card per Subject the published sprint touched.
  for (const subject of distinctSubjects(sprint.notes)) {
    const target = resolveCardTarget(figma, subject);
    if (!target) continue;

    for (const child of [...target.page.children]) {
      if (isCardForSubject(describe(child), subject)) child.remove();
    }

    const card = buildSubjectCard(figma, fonts, subject, sprints);
    if (!card) continue;

    stamp(card, { kind: subject.kind, subjectId: subject.id });
    placeCard(target, card, subject);
    cardsBuilt += 1;
  }

  figma.currentPage = aggregatePage;
  figma.viewport.scrollAndZoomIntoView([aggregate]);

  return {
    success: true,
    fontFamily: fonts.family,
    fontFallback: fonts.fallback,
    cardsBuilt,
  };
}

/**
 * Remove every card this module owns, on every page. Cards published before the
 * stamp existed are matched by their old frame names - both of them, the Subject
 * card's and the aggregate's - otherwise they would be unremovable.
 */
export function clearPublishedCards(figma: PluginAPI): number {
  let removed = 0;

  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue;

    for (const card of [...page.children]) {
      if (!isOwnedCard(describe(card))) continue;
      card.remove();
      removed += 1;
    }
  }

  return removed;
}
