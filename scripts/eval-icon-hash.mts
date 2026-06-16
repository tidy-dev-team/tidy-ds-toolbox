#!/usr/bin/env node
// Robustness eval for the Icon Finder perceptual hash.
//
// Measures self-match rate: after perturbing a glyph (the way a designer's
// in-the-wild copy differs from the library original), does its pHash still
// land within MAX_DIST of the *unperturbed* hash of the same glyph? Runs every
// perturbation through two pipelines — WITHOUT the content-bbox trim (the old
// behavior) and WITH it — so the trim's effect is a measured number, not a
// guess.
//
// Source glyphs are read from the committed DB artifact (their normalized SVG),
// rendered with the same resvg geometry as the build, and hashed with the same
// shared core. No Figma required.
//
// Usage:
//   npm run eval:icon-hash              # quick signal (default sample)
//   npm run eval:icon-hash -- --all     # full 22.4k set
//   npm run eval:icon-hash -- --sample=5000

import { Resvg } from "@resvg/resvg-js";
import { phashFloat64, hammingDistance } from "../src/plugins/iconfinder/hash/core.ts";
import {
  rgbaToGrayscale,
  letterboxGrayscale,
  rgbaToLetterboxGrayscale,
} from "../src/plugins/iconfinder/hash/preprocess.ts";
import { ICON_DB_JSON } from "../src/plugins/iconfinder/db/generated.ts";

// Mirrors MAX_DIST in hash/query.ts. Imported by value rather than from query.ts
// because that module uses the src/ extensionless-import convention, which raw
// Node ESM (this script's runtime) rejects. Keep in sync with query.ts.
const MAX_DIST = 10;

const RENDER_WIDTH = 64;

interface RawEntry {
  name: string;
  source: string;
  hash: string;
  svg: string;
}

interface Pixmap {
  pixels: Uint8Array;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Render + hash
// ---------------------------------------------------------------------------

function render(svg: string, width: number): Pixmap {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "white",
    font: { loadSystemFonts: false },
  });
  const r = resvg.render();
  return { pixels: r.pixels, width: r.width, height: r.height };
}

// WITH trim — the production pipeline.
function hashTrim(p: Pixmap): bigint {
  return phashFloat64(rgbaToLetterboxGrayscale(p.pixels, p.width, p.height, 32));
}

// WITHOUT trim — letterbox the full frame, the pre-#27 behavior.
function hashNoTrim(p: Pixmap): bigint {
  const gray = rgbaToGrayscale(p.pixels, p.width, p.height);
  return phashFloat64(letterboxGrayscale(gray, p.width, p.height, 32));
}

// ---------------------------------------------------------------------------
// Perturbations: each returns a modified SVG + the width to render it at, or
// null when it does not apply to this glyph (counted separately).
// ---------------------------------------------------------------------------

interface Perturbation {
  key: string;
  apply: (svg: string) => { svg: string; width: number } | null;
}

