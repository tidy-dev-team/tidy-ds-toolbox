/// <reference types="@figma/plugin-typings" />

import {
  ColorInventory,
  ColorRole,
  InventoryColor,
  InventorySection,
} from "../types";

/**
 * Figma-bound page builder. Turns a (pure) ColorInventory model into an
 * auto-layout page. Verified manually in Figma, not unit-tested.
 */

const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

const INK = { r: 0.067, g: 0.094, b: 0.153 }; // #111827
const MUTED = { r: 0.612, g: 0.639, b: 0.686 }; // #9ca3af
const BORDER = { r: 0.898, g: 0.906, b: 0.922 }; // #e5e7eb

const ROLE_LABELS: Record<ColorRole, string> = {
  background: "Backgrounds",
  text: "Text",
  border: "Borders",
  icon: "Icons",
};

// Column widths (px) for table cells.
const COL = {
  swatch: 28,
  hex: 96,
  hsl: 120,
  variable: 150,
  style: 150,
  count: 48,
  whereUsed: 280,
  toVariable: 130,
};

export async function buildInventoryPage(
  inventory: ColorInventory,
  scopeLabel: string,
  dateLabel: string,
): Promise<PageNode> {
  await figma.loadFontAsync(FONT_REGULAR);
  await figma.loadFontAsync(FONT_BOLD);

  const page = figma.createPage();
  page.name = `Color Inventory — ${scopeLabel} — ${dateLabel}`;

  const root = figma.createFrame();
  root.name = "Color Inventory";
  root.layoutMode = "VERTICAL";
  root.primaryAxisSizingMode = "AUTO";
  root.counterAxisSizingMode = "AUTO";
  root.itemSpacing = 32;
  root.paddingTop = 40;
  root.paddingBottom = 40;
  root.paddingLeft = 40;
  root.paddingRight = 40;
  root.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  page.appendChild(root);

  root.appendChild(buildSummary(inventory, scopeLabel));

  for (const section of inventory.sections) {
    root.appendChild(buildSection(section));
  }

  return page;
}

function buildSummary(inventory: ColorInventory, scopeLabel: string): FrameNode {
  const { summary } = inventory;
  const frame = verticalFrame("Summary", 8);

  frame.appendChild(text(`Color Inventory — ${scopeLabel}`, 20, FONT_BOLD, INK));

  const totals =
    `${summary.uniqueTotal} unique color${summary.uniqueTotal === 1 ? "" : "s"} — ` +
    `${summary.byRole.background} background, ${summary.byRole.text} text, ${summary.byRole.border} border, ${summary.byRole.icon} icon; ` +
    `${summary.untokenized} untokenized`;
  frame.appendChild(text(totals, 13, FONT_REGULAR, INK));

  const meta =
    `${summary.pagesScanned} page${summary.pagesScanned === 1 ? "" : "s"} scanned` +
    (summary.otherSkipped > 0
      ? ` · ${summary.otherSkipped} gradient/image paint${summary.otherSkipped === 1 ? "" : "s"} skipped`
      : "");
  frame.appendChild(text(meta, 12, FONT_REGULAR, MUTED));

  return frame;
}

function buildSection(section: InventorySection): FrameNode {
  const frame = verticalFrame(ROLE_LABELS[section.role], 12);

  frame.appendChild(
    text(
      `${ROLE_LABELS[section.role]} (${section.colors.length})`,
      15,
      FONT_BOLD,
      INK,
    ),
  );

  const table = verticalFrame(`${section.role}-table`, 0);
  table.appendChild(buildHeaderRow());
  if (section.colors.length === 0) {
    const empty = text("No colors found.", 12, FONT_REGULAR, MUTED);
    table.appendChild(rowWrap(empty));
  } else {
    for (const color of section.colors) {
      table.appendChild(buildColorRow(color));
    }
  }
  frame.appendChild(table);
  return frame;
}

