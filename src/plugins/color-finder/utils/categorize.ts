import { ColorRole } from "../types";

/**
 * The mechanical categorization rule: which role table a paint lands in, based
 * on the node type, whether the paint is a fill or a stroke, and whether the
 * node (or an ancestor) is an icon. No semantic guessing. Pure — unit-tested.
 *
 * - any stroke                  → border   (icons keep stroke-as-border)
 * - a fill on an icon node      → icon      (wins over text/background)
 * - a fill on a TEXT node       → text
 * - any other fill              → background
 */
export function roleFor(
  nodeType: string,
  source: "fill" | "stroke",
  isIcon = false,
): ColorRole {
  if (source === "stroke") return "border";
  if (isIcon) return "icon";
  if (nodeType === "TEXT") return "text";
  return "background";
}

// Separators between name segments: slashes, dashes, underscores, dots,
// equals (variant props), commas, and whitespace.
const SEPARATORS = /[\s\-_/.=,]+/;

/**
 * Split a layer name into lowercase tokens, breaking on separators AND
 * camelCase boundaries. "icon/search" → ["icon","search"], "myIconButton" →
 * ["my","icon","button"], "Music/note" → ["music","note"].
 */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → space
    .split(SEPARATORS)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

/**
 * Whether a layer name looks like an icon. Matches a token that contains
 * "icon" (icon, Icons, icon/search), or a token that is exactly "ic" (the
 * ic_/ic-/ic/ short-prefix convention). Tokenizing first means an `ic`-ending
 * word followed by a separator — "Music/note", "Magic-wand", "Epic/hero" —
 * does NOT match. (Silicon/Lexicon, which literally contain "icon", do match;
 * accepted as vanishingly rare in layer names.)
 */
export function isIconName(name: string): boolean {
  return tokenize(name).some((t) => t === "ic" || t.includes("icon"));
}

/** Round paint opacity to a stable precision so float noise doesn't split a
 * single color into multiple inventory rows. */
export function roundOpacity(opacity: number): number {
  return Math.round(opacity * 1000) / 1000;
}
