/**
 * The pieces both cards are drawn from: fonts, text, tag badges and the
 * timeline rail. Everything that touches the Figma API for the release-notes
 * design lives in this folder; the decisions behind it (placement, grouping,
 * tag order) are pure and tested elsewhere.
 */

import type { NoteTag } from "../types";
import {
  CARD_FONT_FALLBACK_FAMILY,
  CARD_FONT_FAMILY,
  CARD_PALETTE,
  TAG_BADGE_BG,
  TAG_EMOJI,
  TAG_LABELS,
} from "../utils/constants";

export type Weight = "regular" | "medium" | "bold";

export interface CardFonts {
  family: string;
  /** True when Satoshi was unavailable and Inter was used instead. */
  fallback: boolean;
}

const STYLE_BY_WEIGHT: Record<Weight, string> = {
  regular: "Regular",
  medium: "Medium",
  bold: "Bold",
};

async function loadFamily(figma: PluginAPI, family: string): Promise<void> {
  for (const style of Object.values(STYLE_BY_WEIGHT)) {
    await figma.loadFontAsync({ family, style });
  }
}

/**
 * Satoshi if it is available, Inter if it is not.
 *
 * Probed up front, before any node exists, so a missing font can never leave a
 * half-built card on the canvas. Satoshi has no Semi Bold, so the reference
 * design's Semi Bold maps to Bold (see the grilling notes).
 */
export async function resolveCardFonts(figma: PluginAPI): Promise<CardFonts> {
  try {
    await loadFamily(figma, CARD_FONT_FAMILY);
    return { family: CARD_FONT_FAMILY, fallback: false };
  } catch {
    await loadFamily(figma, CARD_FONT_FALLBACK_FAMILY);
    return { family: CARD_FONT_FALLBACK_FAMILY, fallback: true };
  }
}

export interface TextSpec {
  characters: string;
  weight: Weight;
  size: number;
  lineHeight: number;
  color: RGB;
}

export function createText(
  figma: PluginAPI,
  fonts: CardFonts,
  spec: TextSpec,
): TextNode {
  const node = figma.createText();
  node.fontName = { family: fonts.family, style: STYLE_BY_WEIGHT[spec.weight] };
  node.fontSize = spec.size;
  node.lineHeight = { value: spec.lineHeight, unit: "PIXELS" };
  node.characters = spec.characters;
  node.fills = [{ type: "SOLID", color: spec.color }];
  return node;
}

export interface AutoLayoutSpec {
  name: string;
  direction: "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  stretch?: boolean;
  grow?: boolean;
  /** FIXED on the primary axis means the frame spans its parent's width. */
  fixedPrimary?: boolean;
  counterAlign?: "MIN" | "CENTER" | "MAX";
}

export function createRow(figma: PluginAPI, spec: AutoLayoutSpec): FrameNode {
  const frame = figma.createFrame();
  frame.name = spec.name;
  frame.layoutMode = spec.direction;
  frame.primaryAxisSizingMode = spec.fixedPrimary ? "FIXED" : "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = spec.itemSpacing ?? 0;
  frame.paddingTop = spec.padding?.top ?? 0;
  frame.paddingRight = spec.padding?.right ?? 0;
  frame.paddingBottom = spec.padding?.bottom ?? 0;
  frame.paddingLeft = spec.padding?.left ?? 0;
  frame.fills = [];
  if (spec.stretch) frame.layoutAlign = "STRETCH";
  if (spec.grow) frame.layoutGrow = 1;
  if (spec.counterAlign) frame.counterAxisAlignItems = spec.counterAlign;
  return frame;
}

/** The card shell: dark surface, 24pt radius, soft drop shadow. */
export function createCardShell(
  figma: PluginAPI,
  name: string,
  width: number,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.resize(width, 100);
  frame.paddingTop = 32;
  frame.paddingBottom = 32;
  frame.paddingLeft = 0;
  frame.paddingRight = 0;
  frame.itemSpacing = 0;
  frame.cornerRadius = 24;
  frame.fills = [{ type: "SOLID", color: CARD_PALETTE.bgSurface }];
  frame.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.06 },
      offset: { x: 0, y: 4 },
      radius: 16,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
  return frame;
}

