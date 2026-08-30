/// <reference types="@figma/plugin-typings" />

// Chrome builder (ADR-0006, CONTEXT.md "Chrome"): the section card and the
// pieces every Section repeats inside it — a dark title bar, a block's
// `title` group, a bullet list. Raw nodes with literal hex/spacing values —
// no library-component linkage, ever, so a doc page renders the same in a
// file that has none of the design system's helper components published.

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
  white: "#FFFFFF",
  border: "#E5E7EB",
  marker: "#8B5CF6",
  good: "#16A34A",
  bad: "#DC2626",
  brand: "#202257",
  black: "#000000",
  // Horizontal-layout chrome (#215): the section card's dark title bar, the
  // tinted ground a Do/Don't specimen sits on, and the two verdict hues.
  // `white` above is named for the colour rather than the card, because it
  // is already also a text colour (a pill label, the title bar's heading) —
  // and one hex may carry only one name here, which buildChrome.test asserts.
  // `good`/`bad` above are the parked vertical layout's inline glyph colours
  // and are deliberately left alone — the two layouts draw different marks.
  headerBar: "#101820",
  specimenGround: "#F7F7F7",
  verdictGood: "#41AD46",
  verdictBad: "#E02020",
} as const;

export const FONT_REGULAR: FontName = { family: "Inter", style: "Regular" };
export const FONT_BOLD: FontName = { family: "Inter", style: "Bold" };
export const FONT_SEMIBOLD: FontName = { family: "Inter", style: "Semi Bold" };

/**
 * The horizontal layout's type scale and rhythm (#215), in one place.
 *
 * Every number here was measured off the approved reference page rather than
 * chosen: a section card is a dark 40px title bar over a 24-padded body, one
 * Section's blocks stand 60 apart, a block's own `title` group stands 24 from
 * the specimens it introduces, and the lines inside that group stand 8 apart.
 * Builders read these instead of repeating literals, so the rhythm changes in
 * one edit the way TOKENS changes a colour.
 */
export const DOC_SCALE = {
  /** Section title in the dark bar. */
  sectionTitle: 40,
  /** A block's own heading — a variant family, an anatomy fact, a sibling. */
  blockTitle: 18,
  /** A Do/Don't row's heading, which sits in a narrower column. */
  rowTitle: 16,
  /** Descriptions, captions, bullets, specimen labels. */
  body: 14,
  /** The label under a state specimen. */
  caption: 10,
} as const;

export const DOC_SPACING = {
  /** Card padding, and the gap between cards on the page. */
  card: 24,
  /** Between the blocks of one Section. */
  section: 60,
  /** Between a block's `title` group and its specimens. */
  block: 24,
  /** Between the lines of a `title` group. */
  title: 8,
  /** Between bullets in a list. */
  bullet: 4,
} as const;

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
 * A block's `title` group: a heading over zero or more description lines,
 * the pattern every Section repeats (a variant family, an anatomy fact, a
 * Do/Don't row, a related sibling).
 *
 * It exists as a frame rather than as loose children because a block's own
 * rhythm is two-level — 8 between the lines that introduce the block, 24
 * between the whole introduction and the specimens under it. Appending the
 * lines straight onto the block would flatten that to a single gap, which is
 * what the pre-#215 output did.
 *
 * Callers may append further children (a bullet list, an extra fact line);
 * they land inside the group, on the 8 rhythm.
 */
export async function buildTitleBlock(
  name: string,
  heading: string,
  descriptions: string[] = [],
  headingSize: number = DOC_SCALE.blockTitle,
): Promise<FrameNode> {
  const frame = buildAutoLayoutFrame(name, "VERTICAL", 0, 0, DOC_SPACING.title);
  frame.appendChild(
    await createText(heading, headingSize, FONT_SEMIBOLD, TOKENS.ink),
  );
  for (const description of descriptions) {
    frame.appendChild(
      await createText(
        description,
        DOC_SCALE.body,
        FONT_REGULAR,
        TOKENS.mutedDark,
      ),
    );
  }
  return frame;
}

/** A bulleted list, on its own tighter rhythm inside a `title` group. */
export async function buildBulletList(
  name: string,
  items: string[],
  hex: string = TOKENS.muted,
): Promise<FrameNode> {
  const list = buildAutoLayoutFrame(name, "VERTICAL", 0, 0, DOC_SPACING.bullet);
  for (const item of items) {
    list.appendChild(
      await createText(`• ${item}`, DOC_SCALE.body, FONT_REGULAR, hex),
    );
  }
  return list;
}

/**
 * One Section's Chrome: a white card whose title sits in a full-width dark
 * bar, over a 24-padded body ready to receive Section content.
 *
 * The bar carries the Section title and nothing else. It used to also carry
 * the source component's name and the Doc Spec's status pill; both are gone
 * (#215). The name repeated on all five cards what the page frame already
 * says once, and the status was five copies of a single fact about the
 * component rather than anything about the Section under it. `status` stays
 * in the Doc Spec, and the parked vertical layout still draws it once, in
 * buildVerticalHeader — which is where a per-page fact belongs.
 */
export async function buildSectionCard(
  name: string,
  title: string,
): Promise<{ card: FrameNode; body: FrameNode }> {
  const card = buildAutoLayoutFrame(name, "VERTICAL", 0, 0, 0);
  fill(card, TOKENS.white);
  stroke(card, TOKENS.border);
  card.strokeWeight = 1;
  card.cornerRadius = 12;
  // The one frame on the doc canvas that clips: the title bar is a filled
  // rectangle running to the card's edges, so without this its square
  // corners sit proud of the card's 12px radius.
  card.clipsContent = true;

  const header = buildAutoLayoutFrame(
    `${name} — header`,
    "HORIZONTAL",
    DOC_SPACING.card,
    DOC_SPACING.card,
    0,
  );
  fill(header, TOKENS.headerBar);
  header.counterAxisAlignItems = "CENTER";
  // Run the bar the full width of the card, however wide the body hugs to.
  // STRETCH alone is not enough and the bar still hugged its own title: the
  // header is HORIZONTAL, so its width is its *primary* axis, and that axis
  // defaults to AUTO. Fixing it is what lets the parent's width win — the
  // same pairing buildSizeSeparator needs, for the same reason.
  header.layoutAlign = "STRETCH";
  header.primaryAxisSizingMode = "FIXED";
  header.appendChild(
    await createText(
      title,
      DOC_SCALE.sectionTitle,
      FONT_SEMIBOLD,
      TOKENS.white,
    ),
  );

  const body = buildAutoLayoutFrame(
    `${name} — body`,
    "VERTICAL",
    DOC_SPACING.card,
    DOC_SPACING.card,
    0,
  );

  card.appendChild(header);
  card.appendChild(body);

  return { card, body };
}
