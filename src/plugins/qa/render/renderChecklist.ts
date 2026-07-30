/// <reference types="@figma/plugin-typings" />

/**
 * The QA checklist renderer (PRD §7). The single Figma-touching entry point for
 * drawing a ChecklistReport onto the canvas — kept isolated so the visual design
 * can be swapped without touching the checking logic. #92 rendered the minimal
 * tracer (one row per item with a status chip); #93 adds grouped finding lines
 * under automated rows with findings; #94 renders the 10 non-automated items as
 * a tinted row background instead of a status chip. The tick boxes that first
 * shipped alongside that tint were removed later: nothing ever ticked them, and
 * a box drawn on a Figma frame is not something a designer marks up in practice. #95 makes rebuilds idempotent: a prior checklist frame for the same
 * target (found via its plugin-data stamp, mirroring tidy-doc's
 * findExistingDocPages) is deleted before the new one is placed.
 */

import { groupFindings } from "../grouped-findings";
import type { ChecklistReport, SeverityLevel } from "../types";
import { decidePlacement } from "./placement";
import {
  autoLayout,
  card,
  fill,
  FONT_BOLD,
  FONT_REGULAR,
  hexToRgb,
  INK,
  loadRenderFonts,
  MANUAL_TINT,
  MUTED,
  ROW_BORDER,
  text,
} from "./primitives";
import { notePrefix, statusStyle } from "./status-style";

const PLUGIN_DATA_KEY = "tidy:qa-checklist";

interface ChecklistStamp {
  version: number;
  targetId: string;
  /** v2+: the node the frame was originally placed beside, so rebuilds can
   * re-anchor to it (usually the *instance*) rather than to whatever node the
   * caller happened to target this time (usually the *set*). */
  anchorId?: string;
  builtAt: number;
}

/** Where a rebuild should put the frame, recovered from the frame it replaces. */
interface PriorPlacement {
  parent: BaseNode & ChildrenMixin;
  x: number;
  y: number;
  anchorId?: string;
}

// Scans every page and every depth, since a rebuild must find a stamped
// checklist regardless of which page or frame a designer moved it into.
async function findExistingChecklists(
  targetId: string,
): Promise<Array<{ frame: FrameNode; stamp: ChecklistStamp }>> {
  await figma.loadAllPagesAsync();
  const matches: Array<{ frame: FrameNode; stamp: ChecklistStamp }> = [];
  for (const frame of figma.root.findAllWithCriteria({ types: ["FRAME"] })) {
    const raw = frame.getPluginData(PLUGIN_DATA_KEY);
    if (!raw) continue;
    try {
      const stamp = JSON.parse(raw) as ChecklistStamp;
      if (stamp.targetId === targetId) {
        matches.push({ frame, stamp });
      }
    } catch {
      // Not a checklist stamp we understand — ignore.
    }
  }
  return matches;
}

/**
 * A remembered anchor id may now point at something unplaceable — a deleted
 * node returns null, and a page/document has no bounding box to sit beside.
 */
function isPlaceableAnchor(node: BaseNode): node is SceneNode {
  return (
    node.type !== "PAGE" &&
    node.type !== "DOCUMENT" &&
    "absoluteBoundingBox" in node
  );
}

/** Walks up from `node` to the PageNode it lives on. */
function pageOf(node: BaseNode): PageNode {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE") {
    current = current.parent;
  }
  return (current as PageNode | null) ?? figma.currentPage;
}

function statusChip(label: string, hex: string): FrameNode {
  const chip = autoLayout(`chip — ${label}`, "HORIZONTAL", 10, 4, 0);
  chip.cornerRadius = 999;
  chip.counterAxisAlignItems = "CENTER";
  fill(chip, hex, 0.16);
  chip.appendChild(text(label, 11, FONT_BOLD, hex));
  return chip;
}

