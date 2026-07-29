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
export const MANUAL_TINT = "#FAFAFA";
export const CHECKBOX_BORDER = "#9CA3AF";

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
 * (root, a manual row, a chip, a checkbox) set it explicitly afterwards.
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
