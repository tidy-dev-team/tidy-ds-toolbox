import { describe, it, expect } from "vitest";
import {
  rgbaToGrayscale,
  letterboxGrayscale,
  rgbaToLetterboxGrayscale,
  contentBBox,
  cropGrayscale,
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

// An all-white opaque RGBA field.
function whiteField(width: number, height: number): Uint8ClampedArray {
  return solidRgba(width, height, [255, 255, 255, 255]);
}

// Paint a w×h black opaque block at (x0,y0) into an RGBA buffer in place.
function fillBlock(
  buf: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4;
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = 255;
    }
  }
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

describe("contentBBox", () => {
  it("returns null for an all-background image", () => {
    expect(contentBBox(new Float64Array(16 * 16).fill(255), 16, 16)).toBeNull();
  });

  it("finds the tight bounds of a content region", () => {
    // 10×10 white field with a 2×2 black block at (3,4).
    const gray = new Float64Array(10 * 10).fill(255);
    for (let y = 4; y < 6; y++) {
      for (let x = 3; x < 5; x++) {
        gray[y * 10 + x] = 0;
      }
    }
    expect(contentBBox(gray, 10, 10)).toEqual({
      x: 3,
      y: 4,
      width: 2,
      height: 2,
    });
  });

  it("treats near-white (above threshold) as background", () => {
    const gray = new Float64Array(4 * 4).fill(255);
    gray[0] = 251; // just above the 250 default threshold
    expect(contentBBox(gray, 4, 4)).toBeNull();
    gray[0] = 250; // at the threshold counts as content
    expect(contentBBox(gray, 4, 4)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
});

describe("cropGrayscale", () => {
  it("extracts the boxed sub-image", () => {
    const gray = new Float64Array(4 * 4);
    for (let i = 0; i < 16; i++) gray[i] = i; // 0..15 row-major
    const out = cropGrayscale(gray, 4, { x: 1, y: 1, width: 2, height: 2 });
    expect(Array.from(out)).toEqual([5, 6, 9, 10]);
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
    // Entirely background — no content to trim, stays all white.
    expect(Array.from(out).every((v) => v === 255)).toBe(true);
  });

  it("trims native framing so differently-padded glyphs normalize alike", () => {
    // Same 8×8 black glyph, framed two ways inside a 32×32 white field:
    // tightly at the origin vs. centered with wide padding. After the
    // content-bbox trim both letterbox to the identical 32×32 grid.
    const tight = whiteField(32, 32);
    fillBlock(tight, 32, 0, 0, 8, 8);

    const padded = whiteField(32, 32);
    fillBlock(padded, 32, 12, 12, 8, 8);

    const a = rgbaToLetterboxGrayscale(tight, 32, 32);
    const b = rgbaToLetterboxGrayscale(padded, 32, 32);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
