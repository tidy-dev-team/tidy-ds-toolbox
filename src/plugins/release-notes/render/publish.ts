/**
 * Publishing: redraw the whole file - the aggregate changelog, and one card
 * beside every Subject any sprint mentions - and only then sweep away
 * whatever the previous publish left behind.
 *
 * A card is found again by its plugin-data stamp, never by frame name or
 * position, so renaming a Subject or dragging a card cannot orphan it or make
 * a second one appear. The stamp is also the only thing a publish will delete
 * by, because it is the only thing that proves this module wrote the frame.
 *
 * Draw-then-sweep, not sweep-then-draw: an interruption partway through must
 * never leave a hole. Each publish mints one publish identity, stamps it on
 * every card it draws, and afterwards removes only owned cards stamped with a
 * *different* identity (or none at all). See `publishNotes` for the full
 * reasoning.
 *
 * That same stamp is what lets a card stay where the user put it. Each card's
 * page and position are read before anything is drawn, and the rebuilt card
 * goes back there. The placement rules therefore only ever decide where a card
 * appears for the first time.
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
  cardPlacementKey,
  classifyCardCandidate,
  isLegacyNamedCard,
  isPreviousPublishCard,
  isStampedCard,
  parseCardStamp,
  type CardNode,
  type CardStamp,
} from "../utils/cardIdentity";
import { planClearCanvasDeletion } from "../utils/clearCanvas";
import { allSubjectsInOrder } from "../utils/notes";
import { getCardAppearance } from "../utils/appearanceHelpers";
import { mintId } from "../utils/id";
import {
  componentCardPosition,
  pageEdgeSlot,
  type Position,
} from "../utils/placement";
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

/**
 * Where a card was standing before this publish swept it away. The page is part
 * of the answer: a card the user dragged to another page has to go back there,
 * not to the page the rules would have chosen.
 */
interface RememberedPlacement extends Position {
  page: PageNode;
}

/** The remembered page, unless the user has since deleted it. */
function livePage(remembered: RememberedPlacement | null): PageNode | null {
  return remembered && !remembered.page.removed ? remembered.page : null;
}

/**
 * Put a card on the canvas: back where it was standing, or, for one that has
 * never been drawn, where `computed` says.
 *
 * The rules in `placement.ts` decide where a card *starts*. They must not keep
 * deciding after that: a card is a thing on a canvas that somebody arranges
 * around the work it describes, and a publish that drags it back beside its
 * component every time makes that arrangement impossible to keep.
 *
 * `computed` is a thunk because it is the expensive half - `pageEdgeSlot` reads
 * the whole page - and after the first publish it is the half almost no card
 * needs.
 */
function placeCard(
  card: FrameNode,
  fallbackPage: PageNode,
  remembered: RememberedPlacement | null,
  computed: () => Position,
): void {
  // Safe to append first: the card is stamped by now, so it is an owned card
  // and pageContent leaves it out of its own measurement.
  (livePage(remembered) ?? fallbackPage).appendChild(card);

  const position = remembered ?? computed();
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
 *
 * Drawing happens before sweeping. Each publish mints one publish identity and
 * stamps it onto every card it draws; only afterwards does it remove owned
 * cards stamped with a *different* identity - the previous publish's, or none
 * at all. That order means an interruption can leave the old and new cards
 * standing together, but it can never leave a hole: the canvas holds a
 * complete old set, a complete new set, or (only while something has gone
 * wrong) both, and never neither. A publish is not made atomic - Figma offers
 * no transaction - so an interruption during the draw phase is reported as an
 * incomplete canvas, and the fix is to publish again: the next publish's own
 * sweep removes whatever the interrupted one left behind, because everything
 * this module draws is stamped and nothing it draws is ever nameless.
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

  const publishId = mintId(Date.now());
  const subjects = allSubjectsInOrder(sprints);

  // Read where every owned card currently stands, without touching the
  // canvas. Nothing is removed here: drawing must succeed first, or an
  // interruption during this pass would have destroyed the previous complete
  // set for nothing.
  //
  // Stamped cards only feed `remembered`. A name is not proof:
  // `Buttons-release-notes` is a card from a build older than the stamp, or it
  // is a frame a designer made and named, and nothing here can tell. Legacy
  // names are counted instead and reported, and Delete from canvas lets the
  // user review them.
  let legacyCardsFound = 0;
  const remembered = new Map<string, RememberedPlacement>();
  for (const page of figma.root.children) {
    if (page.type !== "PAGE") continue;

    for (const card of page.children) {
      const described = describe(card);
      if (described.stamp) {
        remembered.set(cardPlacementKey(described.stamp), {
          page,
          x: card.x,
          y: card.y,
        });
      } else if (isLegacyNamedCard(described)) legacyCardsFound += 1;
    }
  }

  try {
    let cardsBuilt = 0;

    // Aggregate changelog: one card holding every sprint. It goes to the
    // Release Notes page, which is created only if no remembered page is
    // standing.
    const aggregateStamp = {
      kind: "aggregate",
      subjectId: "",
      publishId,
    } as const;
    const aggregateRemembered =
      remembered.get(cardPlacementKey(aggregateStamp)) ?? null;
    const aggregatePage =
      livePage(aggregateRemembered) ?? getOrCreateReleaseNotesPage(figma);
    const aggregate = buildAggregateChangelog(figma, appearance, sprints);
    stamp(aggregate, aggregateStamp);
    placeCard(aggregate, aggregatePage, aggregateRemembered, () => ({
      x: 0,
      y: 0,
    }));
    cardsBuilt += 1;

    // One card per Subject, and its slot on the page, from one ordered walk.
    // The order is the Subject's, taken from the notes, so a card lands in
    // the same place on every publish.
    const filled = new Map<string, number>();
    const targets: Array<{
      subject: Subject;
      target: CardTarget;
      slot: number;
    }> = [];

    for (const subject of subjects) {
      const target = resolveCardTarget(figma, subject);
      if (!target) continue;

      // The slot is still counted for a card that will not use it. The count
      // is the Subject's position in the notes, not a queue of free space,
      // and that is what keeps a first-time card landing in the same place
      // whether or not its neighbours have since been moved away.
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

      const cardStamp = {
        kind: subject.kind,
        subjectId: subject.id,
        publishId,
      };
      stamp(card, cardStamp);
      placeCard(
        card,
        target.page,
        remembered.get(cardPlacementKey(cardStamp)) ?? null,
        () =>
          target.anchor
            ? componentCardPosition(target.anchor, card.width, CARD_GAP)
            : pageEdgeSlot(
                pageContent(target.page),
                slot,
                card.width,
                CARD_GAP,
              ),
      );
      cardsBuilt += 1;
    }

    // Sweep, now that the complete new set is standing: remove every owned
    // card stamped with a publish identity other than this one. This is the
    // only place anything is removed, and it runs last on purpose.
    for (const page of figma.root.children) {
      if (page.type !== "PAGE") continue;

      for (const card of [...page.children]) {
        if (isPreviousPublishCard(describe(card), publishId)) {
          card.remove();
        }
      }
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
  } catch (error) {
    // Drawing (or the sweep right after it) threw partway through. Nothing
    // here is rolled back - there is no transaction to roll back to - so the
    // canvas may hold the old set, the new set, or both at once. Publishing
    // again is the recovery path: its own sweep removes whatever this
    // attempt left standing, because every card either publish draws is
    // stamped with that publish's identity.
    const detail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Publishing was interrupted (${detail}), so the canvas may hold both the old and the new cards. Publish again to finish it.`,
    };
  }
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
