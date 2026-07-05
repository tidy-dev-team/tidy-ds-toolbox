/// <reference types="@figma/plugin-typings" />

// Chrome builder (ADR-0006, CONTEXT.md "Chrome"): card frame + header (icon +
// section title + component-name subtitle + status-badge pill). Raw nodes
// with literal hex/spacing values — no library-component linkage, ever.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { STATUS_BADGE } from "./statusBadge";
import type { DocStatus } from "./docSpec";

const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

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

async function buildStatusBadge(status: DocStatus): Promise<FrameNode> {
  const style = STATUS_BADGE[status];
  const pill = buildAutoLayoutFrame(`status-badge — ${status}`, "HORIZONTAL", 10, 4, 6);
  pill.cornerRadius = 999;
  pill.fills = [{ type: "SOLID", color: hexToRgb(style.hex), opacity: 0.16 }];
  pill.counterAxisAlignItems = "CENTER";

  const label = await createText(`${style.emoji} ${status}`, 11, FONT_BOLD, style.hex);
  pill.appendChild(label);
  return pill;
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

  const header = buildAutoLayoutFrame(`${name} — header`, "HORIZONTAL", 0, 0, 12);
  header.counterAxisAlignItems = "CENTER";

  const titleColumn = buildAutoLayoutFrame(`${name} — title`, "VERTICAL", 0, 0, 2);
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
