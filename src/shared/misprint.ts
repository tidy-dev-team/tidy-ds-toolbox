/**
 * Single source of truth for the misprint searchability marker (issue #98).
 *
 * The marker is a line appended to a component (set) description so the
 * component stays findable when a designer types its name on a Hebrew keyboard
 * layout. Both the writer (`utilities/utils/misprint.ts`) and the QA
 * `description` check import from here — no duplicated literals.
 *
 * Canonical written form: `----…---- misprint: <scrambled>` — a run of dashes,
 * the label `misprint:`, then the scrambled payload. Detection is tolerant of
 * the dash-prefix length and the label's casing; the payload is compared
 * strictly against a fresh scramble of the node's current name.
 */

/**
 * Keyboard mapping for the misprint scramble: Latin chars → Hebrew keyboard
 * equivalents. Canonical home is here (shared); `utilities/utils/keyboardsMap`
 * re-exports it for backward compatibility.
 */
export const keyboardsMap: Record<string, string> = {
  q: "/",
  w: "'",
  e: "ק",
  r: "ר",
  t: "א",
  y: "ט",
  u: "ו",
  i: "ן",
  o: "ם",
  p: "פ",
  a: "ש",
  s: "ד",
  d: "ג",
  f: "כ",
  g: "ע",
  h: "י",
  j: "ח",
  k: "ל",
  l: "ך",
  z: "ז",
  x: "ס",
  c: "ב",
  v: "ה",
  b: "נ",
  n: "מ",
  m: "צ",
  Q: "/",
  W: "'",
  E: "ק",
  R: "ר",
  T: "א",
  Y: "ט",
  U: "ו",
  I: "ן",
  O: "ם",
  P: "פ",
  A: "ש",
  S: "ד",
  D: "ג",
  F: "כ",
  G: "ע",
  H: "י",
  J: "ח",
  K: "ל",
  L: "ך",
  Z: "ז",
  X: "ס",
  C: "ב",
  V: "ה",
  B: "נ",
  N: "מ",
  M: "צ",
};

/** The canonical marker label line prefix the writer emits (54 dashes + label). */
export const MISPRINT_MARKER =
  "---------------------------------------------------- misprint:";

/** Matches a marker line: optional dash/space prefix, `misprint:` (any case), payload. */
const MARKER_LINE = /^[-\s]*misprint:\s*(.*)$/i;

/**
 * Scramble `name` into its Hebrew-keyboard equivalent (the marker payload).
 * Characters with no mapping pass through unchanged.
 */
export function scrambleName(name: string): string {
  return name
    .split("")
    .map((char) => keyboardsMap[char] ?? char)
    .join("");
}

/** Build the full marker line the writer appends for `name`. */
export function createMisprintText(name: string): string {
  return `${MISPRINT_MARKER} ${scrambleName(name)}`;
}

export interface MisprintMarkerParse {
  /** A marker-shaped line is present (tolerant of prefix/casing). */
  present: boolean;
  /** The payload matches a fresh scramble of the node's current name. */
  correct: boolean;
  /** The payload found on the marker line (when present). */
  actual?: string;
  /** The payload the node's current name should produce (when present). */
  expected?: string;
}

/**
 * Parse `description` for the misprint marker and validate its payload against
 * `expectedName`. Tolerant on detection (case-insensitive label, any dash
 * prefix), strict on content (payload must equal the fresh scramble).
 */
export function parseMisprintMarker(
  description: string,
  expectedName: string,
): MisprintMarkerParse {
  for (const line of description.split("\n")) {
    const match = MARKER_LINE.exec(line.trim());
    if (!match) continue;
    const actual = match[1].trim();
    const expected = scrambleName(expectedName);
    return {
      present: true,
      correct: actual === expected,
      actual,
      expected,
    };
  }
  return { present: false, correct: false };
}
