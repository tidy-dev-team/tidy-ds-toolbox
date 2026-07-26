import { describe, it, expect } from "vitest";
import { contrastRatio, layer, requiredRatio } from "./contrast";

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
  });

  it("is 1 for a colour against itself - the invisible-text extreme", () => {
    expect(contrastRatio("#3366FF", "#3366FF")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#767676"),
      6,
    );
  });

  it("matches the known WCAG boundary case #767676 on white", () => {
    // The canonical "smallest grey that passes AA on white" - 4.54:1.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });

  it("is case-insensitive about hex digits", () => {
    expect(contrastRatio("#aabbcc", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#AABBCC", "#FFFFFF"),
      6,
    );
  });
});

describe("layer", () => {
  const opaque = (hex: string) => ({ hex, alpha: 1 });

  it("returns the top colour unchanged when it is opaque", () => {
    expect(layer(opaque("#123456"), opaque("#FFFFFF"))).toEqual({
      hex: "#123456",
      alpha: 1,
    });
  });

  it("returns the bottom colour when the top is fully transparent", () => {
    expect(layer({ hex: "#123456", alpha: 0 }, opaque("#FFFFFF"))).toEqual({
      hex: "#FFFFFF",
      alpha: 1,
    });
  });

  it("blends in sRGB space at 50%", () => {
    // Figma composites in sRGB, so half black over white is #808080 (128),
    // not the perceptual midpoint.
    expect(layer({ hex: "#000000", alpha: 0.5 }, opaque("#FFFFFF"))).toEqual({
      hex: "#808080",
      alpha: 1,
    });
  });

  it("accumulates alpha over a translucent backdrop without reaching opacity", () => {
    // Two 50% layers cover 75%, still short of opaque - which is what tells the
    // caller to keep walking up for another ancestor.
    const result = layer(
      { hex: "#000000", alpha: 0.5 },
      { hex: "#000000", alpha: 0.5 },
    );
    expect(result.alpha).toBeCloseTo(0.75, 6);
    expect(result.hex).toBe("#000000");
  });

  it("stays fully transparent when both layers are", () => {
    const result = layer(
      { hex: "#123456", alpha: 0 },
      { hex: "#FFFFFF", alpha: 0 },
    );
    expect(result.alpha).toBe(0);
  });
});

describe("requiredRatio", () => {
  it("demands 4.5 for normal body text", () => {
    expect(requiredRatio(16, false)).toBe(4.5);
  });

  it("demands 3 at 24px and above", () => {
    expect(requiredRatio(24, false)).toBe(3);
    expect(requiredRatio(32, false)).toBe(3);
  });

  it("demands 3 from 18.66px when bold", () => {
    expect(requiredRatio(18.66, true)).toBe(3);
    expect(requiredRatio(19, true)).toBe(3);
  });

  it("still demands 4.5 below 18.66px even when bold", () => {
    expect(requiredRatio(18, true)).toBe(4.5);
  });

  it("demands 4.5 when the size is unknown - the stricter default", () => {
    expect(requiredRatio(undefined, false)).toBe(4.5);
  });
});
