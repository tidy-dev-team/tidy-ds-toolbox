/// <reference types="@figma/plugin-typings" />

/**
 * Shared drawing primitives for the QA render layer.
 *
 * Extracted from renderChecklist when #121 added a second frame to draw (the
 * per-mode showcase): the alternative was a second copy of `fill`, `text`,
 * `autoLayout` and the palette, which would then drift apart visually.
 *
 * Deliberately self-contained rather than shared with tidy-doc, per PRD §7, so
 * the checklist's visual design stays independent and swappable.
 */

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";

export const INK = "#111827";
export const MUTED = "#6B7280";
export const CARD = "#FFFFFF";
export const BORDER = "#E5E7EB";
export const ROW_BORDER = "#F3F4F6";
/**
 * Manual rows. A very light blue rather than the near-white grey it used to be:
 * with the tick boxes gone, the tint is the only thing marking these rows, and
 * #FAFAFA against #FFFFFF was too faint to read as deliberate. Blue also reads
 * as "yours to do" rather than as another status, which the greys are for.
 */
export const MANUAL_TINT = "#EFF6FF";

export const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
export const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };

/** Load every font the render layer draws with. */
export async function loadRenderFonts(): Promise<void> {
  await Promise.all([
    figma.loadFontAsync(FONT_REGULAR),
    figma.loadFontAsync(FONT_BOLD),
  ]);
}

export function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

export function fill(
  node: MinimalFillsMixin,
  hex: string,
  opacity?: number,
): void {
  node.fills = [
    {
      type: "SOLID",
      color: hexToRgb(hex),
      ...(opacity === undefined ? {} : { opacity }),
    },
  ];
}

/**
 * `buildAutoLayoutFrame` leaves Figma's default white fill in place, which is
 * invisible on the white card but paints over `MANUAL_TINT` on a manual row -
 * the tint then survived only in the sliver the row did not cover. Every
 * wrapper frame here is meant to be see-through; the ones that carry a colour
 * (root, a manual row, a chip) set it explicitly afterwards.
 */
export function autoLayout(
  name: string,
  direction: "HORIZONTAL" | "VERTICAL",
  paddingHorizontal: number,
  paddingVertical: number,
  itemSpacing: number,
): FrameNode {
  const frame = buildAutoLayoutFrame(
    name,
    direction,
    paddingHorizontal,
    paddingVertical,
    itemSpacing,
  );
  frame.fills = [];
  return frame;
}

export function text(
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

/** Give a frame a single-colour border. The stroke twin of `fill`. */
export function stroke(node: FrameNode, hex: string, weight = 1): void {
  node.strokes = [{ type: "SOLID", color: hexToRgb(hex) }];
  node.strokeWeight = weight;
}

/**
 * The card chrome both QA frames wear: white, rounded, hairline border. Shared so
 * the checklist and the per-mode block cannot drift apart visually.
 */
export function card(node: FrameNode, radius = 12): void {
  fill(node, CARD);
  stroke(node, BORDER);
  node.cornerRadius = radius;
}

/**
 * A frame as a PNG data URL, at the one scale both QA images use.
 *
 * 2x because the finding lines are 10-11px: at 1x they are the size where a
 * vision model stops being able to read them, which would make the image
 * decorative. Shared by the checklist image (#146) and the per-mode showcase
 * image (#121) so the two cannot end up rendered at different scales - a
 * difference nobody would notice until one of them became unreadable.
 *
 * The bridge lifts this into a viewable image block by recognising a data URL,
 * not by any field name (#116).
 */
export async function exportPngDataUrl(frame: FrameNode): Promise<string> {
  const bytes = await frame.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 2 },
  });
  return `data:image/png;base64,${figma.base64Encode(bytes)}`;
}
