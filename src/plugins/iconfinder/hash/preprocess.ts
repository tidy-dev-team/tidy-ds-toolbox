// Shared image preprocessing: RGBA → Rec.601 grayscale → 32×32 letterbox.
//
// Used by both the runtime path (canvas ImageData from a PNG export) and the
// build-time path (rasterizer pixmap), so the two paths stay aligned.

export const TARGET_SIZE = 32;

// A grayscale pixel at or below this luminance counts as glyph content; values
// above it are treated as background. Renders are dark-on-white (resvg
// `background:"white"`, canvas composited on white), so 250 captures the glyph
// and its anti-aliased edge while ignoring the white field. A ~1px bbox drift
// from renderer AA differences is sub-2% on a 64px render — negligible to the
// low-frequency DCT, far smaller than the native-padding differences this fixes.
export const CONTENT_THRESHOLD = 250;

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert an RGBA buffer to a Rec.601 grayscale Float64Array of the same
 * width × height.
 */
export function rgbaToGrayscale(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Float64Array {
  const size = width * height;
  const gray = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const offset = i * 4;
    // Rec.601 luma weights.
    gray[i] =
      0.299 * pixels[offset] +
      0.587 * pixels[offset + 1] +
      0.114 * pixels[offset + 2];
  }
  return gray;
}

/**
 * Letterbox (contain) a grayscale image into a TARGET_SIZE × TARGET_SIZE
 * square. The background is filled with white (255). The image is centered.
 *
 * Resizing uses area-averaging (box filter): each target pixel is the
 * area-weighted mean of the source pixels its footprint covers. For the 1–2px
 * line art icons are made of, this is far more stable than nearest-neighbor —
 * NN's output flips on sub-pixel parity as the render scale changes, which
 * shows up as large pHash drift under otherwise trivial perturbations (a pure
 * re-rasterization at a different size). Both build and runtime share this
 * function, so the resampler stays identical across the two paths.
 */
export function letterboxGrayscale(
  gray: Float64Array,
  srcWidth: number,
  srcHeight: number,
  targetSize = TARGET_SIZE,
): Float64Array {
  if (gray.length !== srcWidth * srcHeight) {
    throw new Error(
      `grayscale length ${gray.length} does not match ${srcWidth}×${srcHeight}`,
    );
  }

  const scale = Math.min(targetSize / srcWidth, targetSize / srcHeight);
  const scaledW = Math.max(1, Math.round(srcWidth * scale));
  const scaledH = Math.max(1, Math.round(srcHeight * scale));
  const offsetX = Math.floor((targetSize - scaledW) / 2);
  const offsetY = Math.floor((targetSize - scaledH) / 2);

  // Source-space extent each target pixel spans (≥1 on downscale).
  const stepX = srcWidth / scaledW;
  const stepY = srcHeight / scaledH;

  const out = new Float64Array(targetSize * targetSize).fill(255);

  for (let y = 0; y < scaledH; y++) {
    const fy0 = y * stepY;
    const fy1 = (y + 1) * stepY;
    const sy0 = Math.floor(fy0);
    const sy1 = Math.min(srcHeight, Math.ceil(fy1));
    for (let x = 0; x < scaledW; x++) {
      const fx0 = x * stepX;
      const fx1 = (x + 1) * stepX;
      const sx0 = Math.floor(fx0);
      const sx1 = Math.min(srcWidth, Math.ceil(fx1));

      let sum = 0;
      let weight = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const wy = Math.min(fy1, sy + 1) - Math.max(fy0, sy);
        if (wy <= 0) continue;
        const row = sy * srcWidth;
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = Math.min(fx1, sx + 1) - Math.max(fx0, sx);
          if (wx <= 0) continue;
          const w = wx * wy;
          sum += gray[row + sx] * w;
          weight += w;
        }
      }
      out[(offsetY + y) * targetSize + (offsetX + x)] =
        weight > 0
          ? sum / weight
          : gray[
              Math.min(srcHeight - 1, sy0) * srcWidth +
                Math.min(srcWidth - 1, sx0)
            ];
    }
  }

  return out;
}

/**
 * Find the bounding box of glyph content (pixels at or below CONTENT_THRESHOLD)
 * in a grayscale image. Returns null when the image is entirely background.
 */
export function contentBBox(
  gray: Float64Array,
  width: number,
  height: number,
  threshold = CONTENT_THRESHOLD,
): BBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (gray[row + x] <= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null; // no content found
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Crop a grayscale image to the given bounding box, returning a new buffer.
 */
export function cropGrayscale(
  gray: Float64Array,
  width: number,
  box: BBox,
): Float64Array {
  const out = new Float64Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    const srcRow = (box.y + y) * width + box.x;
    const dstRow = y * box.width;
    for (let x = 0; x < box.width; x++) {
      out[dstRow + x] = gray[srcRow + x];
    }
  }
  return out;
}

/**
 * Full pipeline: RGBA buffer → trim to content bbox → 32×32 Rec.601 grayscale
 * letterbox.
 *
 * The content-bbox trim removes each glyph's native framing (e.g. a 20×20 glyph
 * centered in a 24×24 viewBox, or a tight-bounds detached vector) BEFORE the
 * letterbox normalizes scale, so the build-time render and the runtime export
 * letterbox to the same scale regardless of how the source was framed. Both
 * paths call this one function, so the trim stays bit-for-bit aligned across
 * build and runtime by construction.
 */
export function rgbaToLetterboxGrayscale(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  targetSize = TARGET_SIZE,
): Float64Array {
  const gray = rgbaToGrayscale(pixels, width, height);
  const box = contentBBox(gray, width, height);
  if (!box) {
    // Entirely background — nothing to trim; letterbox as-is.
    return letterboxGrayscale(gray, width, height, targetSize);
  }
  const cropped = cropGrayscale(gray, width, box);
  return letterboxGrayscale(cropped, box.width, box.height, targetSize);
}