function summaryLine(counts: ChecklistReport["counts"]): string {
  const parts = [
    `${counts.pass} pass`,
    `${counts.warn} warn`,
    `${counts.fail} fail`,
    `${counts.manual} manual`,
  ];
  // Only shown when non-zero: these are the ordinary-case-empty buckets, and a
  // run of "0 pending · 0 n/a · 0 skipped" is noise on most sets. But when they
  // do have rows they must appear, or the line tallies fewer than the 19 rows
  // printed directly beneath it - an asset set reads 15 with four rows
  // n/a (#126).
  if (counts.notImplemented > 0) parts.push(`${counts.notImplemented} pending`);
  if (counts.notApplicable > 0) parts.push(`${counts.notApplicable} n/a`);
  if (counts.notRun > 0) parts.push(`${counts.notRun} skipped`);
  // Partial rows still owe human work despite having a status chip, so a
  // summary that omitted them could read "0 manual" with work still to do.
  if (counts.partial > 0) parts.push(`${counts.partial} partly manual`);
  return parts.join(" · ");
}

const SEVERITY_COLOR: Record<SeverityLevel, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#6B7280",
};

// Caps distinct finding *kinds* shown per row — per-node repeats already
// collapse via groupFindings, but a set with many genuinely distinct kinds
// could still grow a row without limit otherwise.
const MAX_FINDING_GROUPS = 8;

/** Indent for the detail lines under a row, aligning them past the item number. */
const DETAIL_INDENT = 36;

/**
 * Build a finding line (`×count  message`) and append it to `parent`. The label
 * wraps instead of overflowing the card: Figma only honours `FILL` once the
 * node has an auto-layout parent whose own cross-size is fixed, so we parent the
 * line first, fix its width to the parent, and only then let the label fill it.
 */
function appendFindingLine(
  parent: FrameNode,
  message: string,
  count: number,
  severity: SeverityLevel,
): void {
  const line = autoLayout("finding", "HORIZONTAL", 0, 6, 8);

  const badge = text(`×${count}`, 11, FONT_BOLD, SEVERITY_COLOR[severity]);
  badge.resize(28, badge.height);

  const label = text(message, 11, FONT_REGULAR, MUTED);
  line.appendChild(badge);
  line.appendChild(label);

  parent.appendChild(line);
  line.layoutSizingHorizontal = "FILL";
  label.textAutoResize = "HEIGHT";
  label.layoutSizingHorizontal = "FILL";
}

/**
 * Render `report` as a checklist frame placed next to `anchor` (the instance the
 * run started from, or the resolved component set). Returns the created frame.
 */
