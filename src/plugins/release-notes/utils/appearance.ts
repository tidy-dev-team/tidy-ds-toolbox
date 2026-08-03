/**
 * Card Appearance: the font family and background colour a file's cards are
 * drawn with, and the rules that turn that pair into a full palette.
 *
 * Pure on purpose. The background is the only colour a designer picks; the four
 * foreground colours follow from it, so "is this card readable" is a property of
 * this file and is decided by fixture-tested arithmetic rather than by looking
 * at the canvas.
 */

import type { CardAppearance } from "../types";

export interface CardPalette {
  bgSurface: RGB;
  textBold: RGB;
  textMuted: RGB;
  timelineLine: RGB;
}

/** Inter ships with Figma, so it is the one family always available. */
export const FALLBACK_FONT_FAMILY = "Inter";

/**
 * A file with nothing stored. Inter rather than the Kido-only Satoshi: a
 * default nobody can load is a default that always warns.
 */
export const DEFAULT_CARD_APPEARANCE: CardAppearance = {
  fontFamily: FALLBACK_FONT_FAMILY,
  background: "000A19",
};

/** The styles every card draws with. A family missing one cannot be offered. */
export const REQUIRED_FONT_STYLES = ["Regular", "Medium", "Bold"] as const;

const DARK_FOREGROUND = {
  textBold: "EEF3FC",
  textMuted: "8798B2",
  timelineLine: "8798B2",
} as const;

const LIGHT_FOREGROUND = {
  // The dark surface colour, reused: the palette folds onto itself rather than
  // introducing a second near-black.
  textBold: "000A19",
  // Darker than the dark set's muted, which reaches only ~2.7:1 on white and
  // fails AA. This clears ~5.8:1.
  textMuted: "56657D",
  // Decorative rail, not text, so it is not held to a text contrast ratio.
  timelineLine: "C3CDDC",
} as const;

/** Six hex digits, no `#`, as stored. Anything else is not a colour we wrote. */
export function isHexColor(value: string): boolean {
  return /^[0-9A-Fa-f]{6}$/.test(value);
}

/** `"000A19"` to Figma's 0..1 RGB. Callers must pass a validated hex. */
export function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

export function rgbToHex(color: RGB): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/** WCAG relative luminance, 0 for black and 1 for white. */
export function relativeLuminance(color: RGB): number {
  const linear = (value: number) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);

  return (
    0.2126 * linear(color.r) +
    0.7152 * linear(color.g) +
    0.0722 * linear(color.b)
  );
}

/**
 * Which foreground set a background gets.
 *
 * Not a luminance midpoint of 0.5, which would put pale text on a mid grey that
 * reads far better in dark type. The crossover is where black and white
 * contrast equally against the background, ~0.179 by the WCAG ratio, so this
 * always picks the more legible of the two sets.
 */
export function isLightBackground(background: RGB): boolean {
  return relativeLuminance(background) > 0.179;
}

/** WCAG contrast ratio between two colours, 1 for identical and 21 for extremes. */
export function contrastRatio(a: RGB, b: RGB): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for body text. */
const MIN_TEXT_CONTRAST = 4.5;

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 1, g: 1, b: 1 };

/**
 * Whichever of pure black and pure white contrasts better with the background.
 *
 * The universal floor. Their worst case, against a background at the luminance
 * where they tie, is 4.61:1, so this always clears AA whatever a designer picks.
 */
function extremeAgainst(background: RGB): RGB {
  return contrastRatio(WHITE, background) >= contrastRatio(BLACK, background)
    ? WHITE
    : BLACK;
}

/**
 * The four colours a card is drawn with, derived from its background.
 *
 * Two curated sets do not cover the whole space, and picking between them by
 * luminance is not enough on its own. The crossover at 0.179 is where pure black
 * and pure white tie, but the sets use `#EEF3FC` and `#000A19`, neither of which
 * is pure: the dark set holds AA only up to luminance 0.1596 and the light set
 * only from 0.1879, leaving a band in between, nine greys wide, where neither
 * reaches 4.5:1. `#747474` against `#EEF3FC` is 4.20:1.
 *
 * So each colour is checked rather than assumed. A bold colour that misses AA
 * falls back to pure black or white, which always clears it. A muted colour that
 * misses AA falls back to the bold one, because no grey-blue contrasts with a
 * mid grey. Both are visible compromises at backgrounds nobody is likely to
 * choose; text that cannot be read is not a compromise.
 */
export function paletteFor(backgroundHex: string): CardPalette {
  const bgSurface = hexToRgb(backgroundHex);
  const foreground = isLightBackground(bgSurface)
    ? LIGHT_FOREGROUND
    : DARK_FOREGROUND;

  const preferredBold = hexToRgb(foreground.textBold);
  const textBold =
    contrastRatio(preferredBold, bgSurface) >= MIN_TEXT_CONTRAST
      ? preferredBold
      : extremeAgainst(bgSurface);

  const preferredMuted = hexToRgb(foreground.textMuted);
  const textMuted =
    contrastRatio(preferredMuted, bgSurface) >= MIN_TEXT_CONTRAST
      ? preferredMuted
      : textBold;

  return {
    bgSurface,
    textBold,
    textMuted,
    timelineLine: hexToRgb(foreground.timelineLine),
  };
}

/**
 * A stored appearance, repaired. Plugin data is a string a previous build (or a
 * hand edit) wrote, so neither field is trusted: a blank family or a malformed
 * colour falls back to the default rather than drawing something broken.
 */
export function normaliseAppearance(value: unknown): CardAppearance {
  const raw = typeof value === "object" && value !== null ? value : {};
  const record = raw as Record<string, unknown>;

  const fontFamily =
    typeof record.fontFamily === "string" && record.fontFamily.trim()
      ? record.fontFamily.trim()
      : DEFAULT_CARD_APPEARANCE.fontFamily;

  const background =
    typeof record.background === "string" && isHexColor(record.background)
      ? record.background.toUpperCase()
      : DEFAULT_CARD_APPEARANCE.background;

  return { fontFamily, background };
}

/**
 * The families worth offering: those carrying every style a card draws with.
 *
 * Figma lists thousands of `{family, style}` pairs, and many families have no
 * Medium. Filtering here rather than at publish time means the picker cannot
 * offer a font that would fall back the moment it is used.
 */
export function usableFamilies(
  available: Array<{ family: string; style: string }>,
): string[] {
  const stylesByFamily = new Map<string, Set<string>>();

  for (const { family, style } of available) {
    const styles = stylesByFamily.get(family) ?? new Set<string>();
    styles.add(style);
    stylesByFamily.set(family, styles);
  }

  return Array.from(stylesByFamily.entries())
    .filter(([, styles]) =>
      REQUIRED_FONT_STYLES.every((required) => styles.has(required)),
    )
    .map(([family]) => family)
    .sort((a, b) => a.localeCompare(b));
}
