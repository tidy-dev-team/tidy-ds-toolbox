import { describe, it, expect } from "vitest";
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

describe("robustExtractPalette", () => {
  it("returns flat blocks ranked by coverage", () => {
    const w = 64;
    const h = 48;
    const combined = new Uint8ClampedArray(w * h * 4);

    // Each region fills whole tile-aligned bands (tileSize=16)
    fillRect(combined, w, 0, 0, w, 16, 255, 0, 0, 255); // red: 64×16 = 1024 px
    fillRect(combined, w, 0, 16, w, 32, 0, 0, 255, 255); // blue: 64×32 = 2048 px

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      coverageThreshold: 0,
      topN: 10,
      quantBits: 6,
      mergeDeltaE: 5,
    });

    expect(result.length).toBe(2);
    expect(result[0].coverage).toBeGreaterThan(result[1].coverage);
    // Blue has more pixels, so it should rank first
    expect(result[0].hex).toBe("#0000FF");
    expect(result[1].hex).toBe("#FF0000");
  });

  it("excludes high-variance (noisy) tiles from palette", () => {
    const w = 64;
    const h = 64;
    const combined = new Uint8ClampedArray(w * h * 4);

    // Top half: solid green (tile-aligned)
    fillRect(combined, w, 0, 0, w, 16, 0, 128, 0, 255);

    // Bottom: photographic noise
    for (let y = 16; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        combined[i] = Math.floor(Math.random() * 256);
        combined[i + 1] = Math.floor(Math.random() * 256);
        combined[i + 2] = Math.floor(Math.random() * 256);
        combined[i + 3] = 255;
      }
    }

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      tileSize: 16,
      varianceThreshold: 50,
      coverageThreshold: 0,
      topN: 10,
      quantBits: 6,
    });

    // Only green from the flat tile should appear
    expect(result.length).toBe(1);
    // Quantized green with 6 bits: 128 → round(128/255*63)=32, dequantized: round(32/63*255)=129→#0081
    expect(result[0].hex).toMatch(/^#00/); // green-ish
  });

  it("merges two near-ΔE colors into one swatch", () => {
    const w = 64;
    const h = 32;
    const combined = new Uint8ClampedArray(w * h * 4);

    // Two very similar reds in tile-aligned bands
    fillRect(combined, w, 0, 0, w, 16, 220, 40, 40, 255);
    fillRect(combined, w, 0, 16, w, 16, 222, 38, 42, 255);

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      mergeDeltaE: 5,
      coverageThreshold: 0,
      quantBits: 6,
      topN: 10,
      tileSize: 16,
    });

    expect(result.length).toBe(1);
  });

  it("does not merge two distant colors", () => {
    const w = 64;
    const h = 32;
    const combined = new Uint8ClampedArray(w * h * 4);

    // Red and blue in distinct tile-aligned bands
    fillRect(combined, w, 0, 0, w, 16, 255, 0, 0, 255);
    fillRect(combined, w, 0, 16, w, 16, 0, 0, 255, 255);

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      mergeDeltaE: 5,
      coverageThreshold: 0,
      quantBits: 6,
      topN: 10,
      tileSize: 16,
    });

    expect(result.length).toBe(2);
  });

  it("ignores near-transparent pixels", () => {
    const w = 16;
    const h = 16;
    const combined = new Uint8ClampedArray(w * h * 4);

    fillRect(combined, w, 0, 0, w, h, 255, 0, 0, 10);

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      alphaThreshold: 64,
      topN: 10,
      tileSize: 16,
    });

    expect(result.length).toBe(0);
  });

  it("returns empty palette for fully-photographic (noisy) input", () => {
    const w = 64;
    const h = 64;
    const combined = new Uint8ClampedArray(w * h * 4);

    for (let i = 0; i < w * h * 4; i += 4) {
      combined[i] = Math.floor(Math.random() * 256);
      combined[i + 1] = Math.floor(Math.random() * 256);
      combined[i + 2] = Math.floor(Math.random() * 256);
      combined[i + 3] = 255;
    }

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      tileSize: 16,
      varianceThreshold: 50,
      topN: 10,
    });

    expect(result.length).toBe(0);
  });

  it("accumulates found-in references across sources", () => {
    const w = 16;
    const h = 16;
    const combinedA = new Uint8ClampedArray(w * h * 4);
    const combinedB = new Uint8ClampedArray(w * h * 4);

    fillRect(combinedA, w, 0, 0, w, h, 255, 0, 0, 255);
    fillRect(combinedB, w, 0, 0, w, h, 255, 0, 0, 255);

    const results = robustExtractPalette(
      [
        makeImage("img-a", combinedA, w, h, source("node-a")),
        makeImage("img-b", combinedB, w, h, source("node-b")),
      ],
      { coverageThreshold: 0, topN: 10, tileSize: 16 },
    );

    expect(results.length).toBe(1);
    expect(results[0].foundIn.length).toBe(2);
    expect(results[0].foundIn.map((f) => f.id)).toContain("node-a");
    expect(results[0].foundIn.map((f) => f.id)).toContain("node-b");
  });

  it("respects topN limit", () => {
    const w = 64;
    const h = 80;
    const combined = new Uint8ClampedArray(w * h * 4);

    // Fill 5 tile-aligned bands with different colors
    fillRect(combined, w, 0, 0, w, 16, 255, 0, 0, 255);
    fillRect(combined, w, 0, 16, w, 16, 0, 255, 0, 255);
    fillRect(combined, w, 0, 32, w, 16, 0, 0, 255, 255);
    fillRect(combined, w, 0, 48, w, 16, 255, 255, 0, 255);
    fillRect(combined, w, 0, 64, w, 16, 255, 0, 255, 255);

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      quantBits: 6,
      coverageThreshold: 0,
      mergeDeltaE: 5,
      topN: 3,
      tileSize: 16,
    });

    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("produces valid hex and HSL on all results", () => {
    const w = 16;
    const h = 16;
    const combined = new Uint8ClampedArray(w * h * 4);

    fillRect(combined, w, 0, 0, w, h, 100, 150, 200, 255);

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      coverageThreshold: 0,
      topN: 5,
      tileSize: 16,
      quantBits: 6,
    });

    expect(result.length).toBe(1);
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

  it("dominant background covers majority of sampled pixels", () => {
    const w = 64;
    const h = 64;
    const combined = new Uint8ClampedArray(w * h * 4);

    // White background (tile 0-2), then a thin red stripe in tile 3
    fillRect(combined, w, 0, 0, w, 48, 255, 255, 255, 255);
    fillRect(combined, w, 0, 48, w, 16, 255, 0, 0, 255);

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      quantBits: 6,
      coverageThreshold: 0.007,
      mergeDeltaE: 5,
      topN: 10,
      tileSize: 16,
    });

    // White (3 tiles × 64×16 = 3072) vs red (1 tile × 64×16 = 1024)
    // Both above 0.7% of 4096 (~29 pixels)
    expect(result.length).toBe(2);
  });

  it("handles empty image array", () => {
    const result = robustExtractPalette([]);
    expect(result.length).toBe(0);
  });

  it("handles zero-area images gracefully", () => {
    const result = robustExtractPalette([
      makeImage("a", new Uint8ClampedArray(0), 0, 0),
    ]);
    expect(result.length).toBe(0);
  });

  it("excludes anti-aliased scattered pixels below coverage threshold", () => {
    const w = 64;
    const h = 64;
    const combined = new Uint8ClampedArray(w * h * 4);

    // Solid background
    fillRect(combined, w, 0, 0, w, h, 240, 240, 240, 255);

    // Two isolated anti-aliased pixels — way below 0.7% of 4096 (~29px)
    const i0 = 0;
    combined[i0] = 250;
    combined[i0 + 1] = 200;
    combined[i0 + 2] = 210;

    const i1 = 4;
    combined[i1] = 248;
    combined[i1 + 1] = 198;
    combined[i1 + 2] = 208;

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      quantBits: 6,
      coverageThreshold: 0.007,
      mergeDeltaE: 5,
      topN: 10,
      tileSize: 16,
    });

    // Should have only the background color
    expect(result.length).toBe(1);
  });

  it("gradient with moderate variance passes through variance mask", () => {
    const w = 64;
    const h = 64;
    const combined = new Uint8ClampedArray(w * h * 4);

    // A gentle gradient: 0 to 60 across 64 px (Δ ~0.94 per px, 15 per tile)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.floor((x / w) * 60) + 100;
        const i = (y * w + x) * 4;
        combined[i] = v;
        combined[i + 1] = v;
        combined[i + 2] = v;
        combined[i + 3] = 255;
      }
    }

    const img = makeImage("a", combined, w, h);

    const result = robustExtractPalette([img], {
      tileSize: 16,
      varianceThreshold: 50,
      quantBits: 4,
      coverageThreshold: 0,
      mergeDeltaE: 5,
      topN: 10,
    });

    // Moderate gradient should pass through the variance mask
    expect(result.length).toBeGreaterThan(0);
  });

  it("shared color across images ranks higher than single-image color", () => {
    const w = 64;
    const h = 16;
    const a = new Uint8ClampedArray(w * h * 4);
    const b = new Uint8ClampedArray(w * h * 4);
    const c = new Uint8ClampedArray(w * h * 4);

    // Image A: red (1024 px) + blue (0 px)
    fillRect(a, w, 0, 0, w, h, 255, 0, 0, 255);

    // Image B: only red (1024 px)
    fillRect(b, w, 0, 0, w, h, 255, 0, 0, 255);

    // Image C: only blue (1024 px)
    fillRect(c, w, 0, 0, w, h, 0, 0, 255, 255);

    const results = robustExtractPalette(
      [
        makeImage("img-a", a, w, h),
        makeImage("img-b", b, w, h),
        makeImage("img-c", c, w, h),
      ],
      {
        coverageThreshold: 0,
        topN: 10,
        tileSize: 16,
        quantBits: 6,
        mergeDeltaE: 5,
      },
    );

    expect(results.length).toBe(2);
    // Red appears in 2 images (2048 px total), blue in 1 (1024 px)
    expect(results[0].hex).toBe("#FF0000");
    expect(results[0].coverage).toBeGreaterThan(results[1].coverage);
    expect(results[1].hex).toBe("#0000FF");
  });

  it("source references accumulate across images for shared colors", () => {
    const w = 16;
    const h = 16;
    const a = new Uint8ClampedArray(w * h * 4);
    const b = new Uint8ClampedArray(w * h * 4);

    fillRect(a, w, 0, 0, w, h, 255, 0, 0, 255);
    fillRect(b, w, 0, 0, w, h, 255, 0, 0, 255);

    const results = robustExtractPalette(
      [
        makeImage("img-a", a, w, h, source("node-a")),
        makeImage("img-b", b, w, h, source("node-b")),
      ],
      { coverageThreshold: 0, topN: 10, tileSize: 16, quantBits: 6 },
    );

    expect(results.length).toBe(1);
    expect(results[0].foundIn.length).toBe(2);
    expect(results[0].foundIn.map((f) => f.id).sort()).toEqual([
      "node-a",
      "node-b",
    ]);
  });

  it("robustExtractWithSummary reports images contributed and masked", () => {
    const w = 64;
    const h = 16;

    // Flat image
    const flat = new Uint8ClampedArray(w * h * 4);
    fillRect(flat, w, 0, 0, w, h, 100, 200, 100, 255);

    // Noisy image (fully photographic)
    const noisy = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      noisy[i] = Math.floor(Math.random() * 256);
      noisy[i + 1] = Math.floor(Math.random() * 256);
      noisy[i + 2] = Math.floor(Math.random() * 256);
      noisy[i + 3] = 255;
    }

    const result = robustExtractWithSummary(
      [
        makeImage("flat", flat, w, h, source("node-1")),
        makeImage("noisy", noisy, w, h, source("node-2")),
      ],
      {
        tileSize: 16,
        varianceThreshold: 50,
        coverageThreshold: 0,
        topN: 10,
        quantBits: 6,
      },
    );

    expect(result.summary.imagesContributed).toBe(1);
    expect(result.summary.imagesMasked).toBe(1);
    expect(result.summary.photoTilesMasked).toBeGreaterThan(0);
    expect(result.palette.length).toBeGreaterThan(0);
  });

  it("robustExtractWithSummary reports all images masked when all are photographic", () => {
    const w = 64;
    const h = 64;

    const n1 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      n1[i] = Math.floor(Math.random() * 256);
      n1[i + 1] = Math.floor(Math.random() * 256);
      n1[i + 2] = Math.floor(Math.random() * 256);
      n1[i + 3] = 255;
    }

    const n2 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) {
      n2[i] = Math.floor(Math.random() * 256);
      n2[i + 1] = Math.floor(Math.random() * 256);
      n2[i + 2] = Math.floor(Math.random() * 256);
      n2[i + 3] = 255;
    }

    const result = robustExtractWithSummary(
      [
        makeImage("n1", n1, w, h, source("node-1")),
        makeImage("n2", n2, w, h, source("node-2")),
      ],
      {
        tileSize: 16,
        varianceThreshold: 50,
        topN: 10,
      },
    );

    expect(result.summary.imagesContributed).toBe(0);
    expect(result.summary.imagesMasked).toBe(2);
    expect(result.palette.length).toBe(0);
  });
});
