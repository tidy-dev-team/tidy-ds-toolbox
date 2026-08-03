import { describe, it, expect } from "vitest";
import {
  DEFAULT_CARD_APPEARANCE,
  hexToRgb,
  isHexColor,
  isLightBackground,
  normaliseAppearance,
  paletteFor,
  contrastRatio,
  relativeLuminance,
  rgbToHex,
  usableFamilies,
} from "./appearance";

describe("hex handling", () => {
  it("accepts six digits in either case and nothing else", () => {
    expect(isHexColor("000A19")).toBe(true);
    expect(isHexColor("eef3fc")).toBe(true);
    expect(isHexColor("#000A19")).toBe(false);
    expect(isHexColor("000A1")).toBe(false);
    expect(isHexColor("000A199")).toBe(false);
    expect(isHexColor("GGGGGG")).toBe(false);
    expect(isHexColor("")).toBe(false);
  });

  it("round-trips a colour through Figma's 0..1 RGB", () => {
    expect(rgbToHex(hexToRgb("000A19"))).toBe("000A19");
    expect(rgbToHex(hexToRgb("EEF3FC"))).toBe("EEF3FC");
    expect(rgbToHex(hexToRgb("FFFFFF"))).toBe("FFFFFF");
  });

  it("clamps out-of-range channels rather than emitting junk digits", () => {
    expect(rgbToHex({ r: -1, g: 2, b: 0.5 })).toBe("00FF80");
  });
});

describe("relativeLuminance", () => {
  it("puts black at 0 and white at 1", () => {
    expect(relativeLuminance(hexToRgb("000000"))).toBeCloseTo(0, 5);
    expect(relativeLuminance(hexToRgb("FFFFFF"))).toBeCloseTo(1, 5);
  });
});

describe("isLightBackground", () => {
  it("reads the two shipped backgrounds correctly", () => {
    expect(isLightBackground(hexToRgb("000A19"))).toBe(false);
    expect(isLightBackground(hexToRgb("FFFFFF"))).toBe(true);
  });

  it("gives mid grey the dark text set, which a 0.5 midpoint would not", () => {
    // #808080 has luminance ~0.216: above the black/white crossover, so dark
    // type on it is the more legible pair. A naive 0.5 threshold would call
    // this dark and put pale text on it.
    const midGrey = hexToRgb("808080");

    expect(relativeLuminance(midGrey)).toBeLessThan(0.5);
    expect(isLightBackground(midGrey)).toBe(true);
  });

  it("treats a deep brand colour as dark", () => {
    expect(isLightBackground(hexToRgb("1A2B6B"))).toBe(false);
    expect(isLightBackground(hexToRgb("7B1E3C"))).toBe(false);
  });
});

describe("paletteFor", () => {
  it("keeps the shipped dark palette on the default background", () => {
    const palette = paletteFor("000A19");

    expect(rgbToHex(palette.bgSurface)).toBe("000A19");
    expect(rgbToHex(palette.textBold)).toBe("EEF3FC");
    expect(rgbToHex(palette.textMuted)).toBe("8798B2");
    expect(rgbToHex(palette.timelineLine)).toBe("8798B2");
  });

  it("flips to the dark-on-light set for a pale background", () => {
    const palette = paletteFor("FFFFFF");

    expect(rgbToHex(palette.textBold)).toBe("000A19");
    expect(rgbToHex(palette.textMuted)).toBe("56657D");
    expect(rgbToHex(palette.timelineLine)).toBe("C3CDDC");
  });

  it("keeps both text colours at WCAG AA against any background", () => {
    // The whole reason the foreground is derived rather than picked: no
    // background a designer can choose produces a card that fails to read.
    for (const background of [
      "000A19",
      "FFFFFF",
      "808080",
      "1A2B6B",
      "7B1E3C",
      "C0C0C0",
      "4A4A4A",
    ]) {
      const palette = paletteFor(background);

      expect(
        contrastRatio(palette.textBold, palette.bgSurface),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.textMuted, palette.bgSurface),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("drops the muted colour when no grey-blue can contrast with the background", () => {
    // A mid grey defeats both sets' muted: the light set reaches ~1.5:1 there.
    // Losing the muted-secondary distinction is the visible compromise; text
    // nobody can read is not.
    const midGrey = paletteFor("808080");

    expect(midGrey.textMuted).toEqual(midGrey.textBold);

    // The shipped backgrounds keep their real muted colour.
    expect(paletteFor("000A19").textMuted).not.toEqual(
      paletteFor("000A19").textBold,
    );
    expect(paletteFor("FFFFFF").textMuted).not.toEqual(
      paletteFor("FFFFFF").textBold,
    );
  });
});

describe("normaliseAppearance", () => {
  it("keeps a well-formed pair, upper-casing the colour", () => {
    expect(
      normaliseAppearance({ fontFamily: "Satoshi", background: "ffffff" }),
    ).toEqual({ fontFamily: "Satoshi", background: "FFFFFF" });
  });

  it("falls back on a malformed colour rather than drawing nothing", () => {
    expect(
      normaliseAppearance({ fontFamily: "Satoshi", background: "#fff" }),
    ).toEqual({
      fontFamily: "Satoshi",
      background: DEFAULT_CARD_APPEARANCE.background,
    });
  });

  it("falls back on a blank or missing family", () => {
    expect(normaliseAppearance({ fontFamily: "   " }).fontFamily).toBe(
      DEFAULT_CARD_APPEARANCE.fontFamily,
    );
    expect(normaliseAppearance({}).fontFamily).toBe(
      DEFAULT_CARD_APPEARANCE.fontFamily,
    );
  });

  it("survives anything a hand edit or an older build could leave behind", () => {
    expect(normaliseAppearance(null)).toEqual(DEFAULT_CARD_APPEARANCE);
    expect(normaliseAppearance("nope")).toEqual(DEFAULT_CARD_APPEARANCE);
    expect(normaliseAppearance(undefined)).toEqual(DEFAULT_CARD_APPEARANCE);
  });
});

describe("usableFamilies", () => {
  const family = (name: string, styles: string[]) =>
    styles.map((style) => ({ family: name, style }));

  it("keeps a family carrying Regular, Medium and Bold", () => {
    expect(
      usableFamilies(family("Inter", ["Regular", "Medium", "Bold", "Italic"])),
    ).toEqual(["Inter"]);
  });

  it("drops a family missing any style the card draws with", () => {
    const available = [
      ...family("Satoshi", ["Regular", "Medium", "Bold"]),
      // Real case: plenty of display faces ship Regular and Bold only, and
      // would fall back at publish time if the picker offered them.
      ...family("Playfair Display SC", ["Regular", "Bold"]),
      ...family("Monoline", ["Regular"]),
    ];

    expect(usableFamilies(available)).toEqual(["Satoshi"]);
  });

  it("sorts, so the picker reads alphabetically", () => {
    const available = [
      ...family("Zapf", ["Regular", "Medium", "Bold"]),
      ...family("Archivo", ["Regular", "Medium", "Bold"]),
      ...family("Inter", ["Regular", "Medium", "Bold"]),
    ];

    expect(usableFamilies(available)).toEqual(["Archivo", "Inter", "Zapf"]);
  });

  it("returns nothing when Figma reports nothing", () => {
    expect(usableFamilies([])).toEqual([]);
  });
});
