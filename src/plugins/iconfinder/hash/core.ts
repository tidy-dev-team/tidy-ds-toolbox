// Pure perceptual-hash math core.
//
// Operates only on Float64Array inputs so the same logic can be reused by the
// runtime (canvas → grayscale) and build-time (SVG rasterizer) paths without
// drift.
//
// Constants:
// - HASH_SIZE = 32: input is a 32×32 grid of luminance values.
// - DCT_SIZE = 8: we keep the top-left 8×8 DCT coefficients.
// - HASH_BITS = 63: the DC coefficient at (0,0) is excluded; the remaining
//   63 AC coefficients become the hash bits.

export const HASH_SIZE = 32;
export const DCT_SIZE = 8;
export const HASH_BITS = 63;

/**
 * Compute the 2D DCT-II of a 32×32 Float64 grid using separable 1D DCTs.
 * Returns a new 32×32 Float64Array in row-major order.
 */
export function dct2d(samples: Float64Array): Float64Array {
  if (samples.length !== HASH_SIZE * HASH_SIZE) {
    throw new Error(
      `Expected ${HASH_SIZE * HASH_SIZE} samples, got ${samples.length}`,
    );
  }

  const n = HASH_SIZE;
  const intermediate = new Float64Array(n * n);
  const result = new Float64Array(n * n);

  // Row transforms.
  for (let y = 0; y < n; y++) {
    for (let u = 0; u < n; u++) {
      let sum = 0;
      for (let x = 0; x < n; x++) {
        sum +=
          samples[y * n + x] *
          Math.cos((Math.PI * (2 * x + 1) * u) / (2 * n));
      }
      intermediate[y * n + u] = sum * scale(u, n);
    }
  }

  // Column transforms.
  for (let x = 0; x < n; x++) {
    for (let u = 0; u < n; u++) {
      let sum = 0;
      for (let y = 0; y < n; y++) {
        sum +=
          intermediate[y * n + u] *
          Math.cos((Math.PI * (2 * y + 1) * x) / (2 * n));
      }
      result[x * n + u] = sum * scale(x, n);
    }
  }

  return result;
}

function scale(k: number, n: number): number {
  return k === 0 ? 1 / Math.sqrt(n) : Math.sqrt(2 / n);
}

/**
 * Compute a 63-bit perceptual hash from a 32×32 luminance grid.
 *
 * Steps:
 * 1. Compute the 32×32 DCT.
 * 2. Take the top-left 8×8 coefficients.
 * 3. Exclude the DC coefficient at (0,0).
 * 4. Compute the median of the remaining 63 AC values.
 * 5. Each AC value >= median becomes a 1 bit; otherwise 0.
 */
export function phashFloat64(samples: Float64Array): bigint {
  const dct = dct2d(samples);
  const ac = extractAcCoefficients(dct);
  const median = computeMedian(ac);

  let hash = 0n;
  for (let i = 0; i < HASH_BITS; i++) {
    if (ac[i] >= median) {
      hash |= 1n << BigInt(i);
    }
  }
  return hash;
}

/**
 * Extract the 63 AC coefficients from the top-left 8×8 DCT block.
 * The DC coefficient at (0,0) is skipped.
 */
function extractAcCoefficients(dct: Float64Array): Float64Array {
  const ac = new Float64Array(HASH_BITS);
  let idx = 0;
  for (let y = 0; y < DCT_SIZE; y++) {
    for (let x = 0; x < DCT_SIZE; x++) {
      if (x === 0 && y === 0) continue; // skip DC
      ac[idx++] = dct[y * HASH_SIZE + x];
    }
  }
  return ac;
}

/**
 * Compute the median of a Float64Array without mutating the original.
 */
function computeMedian(values: Float64Array): number {
  if (values.length === 0) return 0;
  const sorted = values.slice();
  sorted.sort();
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Count the number of set bits in a non-negative bigint.
 */
export function popcount(x: bigint): number {
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * Hamming distance between two hashes.
 */
export function hammingDistance(a: bigint, b: bigint): number {
  return popcount(a ^ b);
}
