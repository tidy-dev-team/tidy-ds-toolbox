import { describe, expect, it } from "vitest";
import {
  isAllowedBridgeOrigin,
  describeRefusedOrigin,
} from "./origin-policy.ts";

describe("isAllowedBridgeOrigin", () => {
  it("allows a handshake with no Origin at all", () => {
    // A non-browser client sends none, and those are the callers ADR-0005
    // accepts. A browser never omits the header, so this is not a hole.
    expect(isAllowedBridgeOrigin(undefined)).toBe(true);
    expect(isAllowedBridgeOrigin("")).toBe(true);
  });

  it("allows the opaque origin of a sandboxed document", () => {
    expect(isAllowedBridgeOrigin("null")).toBe(true);
  });

  it("allows the Figma desktop app's file origin", () => {
    expect(isAllowedBridgeOrigin("file://")).toBe(true);
  });

  it("allows figma.com and its subdomains over https", () => {
    expect(isAllowedBridgeOrigin("https://figma.com")).toBe(true);
    expect(isAllowedBridgeOrigin("https://www.figma.com")).toBe(true);
    expect(isAllowedBridgeOrigin("https://staging.figma.com")).toBe(true);
  });

  it("refuses a web page, which is the whole point", () => {
    expect(isAllowedBridgeOrigin("https://example.com")).toBe(false);
    expect(isAllowedBridgeOrigin("http://localhost:3000")).toBe(false);
  });

  // A suffix test on the raw string would pass all three of these.
  it("refuses a lookalike host", () => {
    expect(isAllowedBridgeOrigin("https://figma.com.evil.test")).toBe(false);
    expect(isAllowedBridgeOrigin("https://notfigma.com")).toBe(false);
    expect(
      isAllowedBridgeOrigin("https://evil.test/?x=https://figma.com"),
    ).toBe(false);
  });

  it("refuses plain http on a figma host", () => {
    expect(isAllowedBridgeOrigin("http://figma.com")).toBe(false);
  });

  it("refuses an unparseable origin rather than guessing", () => {
    expect(isAllowedBridgeOrigin("figma.com")).toBe(false);
    expect(isAllowedBridgeOrigin("not an origin")).toBe(false);
  });
});

describe("describeRefusedOrigin", () => {
  it("names the origin it refused and why it matters", () => {
    const msg = describeRefusedOrigin("https://example.com");
    expect(msg).toContain("https://example.com");
    expect(msg).toContain("forge");
  });
});