/** Emoji + label pill, tinted per tag. */
export function createTagBadge(
  figma: PluginAPI,
  fonts: CardFonts,
  tag: NoteTag,
): FrameNode {
  const background = TAG_BADGE_BG[tag];

  const badge = figma.createFrame();
  badge.name = "Status Badge";
  badge.layoutMode = "HORIZONTAL";
  badge.primaryAxisSizingMode = "AUTO";
  badge.counterAxisSizingMode = "AUTO";
  badge.counterAxisAlignItems = "CENTER";
  badge.itemSpacing = 4;
  badge.paddingTop = 2;
  badge.paddingBottom = 2;
  badge.paddingLeft = 6;
  badge.paddingRight = 6;
  badge.cornerRadius = 6;
  badge.topLeftRadius = 2;
  badge.fills = [
    {
      type: "SOLID",
      color: { r: background.r, g: background.g, b: background.b },
      opacity: background.a,
    },
  ];

  badge.appendChild(
    createText(figma, fonts, {
      characters: TAG_EMOJI[tag],
      weight: "bold",
      size: 14,
      lineHeight: 20,
      color: CARD_PALETTE.textBold,
    }),
  );
  badge.appendChild(
    createText(figma, fonts, {
      characters: TAG_LABELS[tag],
      weight: "bold",
      size: 14,
      lineHeight: 20,
      color: CARD_PALETTE.textBold,
    }),
  );

  return badge;
}

function createDiamond(figma: PluginAPI): FrameNode {
  const holder = figma.createFrame();
  holder.name = "diamond";
  holder.layoutMode = "VERTICAL";
  holder.primaryAxisSizingMode = "FIXED";
  holder.counterAxisSizingMode = "AUTO";
  holder.primaryAxisAlignItems = "CENTER";
  holder.counterAxisAlignItems = "CENTER";
  holder.resize(11.314, 11.314);
  holder.fills = [];

  const shape = figma.createRectangle();
  shape.name = "diamond-shape";
  shape.resize(8, 8);
  shape.rotation = 45;
  shape.cornerRadius = 1;
  shape.fills = [{ type: "SOLID", color: CARD_PALETTE.textMuted }];

  holder.appendChild(shape);
  return holder;
}

/** The rail beside an entry: a diamond, and a line down to the next entry. */
export function createTimeline(figma: PluginAPI, isLast: boolean): FrameNode {
  const rail = figma.createFrame();
  rail.name = "timeline";
  rail.layoutMode = "VERTICAL";
  rail.primaryAxisSizingMode = "FIXED";
  rail.counterAxisSizingMode = "AUTO";
  rail.counterAxisAlignItems = "CENTER";
  rail.resize(27, 100);
  rail.paddingTop = 12;
  rail.paddingBottom = 12;
  rail.paddingLeft = 8;
  rail.paddingRight = 8;
  rail.itemSpacing = 8;
  rail.fills = [];
  rail.layoutAlign = "STRETCH";

  rail.appendChild(createDiamond(figma));

  if (!isLast) {
    const line = figma.createRectangle();
    line.name = "timeline-line";
    line.resize(1, 10);
    line.fills = [{ type: "SOLID", color: CARD_PALETTE.timelineLine }];
    line.layoutAlign = "CENTER";
    line.layoutGrow = 1;
    rail.appendChild(line);
  }

  return rail;
}

/** "Jul 28, 2026" - the human form, distinct from the CSV's ISO day. */
export function formatCardDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

/**
 * Link the text at `text` to the Subject's node. Pages accept node links the
 * same way component sets do, but a deleted node does not, so a failure here
 * leaves plain text rather than failing the build.
 */
export function linkToNode(node: TextNode, end: number, nodeId: string): void {
  try {
    node.setRangeHyperlink(0, end, { type: "NODE", value: nodeId });
  } catch {
    // Subject no longer exists: the name still reads, it just is not clickable.
  }
}