// Loosen framing: grow the viewBox by 25% margin on every side, so the glyph
// occupies a smaller fraction of the frame — the exact case the trim targets.
function padViewBox(svg: string): { svg: string; width: number } | null {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) return null;
  const parts = m[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return null;
  const [x, y, w, h] = parts;
  const mx = w * 0.25;
  const my = h * 0.25;
  const vb = `${x - mx} ${y - my} ${w + 2 * mx} ${h + 2 * my}`;
  return { svg: svg.replace(/viewBox="[^"]+"/, `viewBox="${vb}"`), width: RENDER_WIDTH };
}

// Thicken strokes ×1.5 (no-op on fill-only glyphs → trivially self-matches).
function thickenStroke(svg: string): { svg: string; width: number } | null {
  if (!/stroke-width="/.test(svg)) return null;
  const out = svg.replace(/stroke-width="([\d.]+)"/g, (_, n) => `stroke-width="${Number(n) * 1.5}"`);
  return { svg: out, width: RENDER_WIDTH };
}

// Recolor: resolve currentColor to mid-gray (brightness shift, no shape change).
function recolor(svg: string): { svg: string; width: number } | null {
  if (!/currentColor/.test(svg)) return null;
  return { svg: svg.replace(/currentColor/g, "#777777"), width: RENDER_WIDTH };
}

// Re-rasterize at a larger size (baseline is 64px) to probe scale stability.
function rescale(svg: string): { svg: string; width: number } {
  return { svg, width: 96 };
}

const PERTURBATIONS: Perturbation[] = [
  { key: "pad (looser viewBox)", apply: padViewBox },
  { key: "stroke ×1.5", apply: thickenStroke },
  { key: "recolor → gray", apply: recolor },
  { key: "rescale 64→96", apply: rescale },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseSample(entries: RawEntry[]): RawEntry[] {
  const argv = process.argv.slice(2);
  if (argv.includes("--all")) return entries;
  const sampleArg = argv.find((a) => a.startsWith("--sample="));
  const n = sampleArg ? Number(sampleArg.split("=")[1]) : 1500;
  if (!Number.isFinite(n) || n <= 0 || n >= entries.length) return entries;
  // Deterministic even-stride sample for reproducible numbers.
  const stride = entries.length / n;
  const out: RawEntry[] = [];
  for (let i = 0; i < n; i++) out.push(entries[Math.floor(i * stride)]);
  return out;
}

interface Tally {
  applicable: number;
  matchedTrim: number;
  matchedNoTrim: number;
}

function main(): void {
  const db = JSON.parse(ICON_DB_JSON) as { entries: RawEntry[] };
  const sample = parseSample(db.entries);
  console.log(
    `Evaluating ${sample.length} of ${db.entries.length} glyphs · MAX_DIST=${MAX_DIST}\n`,
  );

  const tallies = new Map<string, Tally>();
  for (const p of PERTURBATIONS) {
    tallies.set(p.key, { applicable: 0, matchedTrim: 0, matchedNoTrim: 0 });
  }

  let processed = 0;
  let renderErrors = 0;

  for (const entry of sample) {
    let basePix: Pixmap;
    try {
      basePix = render(entry.svg, RENDER_WIDTH);
    } catch {
      renderErrors++;
      continue;
    }
    const baseTrim = hashTrim(basePix);
    const baseNoTrim = hashNoTrim(basePix);

    for (const p of PERTURBATIONS) {
      const tally = tallies.get(p.key)!;
      const perturbed = p.apply(entry.svg);
      if (!perturbed) continue; // not applicable to this glyph
      tally.applicable++;
      try {
        const pix = render(perturbed.svg, perturbed.width);
        if (hammingDistance(baseTrim, hashTrim(pix)) < MAX_DIST) tally.matchedTrim++;
        if (hammingDistance(baseNoTrim, hashNoTrim(pix)) < MAX_DIST) tally.matchedNoTrim++;
      } catch {
        renderErrors++;
      }
    }

    if (++processed % 500 === 0) console.log(`  ${processed}/${sample.length}…`);
  }

  const pct = (n: number, d: number) => (d === 0 ? "  n/a" : `${((100 * n) / d).toFixed(1)}%`);

  console.log(`\nSelf-match rate (perturbed glyph within MAX_DIST of its own hash):\n`);
  console.log(`  ${"perturbation".padEnd(22)} ${"n".padStart(6)}  ${"no-trim".padStart(8)}  ${"trim".padStart(8)}  ${"Δ".padStart(7)}`);
  console.log(`  ${"-".repeat(22)} ${"-".repeat(6)}  ${"-".repeat(8)}  ${"-".repeat(8)}  ${"-".repeat(7)}`);
  for (const p of PERTURBATIONS) {
    const t = tallies.get(p.key)!;
    const noTrim = t.applicable === 0 ? 0 : (100 * t.matchedNoTrim) / t.applicable;
    const trim = t.applicable === 0 ? 0 : (100 * t.matchedTrim) / t.applicable;
    const delta = t.applicable === 0 ? "  n/a" : `${(trim - noTrim >= 0 ? "+" : "")}${(trim - noTrim).toFixed(1)}`;
    console.log(
      `  ${p.key.padEnd(22)} ${String(t.applicable).padStart(6)}  ${pct(t.matchedNoTrim, t.applicable).padStart(8)}  ${pct(t.matchedTrim, t.applicable).padStart(8)}  ${delta.padStart(7)}`,
    );
  }
  if (renderErrors > 0) console.log(`\n  (${renderErrors} render error(s) skipped)`);
}

main();
