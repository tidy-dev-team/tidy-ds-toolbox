/// <reference types="@figma/plugin-typings" />

/**
 * The QA checklist renderer (PRD §7). The single Figma-touching entry point for
 * drawing a ChecklistReport onto the canvas — kept isolated so the visual design
 * can be swapped without touching the checking logic. #92 renders the minimal
 * tracer: a titled card with one row per checklist item, each showing its number,
 * title, and a status chip. Grouped findings (#93), manual checkboxes (#94), and
 * idempotent rebuild (#95) land in sibling tickets; this frame is stamped now so
 * #95 can find and replace it.
 */

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import type { ChecklistReport } from "../types";
import { statusStyle } from "./status-style";

// Local drawing palette — deliberately self-contained (not shared with tidy-doc)
// so the checklist design is independent and swappable per PRD §7.
const INK = "#111827";
const MUTED = "#6B7280";
const CARD = "#FFFFFF";
const BORDER = "#E5E7EB";
const ROW_BORDER = "#F3F4F6";

const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

const PLUGIN_DATA_KEY = "tidy:qa-checklist";

interface ChecklistStamp {
  version: number;
  targetId: string;
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
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

function summaryLine(counts: ChecklistReport["counts"]): string {
  return `${counts.pass} pass · ${counts.warn} warn · ${counts.fail} fail · ${counts.manual} manual · ${counts.notImplemented} pending`;
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
    const row = buildAutoLayoutFrame(`item-${item.n}`, "HORIZONTAL", 0, 12, 12);
    row.layoutAlign = "STRETCH";
    row.counterAxisAlignItems = "CENTER";
    row.strokes = [{ type: "SOLID", color: hexToRgb(ROW_BORDER) }];
    row.strokeTopWeight = 1;
    row.strokeBottomWeight = 0;
    row.strokeLeftWeight = 0;
    row.strokeRightWeight = 0;

    const number = text(String(item.n), 12, FONT_BOLD, MUTED);
    number.resize(24, number.height);

    const title = text(item.title, 13, FONT_REGULAR, INK);
    title.layoutGrow = 1;

    const style = statusStyle(item.status);
    row.appendChild(number);
    row.appendChild(title);
    row.appendChild(statusChip(style.label, style.hex));
    rows.appendChild(row);
  }
  root.appendChild(rows);

  const page = figma.currentPage;
  page.appendChild(root);

  const box = anchor.absoluteBoundingBox;
  if (box) {
    root.x = box.x + box.width + 120;
    root.y = box.y;
  }

  root.setPluginData(
    PLUGIN_DATA_KEY,
    JSON.stringify({
      version: 1,
      targetId: report.target.id,
    } satisfies ChecklistStamp),
  );

  figma.viewport.scrollAndZoomIntoView([root]);
  return root;
}
