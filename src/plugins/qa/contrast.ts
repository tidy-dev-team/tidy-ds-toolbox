/**
 * WCAG contrast maths for #16 (issue #103). Pure, hex in / number out, so the
 * whole of it is fixture-testable without the Figma API.
 *
 * Alpha compositing lives here rather than in the check because it is the same
 * kind of thing: colour arithmetic with one correct answer. Figma composites in
 * sRGB space (not linear light), so `compositeOver` interpolates the encoded
 * channels - half black over white is #808080, which is what the file actually
 * shows.
 */

/** WCAG AA for normal text. */
export const AA_NORMAL = 4.5;
/** WCAG AA for large text. */
const AA_LARGE = 3;
/** "Large" in WCAG terms: 18pt, i.e. 24px. */
const LARGE_PX = 24;
/** "Large" for bold text: 14pt, i.e. 18.66px. */
const LARGE_BOLD_PX = 18.66;

interface Channels {
  r: number;
  g: number;
  b: number;
}

/** Parse `#RRGGBB` into 0-255 channels. Returns null for anything malformed. */
function parseHex(hex: string): Channels | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function toHexChannels({ r, g, b }: Channels): string {
  const channel = (v: number) =>
    Math.round(v).toString(16).padStart(2, "0").toUpperCase();
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** WCAG relative luminance from 0-255 sRGB channels. */
function relativeLuminance({ r, g, b }: Channels): number {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG contrast ratio between two opaque colours, 1 to 21.
 *
 * Both arguments must already be composited to opacity - a translucent colour
 * has no contrast ratio of its own, only one against whatever shows through.
 * Returns 1 (the no-contrast extreme, which #16 reports) if either hex is
 * unparseable, so a malformed value can never read as a pass.
 */
export function contrastRatio(a: string, b: string): number {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return 1;
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

/** A colour with the alpha it is drawn at. */
export interface Rgba {
  hex: string;
  /** 0-1, already including paint opacity and every enclosing node's opacity. */
  alpha: number;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Source-over compositing: `top` drawn onto `bottom`.
 *
 * The general (translucent-backdrop) form, not just blend-onto-opaque, because
 * both places that need it stack an unknown number of translucent layers: the
 * paint stack on one node, and the chain of ancestor backgrounds behind a text
 * layer. Having one primitive for both means the walk outward is a fold - keep
 * layering until the result is opaque, then stop.
 */
export function layer(top: Rgba, bottom: Rgba): Rgba {
  const fg = parseHex(top.hex);
  const bg = parseHex(bottom.hex);
  const ta = clamp01(top.alpha);
  const ba = clamp01(bottom.alpha);
  if (!fg || !bg) return top;

  const alpha = ta + ba * (1 - ta);
  // A fully transparent result has no colour of its own; keeping the top hex
  // avoids a division by zero and never reaches a ratio, since the caller only
  // measures once alpha is 1.
  if (alpha === 0) return { hex: top.hex, alpha: 0 };

  const mix = (t: number, b: number) => (t * ta + b * ba * (1 - ta)) / alpha;
  return {
    hex: toHexChannels({
      r: mix(fg.r, bg.r),
      g: mix(fg.g, bg.g),
      b: mix(fg.b, bg.b),
    }),
    alpha,
  };
}

/**
 * The AA ratio this text has to clear: 3:1 for large text, 4.5:1 otherwise.
 *
 * An unknown size falls to 4.5:1 deliberately - the stricter threshold is the
 * safe default, since granting large-text leniency on a guess would let real
 * failures through.
 */
export function requiredRatio(
  fontSize: number | undefined,
  bold: boolean,
): number {
  if (fontSize === undefined) return AA_NORMAL;
  if (fontSize >= LARGE_PX) return AA_LARGE;
  if (bold && fontSize >= LARGE_BOLD_PX) return AA_LARGE;
  return AA_NORMAL;
}
