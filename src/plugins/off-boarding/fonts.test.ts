/**
 * The reported failure (a designer clicked "Pack 1 Page" and got
 * `in appendChild: unloaded font " "`) had two halves: pack loaded no fonts at
 * all, and the one text node that stopped it could not have been fixed by
 * loading `node.fontName` either, because that node's font was mixed.
 *
 * These tests hold the second half. The first half is a one-line call site; the
 * part that can silently regress is *which* fonts get collected.
 */

import { describe, it, expect } from "vitest";
import {
  collectFonts,
  describeFonts,
  fontKey,
  loadFonts,
  type FontRef,
  type TextLike,
} from "./fonts";

/** Stands in for `figma.mixed`, which is a symbol the sandbox owns. */
const MIXED = Symbol("figma.mixed");

function plainText(family: string, style: string): TextLike {
  return {
    fontName: { family, style },
    getStyledTextSegments: () => {
      throw new Error("a single-font node must not be segmented");
    },
  };
}

function mixedText(...fonts: FontRef[]): TextLike {
  return {
    fontName: MIXED,
    getStyledTextSegments: () => fonts.map((fontName) => ({ fontName })),
  };
}

describe("collectFonts", () => {
  it("takes the font of a single-font text node", () => {
    expect(collectFonts([plainText("Inter", "Regular")], MIXED)).toEqual([
      { family: "Inter", style: "Regular" },
    ]);
  });

  it("takes every segment font of a mixed text node", () => {
    const fonts = collectFonts(
      [
        mixedText(
          { family: "Inter", style: "Regular" },
          { family: "Inter", style: "Bold" },
        ),
      ],
      MIXED,
    );

    expect(fonts).toEqual([
      { family: "Inter", style: "Regular" },
      { family: "Inter", style: "Bold" },
    ]);
  });

  it("deduplicates across nodes, so a page of one font loads one font", () => {
    const fonts = collectFonts(
      [
        plainText("Inter", "Regular"),
        plainText("Inter", "Regular"),
        mixedText(
          { family: "Inter", style: "Regular" },
          { family: "Roboto", style: "Medium" },
        ),
      ],
      MIXED,
    );

    expect(fonts).toEqual([
      { family: "Inter", style: "Regular" },
      { family: "Roboto", style: "Medium" },
    ]);
  });

  it("keeps two styles of one family apart", () => {
    expect(fontKey({ family: "Inter", style: "Regular" })).not.toBe(
      fontKey({ family: "Inter", style: "Bold" }),
    );
  });

  it("drops a font with no family, which nothing could load anyway", () => {
    const fonts = collectFonts(
      [plainText("", ""), plainText("Inter", "Regular")],
      MIXED,
    );

    expect(fonts).toEqual([{ family: "Inter", style: "Regular" }]);
  });

  it("ignores a fontName that is neither a font nor the mixed symbol", () => {
    const broken = {
      fontName: undefined,
      getStyledTextSegments: () => [],
    } satisfies TextLike;

    expect(collectFonts([broken], MIXED)).toEqual([]);
  });
});

describe("loadFonts", () => {
  it("loads every font and reports none when all succeed", async () => {
    const loaded: FontRef[] = [];
    const failures = await loadFonts(
      [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Bold" },
      ],
      async (font) => void loaded.push(font),
    );

    expect(loaded).toHaveLength(2);
    expect(failures).toEqual([]);
  });

  it("returns the fonts it could not load, and does not throw", async () => {
    const failures = await loadFonts(
      [
        { family: "Inter", style: "Regular" },
        { family: "Missing Sans", style: "Regular" },
      ],
      async (font) => {
        if (font.family === "Missing Sans") {
          throw new Error("Cannot load font");
        }
      },
    );

    expect(failures).toEqual([{ family: "Missing Sans", style: "Regular" }]);
  });
});

describe("describeFonts", () => {
  it("names one font", () => {
    expect(describeFonts([{ family: "Inter", style: "Bold" }])).toBe(
      '"Inter Bold"',
    );
  });

  it("joins two with and", () => {
    expect(
      describeFonts([
        { family: "Inter", style: "Bold" },
        { family: "Roboto", style: "Regular" },
      ]),
    ).toBe('"Inter Bold" and "Roboto Regular"');
  });

  it("counts the rest rather than listing a whole font book", () => {
    const many: FontRef[] = ["A", "B", "C", "D", "E"].map((family) => ({
      family,
      style: "Regular",
    }));

    expect(describeFonts(many)).toBe(
      '"A Regular", "B Regular", "C Regular" and 2 more',
    );
  });
});
