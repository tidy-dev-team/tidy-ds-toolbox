/// <reference types="@figma/plugin-typings" />

/**
 * The QA checklist renderer (PRD §7). The single Figma-touching entry point for
 * drawing a ChecklistReport onto the canvas — kept isolated so the visual design
 * can be swapped without touching the checking logic. #92 rendered the minimal
 * tracer (one row per item with a status chip); #93 adds grouped finding lines
 * under automated rows with findings; #94 renders the 10 non-automated items as
 * empty tickable checkboxes with a tinted row background instead of a status
 * chip. #95 makes rebuilds idempotent: a prior checklist frame for the same
 * target (found via its plugin-data stamp, mirroring tidy-doc's
 * findExistingDocPages) is deleted before the new one is placed.
 */

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { groupFindings } from "../grouped-findings";
import type { ChecklistReport, SeverityLevel } from "../types";
import { decidePlacement } from "./placement";
import { statusStyle } from "./status-style";

// Local drawing palette — deliberately self-contained (not shared with tidy-doc)
// so the checklist design is independent and swappable per PRD §7.
const INK = "#111827";
const MUTED = "#6B7280";
const CARD = "#FFFFFF";
const BORDER = "#E5E7EB";
const ROW_BORDER = "#F3F4F6";
const MANUAL_TINT = "#FAFAFA";
const CHECKBOX_BORDER = "#9CA3AF";

const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

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

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
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

function fill(node: MinimalFillsMixin, hex: string, opacity?: number): void {
  node.fills = [
    {
      type: "SOLID",
      color: hexToRgb(hex),
      ...(opacity === undefined ? {} : { opacity }),
    },
  ];
}

function text(
  content: string,
  size: number,
  font: FontName,
  hex: string,
): TextNode {
  const node = figma.createText();
  node.fontName = font;
  node.fontSize = size;
  node.characters = content;
  fill(node, hex);
  return node;
}

function statusChip(label: string, hex: string): FrameNode {
  const chip = buildAutoLayoutFrame(`chip — ${label}`, "HORIZONTAL", 10, 4, 0);
  chip.cornerRadius = 999;
  chip.counterAxisAlignItems = "CENTER";
  fill(chip, hex, 0.16);
  chip.appendChild(text(label, 11, FONT_BOLD, hex));
  return chip;
}

/**
 * An empty, tickable checkbox for manual (non-automated) items — a plain
 * bordered square left for the designer to mark up themselves on canvas.
 */
function checkbox(): FrameNode {
  const box = figma.createFrame();
  box.name = "checkbox";
  box.resize(16, 16);
  box.cornerRadius = 4;
  fill(box, CARD);
  box.strokes = [{ type: "SOLID", color: hexToRgb(CHECKBOX_BORDER) }];
  box.strokeWeight = 1.5;
  return box;
}

function summaryLine(counts: ChecklistReport["counts"]): string {
  const base = `${counts.pass} pass · ${counts.warn} warn · ${counts.fail} fail · ${counts.manual} manual · ${counts.notImplemented} pending`;
  // Partial rows carry an unticked box despite having a status chip, so a
  // summary that omitted them could read "0 manual" with work still to do.
  return counts.partial > 0
    ? `${base} · ${counts.partial} partly manual`
    : base;
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
  const line = buildAutoLayoutFrame("finding", "HORIZONTAL", 0, 6, 8);

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
  await Promise.all([
    figma.loadFontAsync(FONT_REGULAR),
    figma.loadFontAsync(FONT_BOLD),
  ]);

  const root = buildAutoLayoutFrame(
    `QA Checklist — ${report.target.name}`,
    "VERTICAL",
    24,
    24,
    16,
  );
  root.counterAxisSizingMode = "FIXED";
  root.resize(520, root.height);
  fill(root, CARD);
  root.strokes = [{ type: "SOLID", color: hexToRgb(BORDER) }];
  root.strokeWeight = 1;
  root.cornerRadius = 12;

  const header = buildAutoLayoutFrame("header", "VERTICAL", 0, 0, 4);
  header.layoutAlign = "STRETCH";
  header.appendChild(text(`QA Checklist`, 18, FONT_BOLD, INK));
  header.appendChild(text(report.target.name, 13, FONT_REGULAR, MUTED));
  header.appendChild(text(summaryLine(report.counts), 12, FONT_REGULAR, MUTED));
  root.appendChild(header);

  const rows = buildAutoLayoutFrame("rows", "VERTICAL", 0, 0, 0);
  rows.layoutAlign = "STRETCH";
  for (const item of report.items) {
    const itemBlock = buildAutoLayoutFrame(
      `item-${item.n}`,
      "VERTICAL",
      0,
      12,
      8,
    );
    itemBlock.layoutAlign = "STRETCH";
    itemBlock.strokes = [{ type: "SOLID", color: hexToRgb(ROW_BORDER) }];
    itemBlock.strokeTopWeight = 1;
    itemBlock.strokeBottomWeight = 0;
    itemBlock.strokeLeftWeight = 0;
    itemBlock.strokeRightWeight = 0;
    if (!item.automated) {
      fill(itemBlock, MANUAL_TINT);
    }

    const row = buildAutoLayoutFrame(
      `item-${item.n}-header`,
      "HORIZONTAL",
      0,
      0,
      12,
    );
    row.layoutAlign = "STRETCH";
    row.counterAxisAlignItems = "CENTER";

    const number = text(String(item.n), 12, FONT_BOLD, MUTED);
    number.resize(24, number.height);

    // Title + blurb stack. Parented before sizing: Figma only honours FILL
    // once the node has an auto-layout parent (same constraint as
    // appendFindingLine), so the blurb can only be told to wrap after the
    // stack is in the row and growing.
    const titleBlock = buildAutoLayoutFrame("title", "VERTICAL", 0, 0, 2);
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
      // A partially automated row keeps its box: the chip speaks only for the
      // half the engine checked, so dropping the box would let a green chip
      // stand for work nobody did.
      if (item.manualRemainder) {
        row.appendChild(checkbox());
      }
    } else {
      row.appendChild(checkbox());
    }
    itemBlock.appendChild(row);

    // What the engine did NOT cover on a partially automated row, spelled out
    // next to the box it left unticked.
    if (item.manualRemainder) {
      const remainderBlock = buildAutoLayoutFrame(
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
    // the tick rests on partial evidence.
    if (item.note) {
      const noteBlock = buildAutoLayoutFrame(
        `item-${item.n}-note`,
        "VERTICAL",
        0,
        0,
        0,
      );
      noteBlock.layoutAlign = "STRETCH";
      noteBlock.paddingLeft = DETAIL_INDENT;
      const noteText = text(`Caveat: ${item.note}`, 11, FONT_REGULAR, MUTED);
      noteBlock.appendChild(noteText);
      noteText.textAutoResize = "HEIGHT";
      noteText.layoutSizingHorizontal = "FILL";
      itemBlock.appendChild(noteBlock);
    }

    if (item.findings.length > 0) {
      const groups = groupFindings(item.findings);
      const findingsBlock = buildAutoLayoutFrame(
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
