import { PaletteColor, SourceNodeRef } from "../types";
import { hexToHsl } from "./color";

interface PixelData {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  source: SourceNodeRef;
  imageId: string;
}

export interface ExtractorOptions {
  tileSize?: number;
  varianceThreshold?: number;
  quantBits?: number;
  coverageThreshold?: number;
  mergeDeltaE?: number;
  topN?: number;
  alphaThreshold?: number;
}

const DEFAULTS: Required<ExtractorOptions> = {
  tileSize: 16,
  varianceThreshold: 50,
  quantBits: 5,
  coverageThreshold: 0.007,
  mergeDeltaE: 5,
  topN: 16,
  alphaThreshold: 64,
};

function byteToHex(v: number): string {
  return Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function rgbToHexRounded(r: number, g: number, b: number): string {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
}

function quantize(v: number, bits: number): number {
  const levels = (1 << bits) - 1;
  return Math.round((v / 255) * levels);
}

function dequantize(q: number, bits: number): number {
  const levels = (1 << bits) - 1;
  return Math.round((q / levels) * 255);
}

function rgbToLab(
  r: number,
  g: number,
  b: number,
): {
  l: number;
  a: number;
  b: number;
} {
  let rr = r / 255;
  let gg = g / 255;
  let bb = b / 255;

  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

  const x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
  const y = rr * 0.2126729 + gg * 0.7151522 + bb * 0.072175;
  const z = (rr * 0.0193339 + gg * 0.119192 + bb * 0.9503041) / 1.08883;

  const fx = x > 0.008856 ? Math.cbrt(x) : (903.3 * x + 16) / 116;
  const fy = y > 0.008856 ? Math.cbrt(y) : (903.3 * y + 16) / 116;
  const fz = z > 0.008856 ? Math.cbrt(z) : (903.3 * z + 16) / 116;

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE(
  l1: number,
  a1: number,
  b1: number,
  l2: number,
  a2: number,
  b2: number,
): number {
  const dl = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export interface ExtractionResult {
  palette: PaletteColor[];
  summary: {
    imagesContributed: number;
    imagesMasked: number;
    photoTilesMasked: number;
  };
}

export function robustExtractPalette(
  imageData: PixelData[],
  options: ExtractorOptions = {},
): PaletteColor[] {
  return robustExtractWithSummary(imageData, options).palette;
}

export function robustExtractWithSummary(
  imageData: PixelData[],
  options: ExtractorOptions = {},
): ExtractionResult {
  const {
    tileSize,
    varianceThreshold,
    quantBits,
    coverageThreshold,
    mergeDeltaE,
    topN,
    alphaThreshold,
  } = { ...DEFAULTS, ...options };

  const bins = new Map<number, { count: number; sourceIds: Set<string> }>();
  let totalSurvivingPixels = 0;
  let photoTilesMasked = 0;
  const contributingImageIds = new Set<string>();

  for (const img of imageData) {
    const { pixels, width, height, imageId } = img;

    const { mask: flatMask, flatTiles, totalTiles } = computeVarianceMask(
      pixels,
      width,
      height,
      tileSize,
      varianceThreshold,
    );
    photoTilesMasked += totalTiles - flatTiles;

    let imgHadFlatPixels = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!flatMask[y * width + x]) continue;

        const i = (y * width + x) * 4;
        const a = pixels[i + 3];
        if (a < alphaThreshold) continue;

        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        const qr = quantize(r, quantBits);
        const qg = quantize(g, quantBits);
        const qb = quantize(b, quantBits);

        const key = (qr << (2 * quantBits)) | (qg << quantBits) | qb;
        totalSurvivingPixels++;
        imgHadFlatPixels = true;

        const entry = bins.get(key);
        if (entry) {
          entry.count++;
          entry.sourceIds.add(imageId);
        } else {
          bins.set(key, {
            count: 1,
            sourceIds: new Set([imageId]),
          });
        }
      }
    }

    if (imgHadFlatPixels) {
      contributingImageIds.add(imageId);
    }
  }

  const imagesMasked = imageData.length - contributingImageIds.size;

  if (totalSurvivingPixels === 0) {
    return {
      palette: [],
      summary: {
        imagesContributed: contributingImageIds.size,
        imagesMasked,
        photoTilesMasked,
      },
    };
  }

  const minCount = coverageThreshold * totalSurvivingPixels;

  const candidates: {
    r: number;
    g: number;
    b: number;
    lab: { l: number; a: number; b: number };
    count: number;
    sourceIds: string[];
  }[] = [];

  for (const [key, entry] of bins) {
    if (entry.count < minCount) continue;

    const qb = key & ((1 << quantBits) - 1);
    const qg = (key >> quantBits) & ((1 << quantBits) - 1);
    const qr = (key >> (2 * quantBits)) & ((1 << quantBits) - 1);

    const r = dequantize(qr, quantBits);
    const g = dequantize(qg, quantBits);
    const b = dequantize(qb, quantBits);

    candidates.push({
      r,
      g,
      b,
      lab: rgbToLab(r, g, b),
      count: entry.count,
      sourceIds: [...entry.sourceIds],
    });
  }

  candidates.sort((a, b) => b.count - a.count);

  const merged: {
    r: number;
    g: number;
    b: number;
    lab: { l: number; a: number; b: number };
    count: number;
    sourceIds: string[];
  }[] = [];

  for (const cand of candidates) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < merged.length; i++) {
      const m = merged[i];
      const de = deltaE(
        cand.lab.l,
        cand.lab.a,
        cand.lab.b,
        m.lab.l,
        m.lab.a,
        m.lab.b,
      );
      if (de < mergeDeltaE && de < bestDist) {
        bestDist = de;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const m = merged[bestIdx];
      const total = m.count + cand.count;
      const wr = m.count / total;
      const wc = cand.count / total;
      m.r = Math.round(m.r * wr + cand.r * wc);
      m.g = Math.round(m.g * wr + cand.g * wc);
      m.b = Math.round(m.b * wr + cand.b * wc);
      m.lab = rgbToLab(m.r, m.g, m.b);
      m.count = total;
      for (const sid of cand.sourceIds) {
        if (!m.sourceIds.includes(sid)) m.sourceIds.push(sid);
      }
    } else {
      merged.push({ ...cand, sourceIds: [...cand.sourceIds] });
    }
  }

  merged.sort((a, b) => b.count - a.count);
  const top = merged.slice(0, topN);

  const imageIdToSource = new Map<string, SourceNodeRef>();
  for (const img of imageData) {
    imageIdToSource.set(img.imageId, img.source);
  }

  const palette = top.map((c) => {
    const hex = rgbToHexRounded(c.r, c.g, c.b);
    return {
      hex,
      hsl: hexToHsl(hex),
      coverage: c.count / totalSurvivingPixels,
      foundIn: c.sourceIds
        .map((sid) => imageIdToSource.get(sid))
        .filter((s): s is SourceNodeRef => !!s),
    };
  });

  return {
    palette,
    summary: {
      imagesContributed: contributingImageIds.size,
      imagesMasked,
      photoTilesMasked,
    },
  };
}

// Per-tile flatness test by luminance variance: a tile is "flat" (kept) when
// its luminance variance is at/below the threshold, else it is treated as
// photographic and masked out. Returns the per-pixel keep mask plus tile
// tallies so the caller can report how many tiles were masked without a
// second pass. Note: luminance-only — a tile that varies in hue/chroma at
// near-constant luminance reads as flat; acceptable for UI screenshots.
function computeVarianceMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tileSize: number,
  varianceThreshold: number,
): { mask: boolean[]; flatTiles: number; totalTiles: number } {
  const mask = new Array<boolean>(width * height).fill(false);

  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  let flatTiles = 0;

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      const x1 = Math.min(x0 + tileSize, width);
      const y1 = Math.min(y0 + tileSize, height);

      let sumLum = 0;
      let sumSq = 0;
      let n = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const lum =
            0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          sumLum += lum;
          sumSq += lum * lum;
          n++;
        }
      }

      const meanLum = sumLum / n;
      const variance = sumSq / n - meanLum * meanLum;

      if (variance <= varianceThreshold) {
        flatTiles++;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            mask[y * width + x] = true;
          }
        }
      }
    }
  }

  return { mask, flatTiles, totalTiles: tilesX * tilesY };
}
