/// <reference types="@figma/plugin-typings" />

// Chrome builder (ADR-0006, CONTEXT.md "Chrome"): card frame + header (icon +
// section title + component-name subtitle + status-badge pill). Raw nodes
// with literal hex/spacing values — no library-component linkage, ever.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { STATUS_BADGE } from "./statusBadge";
import type { DocStatus } from "./docSpec";

// Doc-canvas colour scale (#73): the single home for every hex literal drawn
// by a tidy-doc section builder. Call sites import TOKENS.<name> instead of
// repeating a hex string, so the scale changes in one place.
export const TOKENS = {
  ink: "#111827",
  muted: "#6B7280",
  mutedDark: "#4B5563",
  faint: "#9CA3AF",
  card: "#FFFFFF",
  border: "#E5E7EB",
  marker: "#8B5CF6",
  good: "#16A34A",
  bad: "#DC2626",
  brand: "#202257",
  black: "#000000",
} as const;

export const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
export const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

// Vertical-layout section title, matching the original DS docs' `dsc-title`:
// Heebo SemiBold 40px in #202257 with a full-width 4px bottom rule.
const SECTION_TITLE_FONT: FontName = { family: "Heebo", style: "SemiBold" };
const SECTION_TITLE_SIZE = 40;
const SECTION_TITLE_DIVIDER_THICKNESS = 4;

// The doc canvas's one hexToRgb — every fill/stroke on the canvas routes
// through paint()/fill()/stroke() below, which route through this.
function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

export function paint(hex: string, opacity?: number): SolidPaint {
  return {
    type: "SOLID",
    color: hexToRgb(hex),
    ...(opacity === undefined ? {} : { opacity }),
  };
}

export function fill(
  node: MinimalFillsMixin,
  hex: string,
  opacity?: number,
): void {
  node.fills = [paint(hex, opacity)];
}

export function stroke(node: MinimalStrokesMixin, hex: string): void {
  node.strokes = [paint(hex)];
}

export async function createText(
  content: string,
  fontSize: number,
  font: FontName = FONT_REGULAR,
  hex: string = TOKENS.ink,
): Promise<TextNode> {
  await figma.loadFontAsync(font);
  const text = figma.createText();
  text.fontName = font;
  text.fontSize = fontSize;
  text.characters = content;
  fill(text, hex);
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
  fill(pill, style.hex, 0.16);
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
    TOKENS.brand,
  );
  frame.appendChild(text);

  const divider = figma.createRectangle();
  divider.name = "section-title — divider";
  divider.resize(text.width, SECTION_TITLE_DIVIDER_THICKNESS);
  fill(divider, TOKENS.brand);
  divider.layoutAlign = "STRETCH";
  frame.appendChild(divider);

  return frame;
}

// Internal size-group separator, matching the original DS docs' `dsc-subtitle`:
// a centered Heebo Bold 16 label flanked by full-width 2px black rules.
const SIZE_SEPARATOR_LINE_THICKNESS = 2;
const SIZE_SEPARATOR_LINE_MIN = 16;

function separatorLine(): RectangleNode {
  const line = figma.createRectangle();
  line.name = "size-separator — line";
  line.resize(SIZE_SEPARATOR_LINE_MIN, SIZE_SEPARATOR_LINE_THICKNESS);
  fill(line, TOKENS.black);
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
    await createText(
      label,
      16,
      { family: "Heebo", style: "Bold" },
      TOKENS.black,
    ),
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
  fill(card, TOKENS.card);
  stroke(card, TOKENS.border);
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
  const subtitleText = await createText(
    subtitle,
    13,
    FONT_REGULAR,
    TOKENS.muted,
  );
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
