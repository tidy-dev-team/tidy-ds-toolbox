/// <reference types="@figma/plugin-typings" />

import { PaletteColor, PaletteSummary } from "../types";

const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

const INK = { r: 0.067, g: 0.094, b: 0.153 };
const MUTED = { r: 0.612, g: 0.639, b: 0.686 };
const BORDER = { r: 0.898, g: 0.906, b: 0.922 };
const PAGE_BG = { r: 1, g: 1, b: 1 };

const COL = {
  swatch: 28,
  hex: 96,
  hsl: 120,
  coverage: 72,
  foundIn: 280,
};

export async function buildPalettePage(
  palette: PaletteColor[],
  summary: PaletteSummary,
  scopeLabel: string,
): Promise<PageNode> {
  await figma.loadFontAsync(FONT_REGULAR);
  await figma.loadFontAsync(FONT_BOLD);

  const dateLabel = new Date().toISOString().slice(0, 10);
  const page = figma.createPage();
  page.name = `Image Palette — ${scopeLabel} — ${dateLabel}`;

  const root = figma.createFrame();
  root.name = "Image Palette";
  root.layoutMode = "VERTICAL";
  root.primaryAxisSizingMode = "AUTO";
  root.counterAxisSizingMode = "AUTO";
  root.itemSpacing = 24;
  root.paddingTop = 40;
  root.paddingBottom = 40;
  root.paddingLeft = 40;
  root.paddingRight = 40;
  root.fills = [{ type: "SOLID", color: PAGE_BG }];
  page.appendChild(root);

  root.appendChild(buildSummaryFrame(summary, scopeLabel, palette.length));
  root.appendChild(buildPaletteTable(palette));

  return page;
}

function buildSummaryFrame(
  summary: PaletteSummary,
  scopeLabel: string,
  colorCount: number,
): FrameNode {
  const frame = verticalFrame("Summary", 8);

  frame.appendChild(text(`Image Palette — ${scopeLabel}`, 20, FONT_BOLD, INK));

  frame.appendChild(
    text(
      `${colorCount} unique color${colorCount === 1 ? "" : "s"}` +
        ` \u00b7 ${summary.imagesScanned} image${summary.imagesScanned === 1 ? "" : "s"} scanned` +
        (summary.photosMasked > 0
          ? ` \u00b7 ${summary.photosMasked} photographic image${summary.photosMasked === 1 ? "" : "s"} masked`
          : "") +
        (summary.nodesDetected > 0
          ? ` \u00b7 ${summary.nodesDetected} node${summary.nodesDetected === 1 ? "" : "s"} detected`
          : ""),
      13,
      FONT_REGULAR,
      INK,
    ),
  );

  frame.appendChild(
    text(
      `Extracted from raster images on ${new Date().toISOString().slice(0, 10)}`,
      12,
      FONT_REGULAR,
      MUTED,
    ),
  );

  return frame;
}

function buildPaletteTable(palette: PaletteColor[]): FrameNode {
  const frame = verticalFrame("Palette", 0);

  if (palette.length === 0) {
    frame.appendChild(text("No colors extracted.", 12, FONT_REGULAR, MUTED));
    return frame;
  }

  frame.appendChild(buildHeaderRow());

  for (const color of palette) {
    frame.appendChild(buildColorRow(color));
  }

  return frame;
}

function buildHeaderRow(): FrameNode {
  const row = horizontalRow();
  row.appendChild(cell("", COL.swatch));
  row.appendChild(cell("Hex", COL.hex, FONT_BOLD, MUTED));
  row.appendChild(cell("HSL", COL.hsl, FONT_BOLD, MUTED));
  row.appendChild(cell("Coverage", COL.coverage, FONT_BOLD, MUTED));
  row.appendChild(cell("Found in", COL.foundIn, FONT_BOLD, MUTED));
  return row;
}

function buildColorRow(color: PaletteColor): FrameNode {
  const row = horizontalRow();

  const swatch = figma.createRectangle();
  swatch.resize(20, 20);
  swatch.cornerRadius = 4;
  swatch.fills = [{ type: "SOLID", color: hexToRgb(color.hex) }];
  swatch.strokes = [{ type: "SOLID", color: BORDER }];
  const swatchCell = cellWrap(COL.swatch);
  swatchCell.appendChild(swatch);
  row.appendChild(swatchCell);

  row.appendChild(cell(color.hex, COL.hex, FONT_REGULAR, INK));

  row.appendChild(
    cell(
      `H ${color.hsl.h} S ${color.hsl.s} L ${color.hsl.l}`,
      COL.hsl,
      FONT_REGULAR,
      MUTED,
    ),
  );

  row.appendChild(
    cell(
      `${(color.coverage * 100).toFixed(1)}%`,
      COL.coverage,
      FONT_REGULAR,
      INK,
    ),
  );

  row.appendChild(buildFoundInCell(color));

  return row;
}

function buildFoundInCell(color: PaletteColor): TextNode {
  const t = text("", 12, FONT_REGULAR, INK);
  t.textAutoResize = "HEIGHT";
  t.resize(COL.foundIn, t.height);

  if (color.foundIn.length === 0) {
    t.characters = "\u2014";
    return t;
  }

  const names = color.foundIn.map((f) => f.name);
  const str = names.join(", ");
  t.characters = str;

  let offset = 0;
  color.foundIn.forEach((nodeRef, i) => {
    const start = offset;
    const end = offset + nodeRef.name.length;
    try {
      t.setRangeHyperlink(start, end, { type: "NODE", value: nodeRef.id });
    } catch {
      // node may not be linkable; leave as plain text
    }
    offset = end + (i < names.length - 1 ? 2 : 0);
  });

  return t;
}

function verticalFrame(name: string, gap: number): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = gap;
  frame.fills = [];
  return frame;
}

function horizontalRow(): FrameNode {
  const row = figma.createFrame();
  row.name = "row";
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "AUTO";
  row.counterAxisSizingMode = "AUTO";
  row.counterAxisAlignItems = "CENTER";
  row.itemSpacing = 12;
  row.paddingTop = 8;
  row.paddingBottom = 8;
  row.fills = [];
  return row;
}

function cellWrap(width: number): FrameNode {
  const frame = figma.createFrame();
  frame.name = "cell";
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "AUTO";
  frame.counterAxisAlignItems = "CENTER";
  frame.fills = [];
  frame.resize(width, 20);
  return frame;
}

function cell(
  chars: string,
  width: number,
  font: FontName = FONT_REGULAR,
  color: RGB = INK,
): TextNode {
  const t = text(chars, 12, font, color);
  t.textAutoResize = "HEIGHT";
  t.resize(width, t.height);
  return t;
}

function text(
  chars: string,
  size: number,
  font: FontName,
  color: RGB,
): TextNode {
  const t = figma.createText();
  t.fontName = font;
  t.fontSize = size;
  t.characters = chars;
  t.fills = [{ type: "SOLID", color }];
  return t;
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}
