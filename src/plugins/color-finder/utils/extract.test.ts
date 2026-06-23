import { describe, expect, it } from "vitest";
import { robustExtractPalette, robustExtractWithSummary } from "./extract";
import type { SourceNodeRef } from "../types";

function source(id: string): SourceNodeRef {
  return { id, name: `Node ${id}`, type: "RECTANGLE" };
}

function makeImage(
  imageId: string,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  src?: SourceNodeRef,
) {
  return {
    pixels,
    width,
    height,
    source: src ?? source(imageId),
    imageId,
  };
}

function fillRect(
  arr: Uint8ClampedArray,
  stride: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * stride + x) * 4;
      arr[i] = r;
      arr[i + 1] = g;
      arr[i + 2] = b;
      arr[i + 3] = a;
    }
  }
}

function fillDeterministicTexture(
  arr: Uint8ClampedArray,
  stride: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const localX = x - x0;
      const localY = y - y0;
      const i = (y * stride + x) * 4;
      arr[i] = (localX * 9) & 255;
      arr[i + 1] = (localY * 9) & 255;
      arr[i + 2] = ((localX + localY) * 5) & 255;
      arr[i + 3] = 255;
    }
  }
}

function hexes(result: { hex: string }[]): string[] {
  return result.map((color) => color.hex);
}

