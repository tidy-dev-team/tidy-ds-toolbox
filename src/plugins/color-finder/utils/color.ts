import { HSL } from "../types";

/**
 * Pure color helpers. No Figma dependency — safe to unit-test directly.
 */

function toByte(v: number): string {
  return Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Convert a Figma RGB (0..1 channels) to an uppercase "#RRGGBB" string. */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/** Convert an uppercase/lowercase "#RRGGBB" hex to HSL (h 0..360, s/l 0..100). */
export function hexToHsl(hex: string): HSL {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}
