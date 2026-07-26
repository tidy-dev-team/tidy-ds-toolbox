/**
 * Colour conversion shared by the QA engine's two figma-touching pieces (the
 * collector and the #17 resolution probe), so there is one definition of what
 * a hex string looks like in a snapshot.
 */

/** Figma's 0–1 RGB channels as an uppercase `#RRGGBB` string (alpha dropped). */
export function toHex(color: RGB | RGBA): string {
  const channel = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}
