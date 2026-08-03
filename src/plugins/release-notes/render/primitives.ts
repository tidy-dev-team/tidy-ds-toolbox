/**
 * The pieces both cards are drawn from: fonts, text, tag badges and the
 * timeline rail. Everything that touches the Figma API for the release-notes
 * design lives in this folder; the decisions behind it (placement, grouping,
 * tag order, which palette a background earns) are pure and tested elsewhere.
 */

import type { CardAppearance, NoteTag } from "../types";
import { TAG_BADGE_BG, TAG_EMOJI, TAG_LABELS } from "../utils/constants";
import {
  FALLBACK_FONT_FAMILY,
  paletteFor,
  type CardPalette,
} from "../utils/appearance";

export type Weight = "regular" | "medium" | "bold";

/**
 * A Card Appearance checked against this machine: the family that will actually
 * draw, and the palette its background earns.
 */
export interface ResolvedAppearance {
  family: string;
  /** The family the file asked for, which `family` may not be. */
  requested: string;
  /** True when the file's family was unavailable and Inter was used instead. */
  fallback: boolean;
  palette: CardPalette;
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
 * The file's font if this machine has it, Inter if not.
 *
 * Probed up front, before any node exists, so a missing font can never leave a
 * half-built card on the canvas. The panel only offers families carrying all
 * three styles, so a fallback here means the font is absent on this machine,
 * not that the choice was a bad one.
 */
export async function resolveCardAppearance(
  figma: PluginAPI,
  appearance: CardAppearance,
): Promise<ResolvedAppearance> {
  const palette = paletteFor(appearance.background);
  const requested = appearance.fontFamily;

  try {
    await loadFamily(figma, requested);
    return { family: requested, requested, fallback: false, palette };
  } catch {
    // Inter ships with Figma, so failing to load it too means the font service
    // itself is unreachable, not that a font is missing. Nothing is drawn yet,
    // so name the actual problem: the raw font error says nothing a designer
    // could act on, and the panel shows whatever message comes out of here.
    try {
      await loadFamily(figma, FALLBACK_FONT_FAMILY);
    } catch {
      throw new Error(
        `Could not load ${requested} or ${FALLBACK_FONT_FAMILY}, so nothing was drawn. Check the connection and try again.`,
      );
    }
    return { family: FALLBACK_FONT_FAMILY, requested, fallback: true, palette };
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
  appearance: ResolvedAppearance,
  spec: TextSpec,
): TextNode {
  const node = figma.createText();
  node.fontName = {
    family: appearance.family,
    style: STYLE_BY_WEIGHT[spec.weight],
  };
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

/** The card shell: the file's surface colour, 24pt radius, soft drop shadow. */
export function createCardShell(
  figma: PluginAPI,
  appearance: ResolvedAppearance,
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
  frame.fills = [{ type: "SOLID", color: appearance.palette.bgSurface }];
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
  appearance: ResolvedAppearance,
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
    createText(figma, appearance, {
      characters: TAG_EMOJI[tag],
      weight: "bold",
      size: 14,
      lineHeight: 20,
      color: appearance.palette.textBold,
    }),
  );
  badge.appendChild(
    createText(figma, appearance, {
      characters: TAG_LABELS[tag],
      weight: "bold",
      size: 14,
      lineHeight: 20,
      color: appearance.palette.textBold,
    }),
  );

  return badge;
}

function createDiamond(
  figma: PluginAPI,
  appearance: ResolvedAppearance,
): FrameNode {
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
  shape.fills = [{ type: "SOLID", color: appearance.palette.textMuted }];

  holder.appendChild(shape);
  return holder;
}

/** The rail beside an entry: a diamond, and a line down to the next entry. */
export function createTimeline(
  figma: PluginAPI,
  appearance: ResolvedAppearance,
  isLast: boolean,
): FrameNode {
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

  rail.appendChild(createDiamond(figma, appearance));

  if (!isLast) {
    const line = figma.createRectangle();
    line.name = "timeline-line";
    line.resize(1, 10);
    line.fills = [{ type: "SOLID", color: appearance.palette.timelineLine }];
    line.layoutAlign = "CENTER";
    line.layoutGrow = 1;
    rail.appendChild(line);
  }

  return rail;
}

/**
 * Body copy: 14/24 in the bold text colour, which is what almost every line
 * inside a card is. Weight and line height are the only things that vary, and
 * the size and colour live here so the two cards cannot drift apart on them.
 */
export function createBodyText(
  figma: PluginAPI,
  appearance: ResolvedAppearance,
  characters: string,
  weight: Weight,
  lineHeight = 24,
): TextNode {
  return createText(figma, appearance, {
    characters,
    weight,
    size: 14,
    lineHeight,
    color: appearance.palette.textBold,
  });
}

/**
 * The heading of a section inside a card: "Changelog" on a Subject card, the
 * sprint name on the aggregate. Same row, same type, different words.
 */
export function createSectionTitle(
  figma: PluginAPI,
  appearance: ResolvedAppearance,
  characters: string,
): FrameNode {
  const title = createRow(figma, {
    name: "Title",
    direction: "HORIZONTAL",
    padding: { top: 8, bottom: 8, left: 24, right: 24 },
    stretch: true,
    fixedPrimary: true,
  });
  title.appendChild(
    createText(figma, appearance, {
      characters,
      weight: "medium",
      size: 24,
      lineHeight: 32,
      color: appearance.palette.textBold,
    }),
  );
  return title;
}

/**
 * One log entry: the `main` column, optionally preceded by a timeline rail.
 *
 * Both cards draw an entry this way, and the rail is the only reason their left
 * padding differs - a Subject card indents by 16 because the 27pt rail sits in
 * that gutter, the aggregate by 24 because nothing does. Returning the pair
 * already wired keeps the rail before the column: reversed, the rail draws down
 * the wrong side of the entry.
 */
export function createLogRow(
  figma: PluginAPI,
  spec: { paddingLeft: number; rail?: FrameNode },
): { log: FrameNode; main: FrameNode } {
  const log = createRow(figma, {
    name: "Log",
    direction: "HORIZONTAL",
    padding: { left: spec.paddingLeft, right: 24 },
    stretch: true,
    fixedPrimary: true,
  });

  const main = createRow(figma, {
    name: "main",
    direction: "VERTICAL",
    itemSpacing: 8,
    padding: { top: 4, bottom: 8 },
    grow: true,
  });

  if (spec.rail) log.appendChild(spec.rail);
  log.appendChild(main);

  return { log, main };
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