export async function renderChecklist(
  report: ChecklistReport,
  anchor: SceneNode,
  /**
   * True when the caller expressed real placement intent — an explicit
   * `anchorNodeId`, or a target that is a *placed* node rather than the
   * component set itself. Only then does a rebuild move an existing checklist;
   * otherwise it stays where it is. See the placement block below.
   */
  relocate = false,
): Promise<FrameNode> {
  await loadRenderFonts();

  const root = autoLayout(
    `QA Checklist — ${report.target.name}`,
    "VERTICAL",
    24,
    24,
    16,
  );
  root.counterAxisSizingMode = "FIXED";
  root.resize(520, root.height);
  card(root);

  const header = autoLayout("header", "VERTICAL", 0, 0, 4);
  header.layoutAlign = "STRETCH";
  header.appendChild(text(`QA Checklist`, 18, FONT_BOLD, INK));
  header.appendChild(text(report.target.name, 13, FONT_REGULAR, MUTED));
  header.appendChild(text(summaryLine(report.counts), 12, FONT_REGULAR, MUTED));
  root.appendChild(header);

  const rows = autoLayout("rows", "VERTICAL", 0, 0, 0);
  rows.layoutAlign = "STRETCH";
  for (const item of report.items) {
    const itemBlock = autoLayout(`item-${item.n}`, "VERTICAL", 0, 12, 8);
    itemBlock.layoutAlign = "STRETCH";
    itemBlock.strokes = [{ type: "SOLID", color: hexToRgb(ROW_BORDER) }];
    itemBlock.strokeTopWeight = 1;
    itemBlock.strokeBottomWeight = 0;
    itemBlock.strokeLeftWeight = 0;
    itemBlock.strokeRightWeight = 0;
    if (!item.automated) {
      fill(itemBlock, MANUAL_TINT);
    }

    const row = autoLayout(`item-${item.n}-header`, "HORIZONTAL", 0, 0, 12);
    row.counterAxisAlignItems = "CENTER";

    const number = text(String(item.n), 12, FONT_BOLD, MUTED);
    number.resize(24, number.height);

    // Title + blurb stack. Parented before sizing: Figma only honours FILL
    // once the node has an auto-layout parent (same constraint as
    // appendFindingLine), so the blurb can only be told to wrap after the
    // stack is in the row and growing.
    const titleBlock = autoLayout("title", "VERTICAL", 0, 0, 2);
    const title = text(item.title, 13, FONT_REGULAR, INK);
    const blurb = text(item.blurb, 11, FONT_REGULAR, MUTED);
    titleBlock.appendChild(title);
    titleBlock.appendChild(blurb);

    row.appendChild(number);
    row.appendChild(titleBlock);
    titleBlock.layoutGrow = 1;
    blurb.textAutoResize = "HEIGHT";
    blurb.layoutSizingHorizontal = "FILL";
    if (item.automated) {
      const style = statusStyle(item.status);
      row.appendChild(statusChip(style.label, style.hex));
    }
    itemBlock.appendChild(row);
    // Set after parenting, and as `layoutSizingHorizontal` rather than
    // `layoutAlign = "STRETCH"`: for a HORIZONTAL frame the width is its
    // *primary* axis, which STRETCH does not govern, so the row kept hugging its
    // content. Every row then ended at a different width and the chips and
    // chips sat in a ragged diagonal instead of a right-hand column - while
    // the note and finding blocks below them, being VERTICAL, did stretch.
    row.layoutSizingHorizontal = "FILL";

    // What the engine did NOT cover on a partially automated row. With no tick
    // box on the row, this line is the only thing that says the chip speaks for
    // half the item, so it carries the whole weight of that.
    if (item.manualRemainder) {
      const remainderBlock = autoLayout(
        `item-${item.n}-manual-remainder`,
        "VERTICAL",
        0,
        0,
        0,
      );
      remainderBlock.layoutAlign = "STRETCH";
      remainderBlock.paddingLeft = DETAIL_INDENT;
      const remainderText = text(
        `Still manual: ${item.manualRemainder}`,
        11,
        FONT_REGULAR,
        MUTED,
      );
      remainderBlock.appendChild(remainderText);
      remainderText.textAutoResize = "HEIGHT";
      remainderText.layoutSizingHorizontal = "FILL";
      itemBlock.appendChild(remainderBlock);
    }

    // A check's caveat (#8: library origin is unverifiable in-plugin) renders
    // even on a passing row — that is exactly where the reader needs to know
    // the tick rests on partial evidence. On an n/a row the same field carries
    // the reason the check had nothing to evaluate (#129), so the prefix
    // follows the status rather than always reading "Caveat".
    if (item.note) {
      const noteBlock = autoLayout(`item-${item.n}-note`, "VERTICAL", 0, 0, 0);
      noteBlock.layoutAlign = "STRETCH";
      noteBlock.paddingLeft = DETAIL_INDENT;
      const noteText = text(
        `${notePrefix(item.status)}: ${item.note}`,
        11,
        FONT_REGULAR,
        MUTED,
      );
      noteBlock.appendChild(noteText);
      noteText.textAutoResize = "HEIGHT";
      noteText.layoutSizingHorizontal = "FILL";
      itemBlock.appendChild(noteBlock);
    }

    if (item.findings.length > 0) {
      const groups = groupFindings(item.findings);
      const findingsBlock = autoLayout(
        `item-${item.n}-findings`,
        "VERTICAL",
        0,
        0,
        4,
      );
      findingsBlock.layoutAlign = "STRETCH";
      findingsBlock.paddingLeft = DETAIL_INDENT;
      for (const group of groups.slice(0, MAX_FINDING_GROUPS)) {
        appendFindingLine(
          findingsBlock,
          group.message,
          group.count,
          group.severity,
        );
      }
      const overflow = groups.length - MAX_FINDING_GROUPS;
      if (overflow > 0) {
        findingsBlock.appendChild(
          text(
            `+${overflow} more finding kind${overflow === 1 ? "" : "s"}…`,
            11,
            FONT_REGULAR,
            MUTED,
          ),
        );
      }
      itemBlock.appendChild(findingsBlock);
    }

    rows.appendChild(itemBlock);
  }
  root.appendChild(rows);

  // Idempotency keys on the *component set*, but a checklist is rebuilt from
  // many entry points — a designer selecting their instance, an agent passing
  // the set's own id. Without stickiness the second kind silently drags the
  // frame off the instance's page and parks it beside the set, so a rebuild
  // reuses where the frame already lives (and what it was anchored to) unless
  // the caller explicitly asked for a different anchor.
  const existing = await findExistingChecklists(report.target.id);
  let prior: PriorPlacement | null = null;
  if (existing.length > 0) {
    if (existing.length > 1) {
      console.warn(
        `tidy-qa: found ${existing.length} existing checklist frames for ${report.target.id}; deleting all before rebuild`,
      );
    }
    const [first] = existing;
    if (first.frame.parent) {
      prior = {
        parent: first.frame.parent,
        x: first.frame.x,
        y: first.frame.y,
        anchorId: first.stamp.anchorId,
      };
    }
    for (const { frame } of existing) frame.remove();
  }

  const decision = decidePlacement({
    relocate,
    hasPrior: prior !== null,
    rememberedAnchorId: prior?.anchorId,
  });

  let placementAnchor: SceneNode | null =
    decision.kind === "anchor" ? anchor : null;
  if (decision.kind === "remembered") {
    // The remembered node may have been deleted since — fall back to rebuilding
    // in place (or beside this call's anchor if we don't even have a prior).
    const remembered = await figma.getNodeByIdAsync(decision.anchorId);
    if (remembered && isPlaceableAnchor(remembered)) {
      placementAnchor = remembered;
    } else if (!prior) {
      placementAnchor = anchor;
    }
  }

  if (placementAnchor) {
    // Place on the anchor's own page — it may not be figma.currentPage (e.g. a
    // cross-page anchorNodeId) — and switch to it so scrollAndZoomIntoView
    // below (which only works for nodes on the current page) lands on it.
    const page = pageOf(placementAnchor);
    if (page !== figma.currentPage) {
      figma.currentPage = page;
    }
    page.appendChild(root);

    const box = placementAnchor.absoluteBoundingBox;
    if (box) {
      root.x = box.x + box.width + 120;
      root.y = box.y;
    } else {
      // No bounding box (e.g. an empty group) — fall back to the viewport
      // centre rather than silently landing at the frame's default (0, 0).
      const center = figma.viewport.center;
      root.x = center.x;
      root.y = center.y;
    }
  } else if (prior) {
    // Rebuild in place: same parent (which may be a frame the designer dragged
    // it into, not just the page) and same offset within it.
    const page = pageOf(prior.parent);
    if (page !== figma.currentPage) {
      figma.currentPage = page;
    }
    prior.parent.appendChild(root);
    root.x = prior.x;
    root.y = prior.y;
  } else {
    const page = pageOf(anchor);
    if (page !== figma.currentPage) {
      figma.currentPage = page;
    }
    page.appendChild(root);

    const box = anchor.absoluteBoundingBox;
    if (box) {
      root.x = box.x + box.width + 120;
      root.y = box.y;
    } else {
      const center = figma.viewport.center;
      root.x = center.x;
      root.y = center.y;
    }
  }

  root.setPluginData(
    PLUGIN_DATA_KEY,
    JSON.stringify({
      version: 2,
      targetId: report.target.id,
      // Keep the *first* anchor across rebuilds, so an agent run that targets
      // the set doesn't overwrite the designer's instance anchor. An explicit
      // anchorNodeId is a deliberate move, so it does replace it.
      anchorId: relocate ? anchor.id : (prior?.anchorId ?? anchor.id),
      builtAt: Date.now(),
    } satisfies ChecklistStamp),
  );

  figma.viewport.scrollAndZoomIntoView([root]);
  return root;
}
