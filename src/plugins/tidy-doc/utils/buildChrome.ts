/// <reference types="@figma/plugin-typings" />

// Chrome builder (ADR-0006, CONTEXT.md "Chrome"): card frame + header (icon +
// section title + component-name subtitle + status-badge pill). Raw nodes
// with literal hex/spacing values — no library-component linkage, ever.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { STATUS_BADGE } from "./statusBadge";
import type { DocStatus } from "./docSpec";

const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

// Vertical-layout section title, matching the original DS docs' `dsc-title`:
// Heebo SemiBold 40px in #202257 with a full-width 4px bottom rule.
const SECTION_TITLE_FONT: FontName = { family: "Heebo", style: "SemiBold" };
const SECTION_TITLE_SIZE = 40;
const SECTION_TITLE_COLOR = "#202257";
const SECTION_TITLE_DIVIDER_THICKNESS = 4;

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

export async function createText(
  content: string,
  fontSize: number,
  font: FontName = FONT_REGULAR,
  hex = "#111827",
): Promise<TextNode> {
  await figma.loadFontAsync(font);
  const text = figma.createText();
  text.fontName = font;
  text.fontSize = fontSize;
  text.characters = content;
  text.fills = [{ type: "SOLID", color: hexToRgb(hex) }];
  return text;
}

export async function buildStatusBadge(status: DocStatus): Promise<FrameNode> {
  const style = STATUS_BADGE[status];
  const pill = buildAutoLayoutFrame(
    `status-badge — ${status}`,
    "HORIZONTAL",
    10,
    4,
    6,
  );
  pill.cornerRadius = 999;
  pill.fills = [{ type: "SOLID", color: hexToRgb(style.hex), opacity: 0.16 }];
  pill.counterAxisAlignItems = "CENTER";

  const label = await createText(
    `${style.emoji} ${status}`,
    11,
    FONT_BOLD,
    style.hex,
  );
  pill.appendChild(label);
  return pill;
}

/**
 * Vertical-layout section title: the heading text over a full-width 4px rule,
 * reproducing the original DS docs' `dsc-title`. Returns a STRETCH-aligned
 * frame so, appended to an auto-layout section, the rule spans the section's
 * full width (the divider itself also STRETCHes to fill the frame).
 */
export async function buildSectionTitle(title: string): Promise<FrameNode> {
  const frame = buildAutoLayoutFrame("section-title", "VERTICAL", 0, 0, 8);
  frame.layoutAlign = "STRETCH";

  const text = await createText(
    title,
    SECTION_TITLE_SIZE,
    SECTION_TITLE_FONT,
    SECTION_TITLE_COLOR,
  );
  frame.appendChild(text);

  const divider = figma.createRectangle();
  divider.name = "section-title — divider";
  divider.resize(text.width, SECTION_TITLE_DIVIDER_THICKNESS);
  divider.fills = [{ type: "SOLID", color: hexToRgb(SECTION_TITLE_COLOR) }];
  divider.layoutAlign = "STRETCH";
  frame.appendChild(divider);

  return frame;
}

// Internal size-group separator, matching the original DS docs' `dsc-subtitle`:
// a centered Heebo Bold 16 label flanked by full-width 2px black rules.
const SIZE_SEPARATOR_COLOR = "#000000";
const SIZE_SEPARATOR_LINE_THICKNESS = 2;
const SIZE_SEPARATOR_LINE_MIN = 16;

function separatorLine(): RectangleNode {
  const line = figma.createRectangle();
  line.name = "size-separator — line";
  line.resize(SIZE_SEPARATOR_LINE_MIN, SIZE_SEPARATOR_LINE_THICKNESS);
  line.fills = [{ type: "SOLID", color: hexToRgb(SIZE_SEPARATOR_COLOR) }];
  line.layoutGrow = 1; // fill the space either side of the centered label
  return line;
}

/**
 * Internal size-group separator: `——— <label> ———`. Returns a STRETCH-aligned
 * horizontal frame so, appended to an auto-layout group, the rules span the
 * full width with the label centered between them.
 */
export async function buildSizeSeparator(label: string): Promise<FrameNode> {
  const frame = buildAutoLayoutFrame("size-separator", "HORIZONTAL", 0, 0, 8);
  frame.layoutAlign = "STRETCH";
  // Fill the parent's width (STRETCH), and fix the primary axis so the flanking
  // rules' layoutGrow actually has room to expand instead of the frame hugging
  // to the label.
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisAlignItems = "CENTER";

  frame.appendChild(separatorLine());
  frame.appendChild(
    await createText(label, 16, { family: "Heebo", style: "Bold" }, SIZE_SEPARATOR_COLOR),
  );
  frame.appendChild(separatorLine());

  return frame;
}

/**
 * One Section's Chrome: a card frame with a header row (title + component
 * subtitle + status badge) ready to receive Section-specific content.
 */
export async function buildSectionCard(
  name: string,
  title: string,
  subtitle: string,
  status: DocStatus,
): Promise<{ card: FrameNode; body: FrameNode }> {
  const card = buildAutoLayoutFrame(name, "VERTICAL", 24, 24, 16);
  card.fills = [{ type: "SOLID", color: hexToRgb("#FFFFFF") }];
  card.strokes = [{ type: "SOLID", color: hexToRgb("#E5E7EB") }];
  card.strokeWeight = 1;
  card.cornerRadius = 12;

  const header = buildAutoLayoutFrame(
    `${name} — header`,
    "HORIZONTAL",
    0,
    0,
    12,
  );
  header.counterAxisAlignItems = "CENTER";

  const titleColumn = buildAutoLayoutFrame(
    `${name} — title`,
    "VERTICAL",
    0,
    0,
    2,
  );
  const titleText = await createText(title, 18, FONT_BOLD);
  const subtitleText = await createText(subtitle, 13, FONT_REGULAR, "#6B7280");
  titleColumn.appendChild(titleText);
  titleColumn.appendChild(subtitleText);

  const badge = await buildStatusBadge(status);

  header.appendChild(titleColumn);
  header.appendChild(badge);

  const body = buildAutoLayoutFrame(`${name} — body`, "VERTICAL", 0, 0, 20);

  card.appendChild(header);
  card.appendChild(body);

  return { card, body };
}
