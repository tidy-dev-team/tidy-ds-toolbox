/**
 * Publishing: sweep every stamped card, then redraw the whole file - the
 * aggregate changelog, and one card beside every Subject any sprint mentions.
 *
 * A card is found again by its plugin-data stamp, never by frame name or
 * position, so renaming a Subject or dragging a card cannot orphan it or make
 * a second one appear. The stamp is also the only thing a publish will delete
 * by, because it is the only thing that proves this module wrote the frame.
 */

import type {
  ClearCanvasCandidate,
  ClearCanvasDeletionPayload,
  ClearCanvasDeletionResult,
  ClearCanvasPreviewPayload,
  ClearCanvasPreviewResult,
  PublishResult,
  Sprint,
  Subject,
} from "../types";
import {
  CARD_GAP,
  CARD_STAMP_KEY,
  RELEASE_NOTES_PAGE_NAME,
} from "../utils/constants";
import {
  classifyCardCandidate,
  isLegacyNamedCard,
  isStampedCard,
  parseCardStamp,
  type CardNode,
  type CardStamp,
} from "../utils/cardIdentity";
import { planClearCanvasDeletion } from "../utils/clearCanvas";
import { allSubjectsInOrder } from "../utils/notes";
import { getCardAppearance } from "../utils/appearanceHelpers";
import { componentCardPosition, pageEdgeSlot } from "../utils/placement";
import { resolveCardAppearance } from "./primitives";
import { buildSubjectCard } from "./subjectCard";
import { buildAggregateChangelog } from "./aggregateChangelog";
import { findParentPage } from "../utils/componentHelpers";

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
    isTopLevel: node.parent?.type === "PAGE",
    name: node.name,
    stamp:
      "getPluginData" in node
        ? parseCardStamp(node.getPluginData(CARD_STAMP_KEY))
        : null,
  };
}

function clearCanvasCandidate(
  node: SceneNode,
  pageName: string,
): ClearCanvasCandidate | null {
  const ownership = classifyCardCandidate(describe(node));
  if (!ownership) return null;

  return {
    id: node.id,
    name: node.name,
    pageName,
    ownership,
  };
}

