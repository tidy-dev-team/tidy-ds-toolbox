import { describe, it, expect } from "vitest";
import {
  HASH_BITS,
  HASH_SIZE,
  dct2d,
  hammingDistance,
  phashFloat64,
  popcount,
} from "./core";

describe("phash core", () => {
  it("returns a 63-bit hash for a valid 32×32 input", () => {
    const samples = new Float64Array(HASH_SIZE * HASH_SIZE).fill(128);
    const hash = phashFloat64(samples);

    expect(typeof hash).toBe("bigint");
    expect(hash >= 0n).toBe(true);
    expect(hash < 1n << BigInt(HASH_BITS)).toBe(true);
  });

  it("excludes the DC component: adding a constant offset keeps the hash similar", () => {
    const base = new Float64Array(HASH_SIZE * HASH_SIZE);
    const offset = new Float64Array(HASH_SIZE * HASH_SIZE);

    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        const value = ((x + y * HASH_SIZE) % 256) / 2;
        base[y * HASH_SIZE + x] = value;
        offset[y * HASH_SIZE + x] = value + 40;
      }
    }

    const baseHash = phashFloat64(base);
    const offsetHash = phashFloat64(offset);

    // A pure DC shift should not change the hash. Our separable DCT accumulates
    // small floating-point residuals, so we allow a modest number of flipped
    // bits here; runtime/build-time parity is what matters for real matching.
    expect(hammingDistance(baseHash, offsetHash)).toBeLessThanOrEqual(10);
  });

  it("excludes the DC component exactly: a pure constant offset flips zero bits", () => {
    // Input built from non-harmonic sinusoids so AC coefficients do not land
    // exactly on the median (no float ties to flip). A pure DC offset changes
    // only the (0,0) coefficient, which is excluded, so the hash must be
    // byte-for-byte identical.
    const base = new Float64Array(HASH_SIZE * HASH_SIZE);
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        base[y * HASH_SIZE + x] =
          50 +
          30 * Math.sin(x * 0.37 + 0.11) +
          25 * Math.cos(y * 0.53 + 0.29) +
          15 * Math.sin((x + y) * 0.19);
      }
    }

    const offset = base.slice();
    for (let i = 0; i < offset.length; i++) {
      offset[i] += 40;
    }

    expect(hammingDistance(phashFloat64(base), phashFloat64(offset))).toBe(0);
  });

  it("produces a deterministic hash for a known gradient pattern", () => {
    const samples = new Float64Array(HASH_SIZE * HASH_SIZE);
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        samples[y * HASH_SIZE + x] = (x + y * HASH_SIZE) % 256;
      }
    }

    const hash1 = phashFloat64(samples);
    const hash2 = phashFloat64(samples.slice());

    expect(hash1).toBe(hash2);
  });

  it("is stable around the median threshold (tiny perturbations keep hash identical)", () => {
    const base = new Float64Array(HASH_SIZE * HASH_SIZE);
    for (let i = 0; i < base.length; i++) {
      base[i] = Math.sin(i * 0.1) * 127 + 128;
    }

    const hashBase = phashFloat64(base.slice());

    const perturbed = base.slice();
    for (let i = 0; i < perturbed.length; i += 7) {
      perturbed[i] += 0.0001;
    }
    const hashPerturbed = phashFloat64(perturbed);

    expect(hashBase).toBe(hashPerturbed);
  });

  it("computes Hamming distance and popcount correctly", () => {
    expect(popcount(0b1011n)).toBe(3);
    expect(popcount(0n)).toBe(0);
    expect(popcount((1n << 63n) - 1n)).toBe(63);

    expect(hammingDistance(0b0000n, 0b0000n)).toBe(0);
    expect(hammingDistance(0b1111n, 0b0000n)).toBe(4);
    expect(hammingDistance(0b1010n, 0b0101n)).toBe(4);
  });

  it("produces non-trivially different hashes for different patterns", () => {
    const gradient = new Float64Array(HASH_SIZE * HASH_SIZE);
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        gradient[y * HASH_SIZE + x] = (x / HASH_SIZE) * 255;
      }
    }

    const checker = new Float64Array(HASH_SIZE * HASH_SIZE);
    for (let y = 0; y < HASH_SIZE; y++) {
      for (let x = 0; x < HASH_SIZE; x++) {
        checker[y * HASH_SIZE + x] = (x + y) % 2 === 0 ? 255 : 0;
      }
    }

    const h1 = phashFloat64(gradient);
    const h2 = phashFloat64(checker);

    expect(h1).not.toBe(h2);
    expect(hammingDistance(h1, h2)).toBeGreaterThan(0);
    expect(hammingDistance(h1, h2)).toBeLessThanOrEqual(HASH_BITS);
  });
});

describe("dct2d", () => {
  it("returns a 32×32 output for a 32×32 input", () => {
    const input = new Float64Array(HASH_SIZE * HASH_SIZE).fill(1);
    const output = dct2d(input);

    expect(output.length).toBe(HASH_SIZE * HASH_SIZE);
    expect(output[0]).toBeGreaterThan(0); // DC coefficient
  });
});
