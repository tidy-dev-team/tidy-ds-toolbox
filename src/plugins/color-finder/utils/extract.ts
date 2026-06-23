import { PaletteColor, SourceNodeRef } from "../types";
import { hexToHsl } from "./color";

/**
 * Pure palette extractor for raster UI screenshots. No Figma/DOM dependency —
 * operates on plain RGBA buffers so it can be unit-tested directly.
 *
 * Two ideas drive it, both chosen after measuring real screenshots:
 *
 *  1. Photo rejection by COLOUR DIVERSITY, not luminance variance. A flat UI
 *     region — even a button with a text label or an icon-laden toolbar — uses
 *     only a handful of distinct colours per tile. A photograph (avatar, hero,
 *     thumbnail) is a texture: dozens of distinct colours per tile. We mask a
 *     tile when its distinct-colour count exceeds `maxTileColors`. Luminance
 *     variance cannot tell "orange button + white text" (high contrast, 2
 *     colours, WANTED) from a photo (high contrast, many colours), and was
 *     deleting ~99% of accent pixels. Note: this deliberately treats a smooth
 *     gradient as UI (few distinct colours per small tile), not as a photo.
 *
 *  2. Selection by per-image PROMINENCE + saturation, not global area. A brand
 *     accent (e.g. an orange CTA) may be only ~0.3% of a page and appear in one
 *     screenshot out of many; ranking by global pixel area buries it under
 *     white/grey chrome. We score each colour by its peak per-image coverage
 *     and keep saturated colours at a far lower threshold than neutrals, so
 *     vivid accents survive without letting photographic noise through.
 */

interface PixelData {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  source: SourceNodeRef;
  imageId: string;
}

export interface ExtractorOptions {
  tileSize?: number;
  // A tile with more than this many distinct quantized colours is treated as
  // photographic and masked out. Flat/text-heavy UI stays well below it.
  maxTileColors?: number;
  quantBits?: number;
  // Saturation (0..1) at or above which a colour counts as an "accent" and is
  // kept at the lower `accentKeep` prominence threshold instead of `neutralKeep`.
  accentSatThreshold?: number;
  // Min peak per-image coverage (0..1) to keep a neutral (low-saturation) colour.
  neutralKeep?: number;
  // Min peak per-image coverage (0..1) to keep a saturated accent colour.
  accentKeep?: number;
  mergeDeltaE?: number;
  topN?: number;
  alphaThreshold?: number;
}