function getClearCanvasCandidates(figma: PluginAPI): ClearCanvasCandidate[] {
  const candidates: ClearCanvasCandidate[] = [];

  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue;

    for (const node of page.children) {
      const candidate = clearCanvasCandidate(node, page.name);
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
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

/**
 * The page's own material: everything except the cards this module drew. A card
 * must never measure another card, or each publish would place its output
 * relative to the last publish's output and the whole group would walk left
 * across the canvas for ever.
 */
function pageContent(page: PageNode): { x: number; y: number }[] {
  return page.children
    .filter((child) => !isStampedCard(describe(child)))
    .map((child) => ({ x: child.x, y: child.y }));
}

function placeCard(target: CardTarget, card: FrameNode, slot: number): void {
  // Safe to append first: the card is stamped by now, so it is an owned card
  // and pageContent leaves it out of its own measurement.
  target.page.appendChild(card);

  const position = target.anchor
    ? componentCardPosition(target.anchor, card.width, CARD_GAP)
    : pageEdgeSlot(pageContent(target.page), slot, card.width, CARD_GAP);

  card.x = position.x;
  card.y = position.y;
}

/**
 * Redraw every card in the file: the aggregate, and one per Subject any sprint
 * mentions.
 *
 * Whole-file rather than per-sprint, which the aggregate always was. Two reasons
 * it has to be. A Subject's card shows its history across every sprint, so
 * editing or deleting an old note leaves an untouched card wrong until that
 * Subject happens to appear in a published sprint. And Card Appearance is one
 * setting for the whole file, so redrawing a subset would leave a canvas holding
 * two designs at once.
 *
 * The cost is that a publish is proportional to the file rather than to the
 * sprint.
 */
export async function publishNotes(
  figma: PluginAPI,
  sprints: Sprint[],
): Promise<PublishResult> {
  const appearance = await resolveCardAppearance(
    figma,
    getCardAppearance(figma),
  );

  if (appearance.fallback) {
    figma.notify(
      `${appearance.requested} is not available here, so the release notes were drawn with ${appearance.family}.`,
      { timeout: 6000 },
    );
  }

  let cardsBuilt = 0;

  const subjects = allSubjectsInOrder(sprints);

  // Sweep this publish's own output, everywhere, before drawing any of it.
  //
  // Whole-file rather than per-Subject: removing only the cards about to be
  // redrawn leaves the ones that should no longer exist. Delete the last note
  // about a Subject and it drops out of the notes, so nothing rebuilds its card
  // and nothing removes it either; same for a Subject whose node was deleted.
  // Both would sit there for ever, in the previous appearance.
  //
  // Stamped cards only. A name is not proof: `Buttons-release-notes` is a card
  // from a build older than the stamp, or it is a frame a designer made and
  // named, and nothing here can tell. Publishing is routine and nobody confirms
  // it, so it takes the rule that cannot be wrong. Pre-stamp cards are counted
  // instead and reported, and Delete from canvas lets the user review them.
  let legacyCardsFound = 0;
  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue;

    for (const card of [...page.children]) {
      const described = describe(card);
      if (isStampedCard(described)) card.remove();
      else if (isLegacyNamedCard(described)) legacyCardsFound += 1;
    }
  }

  // Aggregate changelog: one card holding every sprint.
  const aggregatePage = getOrCreateReleaseNotesPage(figma);
  const aggregate = buildAggregateChangelog(figma, appearance, sprints);
  stamp(aggregate, { kind: "aggregate", subjectId: "" });
  aggregatePage.appendChild(aggregate);
  aggregate.x = 0;
  aggregate.y = 0;
  cardsBuilt += 1;

  // One card per Subject, and its slot on the page, from one ordered walk. The
  // order is the Subject's, taken from the notes, so a card lands in the same
  // place on every publish.
  const filled = new Map<string, number>();
  const targets: Array<{
    subject: Subject;
    target: CardTarget;
    slot: number;
  }> = [];

  for (const subject of subjects) {
    const target = resolveCardTarget(figma, subject);
    if (!target) continue;

    let slot = 0;
    if (!target.anchor) {
      slot = filled.get(target.page.id) ?? 0;
      filled.set(target.page.id, slot + 1);
    }
    targets.push({ subject, target, slot });
  }

  for (const { subject, target, slot } of targets) {
    const card = buildSubjectCard(figma, appearance, subject, sprints);
    if (!card) continue;

    stamp(card, { kind: subject.kind, subjectId: subject.id });
    placeCard(target, card, slot);
    cardsBuilt += 1;
  }

  figma.currentPage = aggregatePage;
  figma.viewport.scrollAndZoomIntoView([aggregate]);

  return {
    success: true,
    fontFamily: appearance.family,
    fontRequested: appearance.requested,
    fontFallback: appearance.fallback,
    cardsBuilt,
    legacyCardsFound,
  };
}

/** Return the current candidates for the explicit Delete from canvas review. */
export function previewClearCanvas(
  figma: PluginAPI,
  _payload: ClearCanvasPreviewPayload,
): ClearCanvasPreviewResult {
  return {
    success: true,
    candidates: getClearCanvasCandidates(figma),
  };
}

function parseClearCanvasDeletionPayload(
  payload: unknown,
): ClearCanvasDeletionPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Delete from canvas needs selected node IDs.");
  }

  const nodeIds = (payload as { nodeIds?: unknown }).nodeIds;
  if (
    !Array.isArray(nodeIds) ||
    !nodeIds.every((id) => typeof id === "string")
  ) {
    throw new Error("Delete from canvas needs selected node IDs.");
  }

  return { nodeIds: [...new Set(nodeIds)] };
}

function getCurrentSelectedCard(
  figma: PluginAPI,
  nodeId: string,
): SceneNode | null {
  const node = figma.getNodeById(nodeId);
  if (!node || node.type !== "FRAME" || node.parent?.type !== "PAGE") {
    return null;
  }

  return classifyCardCandidate(describe(node)) ? node : null;
}

/**
 * Delete only the IDs selected in the review.
 *
 * Candidate discovery runs again before deletion, and each node is checked
 * again immediately before removal.
 * This prevents a stale preview, a removed node, a renamed legacy match, or a
 * normal designer frame from being removed.
 */
export function deleteSelectedCards(
  figma: PluginAPI,
  payload: unknown,
): ClearCanvasDeletionResult {
  const { nodeIds } = parseClearCanvasDeletionPayload(payload);
  const currentCandidates = getClearCanvasCandidates(figma);
  const plannedIds = planClearCanvasDeletion(currentCandidates, nodeIds);
  let removedCount = 0;

  for (const nodeId of plannedIds) {
    const node = getCurrentSelectedCard(figma, nodeId);
    if (!node) continue;

    node.remove();
    removedCount += 1;
  }

  return {
    success: true,
    removedCount,
    skippedCount: nodeIds.length - removedCount,
  };
}
