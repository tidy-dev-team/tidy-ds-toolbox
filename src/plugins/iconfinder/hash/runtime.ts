// Runtime perceptual hash (UI thread only).
//
// PNG bytes exported by the main thread → <canvas> composited on white →
// 32×32 letterbox grayscale (shared preprocessor) → 63-bit pHash (shared core).
//
// This module uses DOM APIs (createImageBitmap, canvas) and must NEVER be
// imported by the build script or the plugin main thread — only by the UI.
// It mirrors the build-time rasterization geometry exactly so build- and
// run-time hashes agree:
//   build:   resvg render @64px width, background white → letterbox → Rec.601
//   runtime: PNG export @64px width, composite on white → letterbox → Rec.601

import { phashFloat64 } from "./core";
import { rgbaToLetterboxGrayscale } from "./preprocess";

/**
 * Compute the perceptual hash of a base64-encoded PNG (as exported by the
 * main thread). Async because image decode is async.
 */
export async function hashPngBase64(pngBase64: string): Promise<bigint> {
  const img = new Image();
  img.src = `data:image/png;base64,${pngBase64}`;
  await img.decode();

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable");
  }

  // Composite onto white BEFORE drawing, so transparent icon areas read as
  // white — matching the rasterizer's `background: "white"`. Skipping this
  // makes transparent pixels read as black and the hash diverges from the DB.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Draw at natural size, unscaled: the ONLY resample is the shared letterbox
  // NN downscale (64→32), identical to the build path. Letting drawImage scale
  // here would introduce a second, different resample and break parity.
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);
  const samples = rgbaToLetterboxGrayscale(data, width, height, 32);
  return phashFloat64(samples);
}