const DEFAULTS: Required<ExtractorOptions> = {
  tileSize: 16,
  maxTileColors: 28,
  quantBits: 5,
  accentSatThreshold: 0.15,
  neutralKeep: 0.02,
  accentKeep: 0.003,
  mergeDeltaE: 6,
  topN: 24,
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

// HSL saturation (0..1) — used to tell accents from neutrals.
function saturationOf(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  if (d === 0) return 0;
  const l = (mx + mn) / 2;
  return d / (1 - Math.abs(2 * l - 1));
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

function rgbToLab(r: number, g: number, b: number): Lab {
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

function deltaE(p: Lab, q: Lab): number {
  const dl = p.l - q.l;
  const da = p.a - q.a;
  const db = p.b - q.b;
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

// A colour accumulated across the whole batch, keyed by its quantized RGB.
interface Aggregate {
  r: number;
  g: number;
  b: number;
  // Peak per-image coverage (0..1): how prominent this colour is in the single
  // image where it is most prominent. This is what we rank/threshold on.
  prominence: number;
  sourceIds: Set<string>;
}

export function robustExtractWithSummary(
  imageData: PixelData[],
  options: ExtractorOptions = {},
): ExtractionResult {
  const {
    tileSize,
    maxTileColors,
    quantBits,
    accentSatThreshold,
    neutralKeep,
    accentKeep,
    mergeDeltaE,
    topN,
    alphaThreshold,
  } = { ...DEFAULTS, ...options };

  const agg = new Map<number, Aggregate>();
  let photoTilesMasked = 0;
  const contributingImageIds = new Set<string>();

  for (const img of imageData) {
    const { pixels, width, height, imageId } = img;

    const { mask, flatTiles, totalTiles } = computeDiversityMask(
      pixels,
      width,
      height,
      tileSize,
      quantBits,
      maxTileColors,
      alphaThreshold,
    );
    photoTilesMasked += totalTiles - flatTiles;

    // Histogram the surviving (flat) pixels for THIS image.
    const counts = new Map<number, number>();
    let imgSurviving = 0;
    for (let p = 0; p < width * height; p++) {
      if (!mask[p]) continue;
      const i = p * 4;
      if (pixels[i + 3] < alphaThreshold) continue;
      const key =
        (quantize(pixels[i], quantBits) << (2 * quantBits)) |
        (quantize(pixels[i + 1], quantBits) << quantBits) |
        quantize(pixels[i + 2], quantBits);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      imgSurviving++;
    }

    if (imgSurviving === 0) continue;
    contributingImageIds.add(imageId);

    // Fold this image's per-colour coverage into the batch, tracking the PEAK
    // per-image coverage (prominence) rather than summing — a colour vivid in
    // one screenshot must not be diluted by every other screenshot.
    for (const [key, count] of counts) {
      const coverage = count / imgSurviving;
      const existing = agg.get(key);
      if (existing) {
        existing.prominence = Math.max(existing.prominence, coverage);
        existing.sourceIds.add(imageId);
      } else {
        const qb = key & ((1 << quantBits) - 1);
        const qg = (key >> quantBits) & ((1 << quantBits) - 1);
        const qr = (key >> (2 * quantBits)) & ((1 << quantBits) - 1);
        agg.set(key, {
          r: dequantize(qr, quantBits),
          g: dequantize(qg, quantBits),
          b: dequantize(qb, quantBits),
          prominence: coverage,
          sourceIds: new Set([imageId]),
        });
      }
    }
  }

  const imagesMasked = imageData.length - contributingImageIds.size;
  const summary = {
    imagesContributed: contributingImageIds.size,
    imagesMasked,
    photoTilesMasked,
  };

  // Two-track keep: accents (saturated) survive at a far lower prominence than
  // neutrals, so a small but vivid brand colour is not filtered out.
  const candidates = [...agg.values()]
    .filter((c) => {
      const sat = saturationOf(c.r, c.g, c.b);
      const threshold = sat >= accentSatThreshold ? accentKeep : neutralKeep;
      return c.prominence >= threshold;
    })
    .map((c) => ({ ...c, lab: rgbToLab(c.r, c.g, c.b) }));

  // Anchor clusters on the most prominent colours first.
  candidates.sort((a, b) => b.prominence - a.prominence);

  const merged: (Aggregate & { lab: Lab })[] = [];
  for (const cand of candidates) {
    let target: (Aggregate & { lab: Lab }) | null = null;
    for (const m of merged) {
      if (deltaE(cand.lab, m.lab) < mergeDeltaE) {
        target = m;
        break;
      }
    }
    if (target) {
      // Weight the centroid by prominence; keep the peak prominence.
      const total = target.prominence + cand.prominence;
      target.r = Math.round(
        (target.r * target.prominence + cand.r * cand.prominence) / total,
      );
      target.g = Math.round(
        (target.g * target.prominence + cand.g * cand.prominence) / total,
      );
      target.b = Math.round(
        (target.b * target.prominence + cand.b * cand.prominence) / total,
      );
      target.lab = rgbToLab(target.r, target.g, target.b);
      target.prominence = Math.max(target.prominence, cand.prominence);
      for (const sid of cand.sourceIds) target.sourceIds.add(sid);
    } else {
      merged.push({ ...cand, sourceIds: new Set(cand.sourceIds) });
    }
  }

  merged.sort((a, b) => b.prominence - a.prominence);
  const top = merged.slice(0, topN);

  const imageIdToSource = new Map<string, SourceNodeRef>();
  for (const img of imageData) imageIdToSource.set(img.imageId, img.source);

  const palette: PaletteColor[] = top.map((c) => {
    const hex = rgbToHexRounded(c.r, c.g, c.b);
    return {
      hex,
      hsl: hexToHsl(hex),
      // `coverage` here is peak per-image prominence (0..1).
      coverage: c.prominence,
      foundIn: [...c.sourceIds]
        .map((sid) => imageIdToSource.get(sid))
        .filter((s): s is SourceNodeRef => !!s),
    };
  });

  return { palette, summary };
}

// Per-tile photo test by colour diversity: a tile is "flat" (kept) when it has
// at most `maxColors` distinct quantized colours, else it is treated as
// photographic and masked. Returns the per-pixel keep mask plus tile tallies so
// the caller can report how many tiles were masked without a second pass.
function computeDiversityMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tileSize: number,
  quantBits: number,
  maxColors: number,
  alphaThreshold: number,
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

      const colors = new Set<number>();
      let opaque = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          if (pixels[i + 3] < alphaThreshold) continue;
          colors.add(
            (quantize(pixels[i], quantBits) << (2 * quantBits)) |
              (quantize(pixels[i + 1], quantBits) << quantBits) |
              quantize(pixels[i + 2], quantBits),
          );
          opaque++;
        }
      }

      if (opaque > 0 && colors.size <= maxColors) {
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