function buildHeaderRow(): FrameNode {
  const row = horizontalRow();
  row.appendChild(cell("", COL.swatch));
  row.appendChild(cell("Hex", COL.hex, FONT_BOLD, MUTED));
  row.appendChild(cell("HSL", COL.hsl, FONT_BOLD, MUTED));
  row.appendChild(cell("Variable", COL.variable, FONT_BOLD, MUTED));
  row.appendChild(cell("Style", COL.style, FONT_BOLD, MUTED));
  row.appendChild(cell("Count", COL.count, FONT_BOLD, MUTED));
  row.appendChild(cell("Where used", COL.whereUsed, FONT_BOLD, MUTED));
  row.appendChild(cell("→ Variable", COL.toVariable, FONT_BOLD, MUTED));
  return row;
}

function buildColorRow(color: InventoryColor): FrameNode {
  const row = horizontalRow();

  // Swatch
  const swatch = figma.createRectangle();
  swatch.resize(20, 20);
  swatch.cornerRadius = 4;
  swatch.fills = [
    {
      type: "SOLID",
      color: hexToRgb(color.hex),
      opacity: color.opacity,
    },
  ];
  swatch.strokes = [{ type: "SOLID", color: BORDER }];
  const swatchCell = cellWrap(COL.swatch);
  swatchCell.appendChild(swatch);
  row.appendChild(swatchCell);

  // Hex (+ opacity if not 100%)
  const hexLabel =
    color.opacity < 1
      ? `${color.hex} · ${Math.round(color.opacity * 100)}%`
      : color.hex;
  row.appendChild(cell(hexLabel, COL.hex, FONT_REGULAR, INK));

  // HSL
  row.appendChild(
    cell(
      `H ${color.hsl.h} S ${color.hsl.s} L ${color.hsl.l}`,
      COL.hsl,
      FONT_REGULAR,
      MUTED,
    ),
  );

  // Variable (empty/"Raw" when not bound to a variable)
  row.appendChild(
    cell(
      color.variableName ?? "Raw",
      COL.variable,
      FONT_REGULAR,
      color.variableName ? INK : MUTED,
    ),
  );

  // Style (color style name, or "—" when none)
  row.appendChild(
    cell(
      color.styleName ?? "—",
      COL.style,
      FONT_REGULAR,
      color.styleName ? INK : MUTED,
    ),
  );

  // Count
  row.appendChild(cell(`×${color.count}`, COL.count, FONT_REGULAR, INK));

  // Where used (node-linked container names)
  row.appendChild(buildWhereUsedCell(color));

  // Empty → Variable cell
  row.appendChild(cell("", COL.toVariable, FONT_REGULAR, INK));

  return row;
}

function buildWhereUsedCell(color: InventoryColor): TextNode {
  const t = text("", 12, FONT_REGULAR, INK);
  // Set HEIGHT auto-resize before resizing width, otherwise the default
  // WIDTH_AND_HEIGHT mode snaps the width back to the content.
  t.textAutoResize = "HEIGHT";
  t.resize(COL.whereUsed, t.height);

  if (color.whereUsed.length === 0) {
    t.characters = "—";
    return t;
  }

  // Build the string, recording [start,end) ranges for each container link.
  const names = color.whereUsed.map((c) => c.name);
  let str = names.join(", ");
  if (color.whereUsedOverflow > 0) {
    str += ` and ${color.whereUsedOverflow} more`;
  }
  t.characters = str;

  let offset = 0;
  color.whereUsed.forEach((container, i) => {
    const start = offset;
    const end = offset + container.name.length;
    try {
      t.setRangeHyperlink(start, end, { type: "NODE", value: container.id });
    } catch {
      // node may not be linkable; leave as plain text
    }
    offset = end + (i < names.length - 1 ? 2 : 0); // ", "
  });

  return t;
}

// --- small builders ---

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

function rowWrap(child: SceneNode): FrameNode {
  const row = horizontalRow();
  row.appendChild(child);
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