describe("robustExtractPalette", () => {
  it("returns flat saturated bands ranked by peak prominence", () => {
    const width = 64;
    const height = 48;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, 16, 255, 0, 0, 255);
    fillRect(pixels, width, 0, 16, width, 32, 0, 0, 255, 255);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      mergeDeltaE: 5,
      topN: 10,
    });

    expect(hexes(result)).toEqual(["#0000FF", "#FF0000"]);
    expect(result[0].coverage).toBeCloseTo(2048 / 3072, 5);
    expect(result[1].coverage).toBeCloseTo(1024 / 3072, 5);
  });

  it("rejects deterministic high-diversity photo tiles next to a flat band", () => {
    const width = 64;
    const height = 64;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, 16, 0, 128, 0, 255);
    fillDeterministicTexture(pixels, width, 0, 16, width, 48);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      topN: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0].hex).toMatch(/^#00[0-9A-F]{2}00$/);
    expect(result[0].coverage).toBe(1);
  });

  it("keeps smooth gradients as UI instead of masking them as photos", () => {
    const width = 64;
    const height = 64;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = 120 + Math.floor((x / width) * 12);
        const i = (y * width + x) * 4;
        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
        pixels[i + 3] = 255;
      }
    }

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      topN: 10,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.every((color) => color.hsl.s === 0)).toBe(true);
  });

  it("keeps small saturated accents while dropping equally small neutrals", () => {
    const width = 64;
    const height = 320;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, height, 255, 255, 255, 255);
    fillRect(pixels, width, 0, 0, 16, 16, 255, 0, 0, 255);
    fillRect(pixels, width, 16, 0, 16, 16, 128, 128, 128, 255);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      mergeDeltaE: 5,
      topN: 10,
    });

    expect(hexes(result)).toContain("#FFFFFF");
    expect(hexes(result)).toContain("#FF0000");
    expect(hexes(result)).not.toContain("#818181");
  });

  it("uses per-image prominence instead of global dilution", () => {
    const width = 16;
    const height = 16;
    const red = new Uint8ClampedArray(width * height * 4);
    const whiteA = new Uint8ClampedArray(width * height * 4);
    const whiteB = new Uint8ClampedArray(width * height * 4);

    fillRect(red, width, 0, 0, width, height, 255, 0, 0, 255);
    fillRect(whiteA, width, 0, 0, width, height, 255, 255, 255, 255);
    fillRect(whiteB, width, 0, 0, width, height, 255, 255, 255, 255);

    const result = robustExtractPalette(
      [
        makeImage("red", red, width, height),
        makeImage("white-a", whiteA, width, height),
        makeImage("white-b", whiteB, width, height),
      ],
      { quantBits: 6, mergeDeltaE: 5, topN: 10 },
    );
    const redSwatch = result.find((color) => color.hex === "#FF0000");
    const whiteSwatch = result.find((color) => color.hex === "#FFFFFF");

    expect(redSwatch?.coverage).toBe(1);
    expect(whiteSwatch?.coverage).toBe(1);
  });

  it("keeps an accent diluted below accentKeep by a tall host image (absolute floor)", () => {
    // Regression: the same-size accent must survive whether it sits in a short
    // or a tall screenshot. Here the bar's per-image *fraction* (256 / 102400 ≈
    // 0.0025) is below accentKeep (0.003), but its absolute pixel count (256) is
    // above accentMinPixels, so it must be kept rather than dropped for the crime
    // of living in a large capture.
    const width = 128;
    const height = 800;
    const pixels = new Uint8ClampedArray(width * height * 4);
    fillRect(pixels, width, 0, 0, width, height, 255, 255, 255, 255);
    fillRect(pixels, width, 0, 0, width, 2, 236, 158, 87, 255); // 256px orange bar

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      mergeDeltaE: 5,
      topN: 10,
    });

    const orange = result.find((c) => c.coverage < 0.003 && c.hsl.s > 0);
    expect(orange).toBeDefined();
    expect(hexes(result)).toContain("#FFFFFF");
  });

  it("still drops a saturated speck below both the fraction and pixel floors", () => {
    // The absolute floor must not become a backdoor for noise: an accent that is
    // both a tiny fraction AND below accentMinPixels stays filtered.
    const width = 128;
    const height = 800;
    const pixels = new Uint8ClampedArray(width * height * 4);
    fillRect(pixels, width, 0, 0, width, height, 255, 255, 255, 255);
    fillRect(pixels, width, 0, 0, 8, 8, 236, 158, 87, 255); // 64px speck < 150

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      mergeDeltaE: 5,
      topN: 10,
      accentMinPixels: 150,
    });

    expect(result.every((c) => c.hsl.s === 0)).toBe(true);
  });

  it("ranks a vivid accent above an equally-prominent low-chroma colour", () => {
    // Selection is by salience (prominence + Lab chroma), not raw area. Two bands
    // of identical size: the chromatic one must sort ahead of the muted one so it
    // is not the one sacrificed to the topN cut.
    const width = 64;
    const height = 96;
    const pixels = new Uint8ClampedArray(width * height * 4);
    fillRect(pixels, width, 0, 0, width, 48, 0x20, 0x66, 0x4a, 255); // vivid green
    fillRect(pixels, width, 0, 48, width, 48, 0xad, 0xb5, 0xc5, 255); // muted blue-grey

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      mergeDeltaE: 5,
      topN: 10,
    });

    const greenIdx = result.findIndex((c) => c.hsl.h > 120 && c.hsl.h < 180);
    const mutedIdx = result.findIndex((c) => c.hsl.h >= 180 && c.hsl.h < 260);
    expect(greenIdx).toBeGreaterThanOrEqual(0);
    expect(mutedIdx).toBeGreaterThanOrEqual(0);
    expect(greenIdx).toBeLessThan(mutedIdx);
  });

  it("merges near Delta E colors into one swatch", () => {
    const width = 64;
    const height = 32;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, 16, 220, 40, 40, 255);
    fillRect(pixels, width, 0, 16, width, 16, 222, 38, 42, 255);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      mergeDeltaE: 6,
      quantBits: 6,
      topN: 10,
    });

    expect(result).toHaveLength(1);
  });

  it("does not merge distant colors", () => {
    const width = 64;
    const height = 32;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, 16, 255, 0, 0, 255);
    fillRect(pixels, width, 0, 16, width, 16, 0, 0, 255, 255);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      mergeDeltaE: 6,
      quantBits: 6,
      topN: 10,
    });

    expect(hexes(result).sort()).toEqual(["#0000FF", "#FF0000"]);
  });

  it("ignores transparent pixels", () => {
    const width = 16;
    const height = 16;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, height, 255, 0, 0, 10);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      alphaThreshold: 64,
      topN: 10,
    });

    expect(result).toEqual([]);
  });

  it("returns an empty palette for fully high-diversity input", () => {
    const width = 64;
    const height = 64;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillDeterministicTexture(pixels, width, 0, 0, width, height);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      topN: 10,
    });

    expect(result).toEqual([]);
  });

  it("accumulates foundIn references across images for a shared color", () => {
    const width = 16;
    const height = 16;
    const a = new Uint8ClampedArray(width * height * 4);
    const b = new Uint8ClampedArray(width * height * 4);

    fillRect(a, width, 0, 0, width, height, 255, 0, 0, 255);
    fillRect(b, width, 0, 0, width, height, 255, 0, 0, 255);

    const result = robustExtractPalette(
      [
        makeImage("img-a", a, width, height, source("node-a")),
        makeImage("img-b", b, width, height, source("node-b")),
      ],
      { quantBits: 6, topN: 10 },
    );

    expect(result).toHaveLength(1);
    expect(result[0].foundIn.map((item) => item.id).sort()).toEqual([
      "node-a",
      "node-b",
    ]);
  });

  it("respects the topN cap", () => {
    const width = 64;
    const height = 80;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, 16, 255, 0, 0, 255);
    fillRect(pixels, width, 0, 16, width, 16, 0, 255, 0, 255);
    fillRect(pixels, width, 0, 32, width, 16, 0, 0, 255, 255);
    fillRect(pixels, width, 0, 48, width, 16, 255, 255, 0, 255);
    fillRect(pixels, width, 0, 64, width, 16, 255, 0, 255, 255);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      mergeDeltaE: 5,
      topN: 3,
    });

    expect(result).toHaveLength(3);
  });

  it("returns valid hex, HSL ranges, and bounded coverage", () => {
    const width = 16;
    const height = 16;
    const pixels = new Uint8ClampedArray(width * height * 4);

    fillRect(pixels, width, 0, 0, width, height, 100, 150, 200, 255);

    const result = robustExtractPalette([makeImage("a", pixels, width, height)], {
      quantBits: 6,
      topN: 5,
    });

    expect(result).toHaveLength(1);
    expect(result[0].hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(result[0].hsl.h).toBeGreaterThanOrEqual(0);
    expect(result[0].hsl.h).toBeLessThanOrEqual(360);
    expect(result[0].hsl.s).toBeGreaterThanOrEqual(0);
    expect(result[0].hsl.s).toBeLessThanOrEqual(100);
    expect(result[0].hsl.l).toBeGreaterThanOrEqual(0);
    expect(result[0].hsl.l).toBeLessThanOrEqual(100);
    expect(result[0].coverage).toBeGreaterThan(0);
    expect(result[0].coverage).toBeLessThanOrEqual(1);
  });

  it("handles empty and zero-area inputs gracefully", () => {
    expect(robustExtractPalette([])).toEqual([]);
    expect(
      robustExtractPalette([makeImage("zero", new Uint8ClampedArray(0), 0, 0)]),
    ).toEqual([]);
  });

  it("reports summary counts for contributed and fully masked images", () => {
    const width = 64;
    const height = 16;
    const flat = new Uint8ClampedArray(width * height * 4);
    const texture = new Uint8ClampedArray(width * height * 4);

    fillRect(flat, width, 0, 0, width, height, 100, 200, 100, 255);
    fillDeterministicTexture(texture, width, 0, 0, width, height);

    const result = robustExtractWithSummary(
      [
        makeImage("flat", flat, width, height, source("node-1")),
        makeImage("texture", texture, width, height, source("node-2")),
      ],
      { quantBits: 6, topN: 10 },
    );

    expect(result.summary.imagesContributed).toBe(1);
    expect(result.summary.imagesMasked).toBe(1);
    expect(result.summary.photoTilesMasked).toBeGreaterThan(0);
    expect(result.palette.length).toBeGreaterThan(0);
  });
});
