// Shared image preprocessing: RGBA → Rec.601 grayscale → 32×32 letterbox.
//
// Used by both the runtime path (canvas ImageData from a PNG export) and the
// build-time path (rasterizer pixmap), so the two paths stay aligned.

export const TARGET_SIZE = 32;

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
 * Resizing uses nearest-neighbor sampling.
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

  const out = new Float64Array(targetSize * targetSize).fill(255);

  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const srcX = Math.min(srcWidth - 1, Math.floor((x + 0.5) / scale));
      const srcY = Math.min(srcHeight - 1, Math.floor((y + 0.5) / scale));
      const value = gray[srcY * srcWidth + srcX];
      out[(offsetY + y) * targetSize + (offsetX + x)] = value;
    }
  }

  return out;
}

/**
 * Full pipeline: RGBA buffer → 32×32 Rec.601 grayscale letterbox.
 */
export function rgbaToLetterboxGrayscale(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  targetSize = TARGET_SIZE,
): Float64Array {
  const gray = rgbaToGrayscale(pixels, width, height);
  return letterboxGrayscale(gray, width, height, targetSize);
}
