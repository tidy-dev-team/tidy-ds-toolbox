import { describe, it, expect } from "vitest";
import { mintId, idMintedAt } from "./id";

describe("mintId", () => {
  it("never returns the same value twice at one fixed clock value", () => {
    const now = 1_700_000_000_000;
    const ids = new Set(Array.from({ length: 50 }, () => mintId(now)));
    expect(ids.size).toBe(50);
  });

  it("keeps a readable, stable time component", () => {
    const now = 1_700_000_000_000;
    const id = mintId(now);
    expect(id.startsWith(`${now.toString(36)}-`)).toBe(true);
  });

  it("sorts ids from a later clock value after ids from an earlier one", () => {
    const earlier = mintId(1_700_000_000_000);
    const later = mintId(1_700_000_100_000);
    expect(later > earlier).toBe(true);
  });

  it("is stable in format across many calls", () => {
    const id = mintId(1_700_000_000_000);
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });
});

describe("idMintedAt", () => {
  it("recovers the instant a mintId id was minted at", () => {
    const now = 1_700_000_000_000;
    const id = mintId(now);
    expect(idMintedAt(id)).toBe(now);
  });

  it("reads a legacy plain-decimal id the same way it was compared before", () => {
    expect(idMintedAt("1700000000000")).toBe(1700000000000);
  });
});

describe("idMintedAt tells the two id formats apart by shape", () => {
  it("reads a minted id's time component as base 36", () => {
    const now = 1756512345678;
    expect(idMintedAt(mintId(now))).toBe(now);
  });

  it("reads a legacy plain-decimal id as decimal", () => {
    expect(idMintedAt("1756512345678")).toBe(1756512345678);
  });

  it("reads a minted id whose time component is all digits", () => {
    // Unreachable until 2059, when an epoch millisecond first becomes nine
    // base-36 characters and the leading one can be a digit. Pinned now because
    // the format used to be guessed by attempting a decimal parse, which would
    // have read this id as an instant in 1970 and mis-ordered it against every
    // other sprint.
    const allDigits = Math.pow(36, 8); // base 36 "100000000"
    expect(allDigits.toString(36)).toMatch(/^[0-9]+$/);
    expect(idMintedAt(mintId(allDigits))).toBe(allDigits);
  });
});
