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
  LEGACY_AGGREGATE_FRAME_NAME,
  LEGACY_CARD_NAME_SUFFIX,
  RELEASE_NOTES_PAGE_NAME,
} from "../utils/constants";
import { distinctSubjects } from "../utils/notes";
import {
  componentCardPosition,
  foundationCardPosition,
} from "../utils/placement";
import { resolveCardFonts } from "./primitives";
import { buildSubjectCard } from "./subjectCard";
import { buildAggregateChangelog } from "./aggregateChangelog";
import { findParentPage } from "../utils/componentSetHelpers";

interface CardStamp {
  kind: "aggregate" | "component-set" | "foundation-page";
  subjectId: string;
  builtAt: string;
}

function stamp(frame: FrameNode, value: Omit<CardStamp, "builtAt">): void {
  frame.setPluginData(
    CARD_STAMP_KEY,
    JSON.stringify({ ...value, builtAt: new Date().toISOString() }),
  );
}

function readStamp(node: BaseNode): CardStamp | null {
  if (!("getPluginData" in node)) return null;
  const raw = (node as SceneNode).getPluginData(CARD_STAMP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CardStamp;
    return typeof parsed?.kind === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function isStampedCard(node: BaseNode, subjectId: string): boolean {
  return readStamp(node)?.subjectId === subjectId;
}

/** Every card this module owns on a page, by stamp and by the pre-stamp name. */
function ownedCards(page: PageNode): SceneNode[] {
  return page.children.filter(
    (child) =>
      readStamp(child) !== null ||
      (child.type === "FRAME" && child.name.endsWith(LEGACY_CARD_NAME_SUFFIX)),
  );
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

function resolveSubjectPage(
  figma: PluginAPI,
  subject: Subject,
): { page: PageNode; anchor: SceneNode | null } | null {
  const node = figma.getNodeById(subject.id);
  if (!node) return null;

  if (subject.kind === "foundation-page") {
    return node.type === "PAGE" ? { page: node, anchor: null } : null;
  }

  if (node.type !== "COMPONENT_SET") return null;
  const page = findParentPage(node);
  return page ? { page, anchor: node } : null;
}

function placeCard(
  page: PageNode,
  card: FrameNode,
  subject: Subject,
  anchor: SceneNode | null,
): void {
  // Measure before appending, and never count a card of this Subject: a card
  // that measured itself would walk further left on every publish.
  const siblings = page.children
    .filter((child) => !isStampedCard(child, subject.id))
    .map((child) => ({ x: child.x, y: child.y }));

  page.appendChild(card);

  const position = anchor
    ? componentCardPosition(anchor, card.width, CARD_GAP)
    : foundationCardPosition(siblings, card.width, CARD_GAP);

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
    if (
      readStamp(child)?.kind === "aggregate" ||
      (child.type === "FRAME" && child.name === LEGACY_AGGREGATE_FRAME_NAME)
    ) {
      child.remove();
    }
  }

  const aggregate = buildAggregateChangelog(figma, fonts, sprints);
  stamp(aggregate, { kind: "aggregate", subjectId: "" });
  aggregatePage.appendChild(aggregate);
  aggregate.x = 0;
  aggregate.y = 0;
  cardsBuilt += 1;

  // One card per Subject the published sprint touched.
  for (const subject of distinctSubjects(sprint.notes)) {
    const target = resolveSubjectPage(figma, subject);
    if (!target) continue;

    for (const child of [...target.page.children]) {
      if (
        isStampedCard(child, subject.id) ||
        (child.type === "FRAME" &&
          child.name === `${subject.name}${LEGACY_CARD_NAME_SUFFIX}`)
      ) {
        child.remove();
      }
    }

    const card = buildSubjectCard(figma, fonts, subject, sprints);
    if (!card) continue;

    stamp(card, { kind: subject.kind, subjectId: subject.id });
    placeCard(target.page, card, subject, target.anchor);
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
 * Remove every card this module owns. Cards published before the stamp existed
 * are matched by their old frame name, otherwise they would be unremovable.
 */
export function clearPublishedCards(figma: PluginAPI): number {
  let removed = 0;

  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue;

    for (const card of ownedCards(page)) {
      card.remove();
      removed += 1;
    }
  }

  return removed;
}
