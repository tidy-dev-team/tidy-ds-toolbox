import { describe, it, expect } from "vitest";
import {
  rgbaToGrayscale,
  letterboxGrayscale,
  rgbaToLetterboxGrayscale,
  TARGET_SIZE,
} from "./preprocess";

// Build an RGBA buffer of `width*height` pixels, all set to one color.
function solidRgba(
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

describe("rgbaToGrayscale", () => {
  it("maps white→255, black→0", () => {
    expect(
      rgbaToGrayscale(solidRgba(1, 1, [255, 255, 255, 255]), 1, 1)[0],
    ).toBe(255);
    expect(rgbaToGrayscale(solidRgba(1, 1, [0, 0, 0, 255]), 1, 1)[0]).toBe(0);
  });

  it("uses Rec.601 weights (0.299/0.587/0.114)", () => {
    expect(
      rgbaToGrayscale(solidRgba(1, 1, [255, 0, 0, 255]), 1, 1)[0],
    ).toBeCloseTo(76.245, 3);
    expect(
      rgbaToGrayscale(solidRgba(1, 1, [0, 255, 0, 255]), 1, 1)[0],
    ).toBeCloseTo(149.685, 3);
    expect(
      rgbaToGrayscale(solidRgba(1, 1, [0, 0, 255, 255]), 1, 1)[0],
    ).toBeCloseTo(29.07, 3);
  });

  it("ignores the alpha channel (luminance is RGB-only)", () => {
    const opaque = rgbaToGrayscale(
      solidRgba(1, 1, [128, 128, 128, 255]),
      1,
      1,
    )[0];
    const transparent = rgbaToGrayscale(
      solidRgba(1, 1, [128, 128, 128, 0]),
      1,
      1,
    )[0];
    expect(opaque).toBe(transparent);
  });
});

describe("letterboxGrayscale", () => {
  it("returns a TARGET_SIZE×TARGET_SIZE grid", () => {
    const out = letterboxGrayscale(new Float64Array(16 * 16).fill(10), 16, 16);
    expect(out.length).toBe(TARGET_SIZE * TARGET_SIZE);
  });

  it("fills the padding around a non-square image with white (255)", () => {
    // A wide 32×8 source contained into 32×32 leaves white bars top and bottom.
    const gray = new Float64Array(32 * 8).fill(0); // all black content
    const out = letterboxGrayscale(gray, 32, 8, 32);

    // The scaled content is 32×8, centered vertically → offsetY = 12.
    // Top-left corner is padding → white.
    expect(out[0]).toBe(255);
    // Center row is content → black.
    expect(out[16 * 32 + 16]).toBe(0);
    // Bottom-left corner is padding → white.
    expect(out[31 * 32 + 0]).toBe(255);
  });

  it("preserves a square image's content (no padding)", () => {
    const gray = new Float64Array(32 * 32).fill(42);
    const out = letterboxGrayscale(gray, 32, 32, 32);
    expect(Array.from(out).every((v) => v === 42)).toBe(true);
  });

  it("throws when the grayscale length does not match the dimensions", () => {
    expect(() => letterboxGrayscale(new Float64Array(10), 4, 4)).toThrow();
  });
});

describe("rgbaToLetterboxGrayscale", () => {
  it("composes grayscale + letterbox into a 32×32 grid", () => {
    const out = rgbaToLetterboxGrayscale(
      solidRgba(64, 64, [255, 255, 255, 255]),
      64,
      64,
    );
    expect(out.length).toBe(TARGET_SIZE * TARGET_SIZE);
    expect(Array.from(out).every((v) => v === 255)).toBe(true);
  });
});
