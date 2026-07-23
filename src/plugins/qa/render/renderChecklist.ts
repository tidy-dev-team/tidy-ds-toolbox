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
  builtAt: number;
}

// Scans every page and every depth, since a rebuild must find a stamped
// checklist regardless of which page or frame a designer moved it into.
async function findExistingChecklists(targetId: string): Promise<FrameNode[]> {
  await figma.loadAllPagesAsync();
  const matches: FrameNode[] = [];
  for (const frame of figma.root.findAllWithCriteria({ types: ["FRAME"] })) {
    const raw = frame.getPluginData(PLUGIN_DATA_KEY);
    if (!raw) continue;
    try {
      const stamp = JSON.parse(raw) as ChecklistStamp;
      if (stamp.targetId === targetId) {
        matches.push(frame);
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
  return `${counts.pass} pass · ${counts.warn} warn · ${counts.fail} fail · ${counts.manual} manual · ${counts.notImplemented} pending`;
}

const SEVERITY_COLOR: Record<SeverityLevel, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#6B7280",
};

/** Lets `node` wrap onto multiple lines by filling its auto-layout parent's width. */
function enableTextWrap(node: TextNode): TextNode {
  node.textAutoResize = "HEIGHT";
  node.layoutSizingHorizontal = "FILL";
  return node;
}

// Caps distinct finding *kinds* shown per row — per-node repeats already
// collapse via groupFindings, but a set with many genuinely distinct kinds
// could still grow a row without limit otherwise.
const MAX_FINDING_GROUPS = 8;

function findingLine(message: string, count: number, severity: SeverityLevel): FrameNode {
  const line = buildAutoLayoutFrame("finding", "HORIZONTAL", 0, 6, 8);
  line.layoutAlign = "STRETCH";

  const badge = text(`×${count}`, 11, FONT_BOLD, SEVERITY_COLOR[severity]);
  badge.resize(28, badge.height);

  const label = text(message, 11, FONT_REGULAR, MUTED);
  line.appendChild(badge);
  line.appendChild(label);
  enableTextWrap(label);
  return line;
}

/**
 * Render `report` as a checklist frame placed next to `anchor` (the instance the
 * run started from, or the resolved component set). Returns the created frame.
 */
export async function renderChecklist(
  report: ChecklistReport,
  anchor: SceneNode,
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
    const itemBlock = buildAutoLayoutFrame(`item-${item.n}`, "VERTICAL", 0, 12, 8);
    itemBlock.layoutAlign = "STRETCH";
    itemBlock.strokes = [{ type: "SOLID", color: hexToRgb(ROW_BORDER) }];
    itemBlock.strokeTopWeight = 1;
    itemBlock.strokeBottomWeight = 0;
    itemBlock.strokeLeftWeight = 0;
    itemBlock.strokeRightWeight = 0;
    if (!item.automated) {
      fill(itemBlock, MANUAL_TINT);
    }

    const row = buildAutoLayoutFrame(`item-${item.n}-header`, "HORIZONTAL", 0, 0, 12);
    row.layoutAlign = "STRETCH";
    row.counterAxisAlignItems = "CENTER";

    const number = text(String(item.n), 12, FONT_BOLD, MUTED);
    number.resize(24, number.height);

    const title = text(item.title, 13, FONT_REGULAR, INK);
    title.layoutGrow = 1;

    row.appendChild(number);
    row.appendChild(title);
    if (item.automated) {
      const style = statusStyle(item.status);
      row.appendChild(statusChip(style.label, style.hex));
    } else {
      row.appendChild(checkbox());
    }
    itemBlock.appendChild(row);

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
      findingsBlock.paddingLeft = 36;
      for (const group of groups.slice(0, MAX_FINDING_GROUPS)) {
        findingsBlock.appendChild(
          findingLine(group.message, group.count, group.severity),
        );
      }
      const overflow = groups.length - MAX_FINDING_GROUPS;
      if (overflow > 0) {
        findingsBlock.appendChild(
          text(`+${overflow} more finding kind${overflow === 1 ? "" : "s"}…`, 11, FONT_REGULAR, MUTED),
        );
      }
      itemBlock.appendChild(findingsBlock);
    }

    rows.appendChild(itemBlock);
  }
  root.appendChild(rows);

  const existing = await findExistingChecklists(report.target.id);
  if (existing.length > 0) {
    if (existing.length > 1) {
      console.warn(
        `tidy-qa: found ${existing.length} existing checklist frames for ${report.target.id}; deleting all before rebuild`,
      );
    }
    for (const frame of existing) frame.remove();
  }

  // Place on the anchor's own page — it may not be figma.currentPage (e.g. a
  // cross-page anchorNodeId) — and switch to it so scrollAndZoomIntoView below
  // (which only works for nodes on the current page) actually lands on it.
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
    // No bounding box (e.g. an empty group) — fall back to the viewport
    // centre rather than silently landing at the frame's default (0, 0).
    const center = figma.viewport.center;
    root.x = center.x;
    root.y = center.y;
  }

  root.setPluginData(
    PLUGIN_DATA_KEY,
    JSON.stringify({
      version: 1,
      targetId: report.target.id,
      builtAt: Date.now(),
    } satisfies ChecklistStamp),
  );

  figma.viewport.scrollAndZoomIntoView([root]);
  return root;
}
