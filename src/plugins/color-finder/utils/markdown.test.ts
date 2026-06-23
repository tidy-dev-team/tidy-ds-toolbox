import { describe, it, expect } from "vitest";
import { serializeInventoryToMarkdown } from "./markdown";
import { ColorInventory } from "../types";

const inventory: ColorInventory = {
  summary: {
    pagesScanned: 2,
    uniqueTotal: 3,
    byRole: { background: 2, text: 1, border: 0, icon: 0 },
    untokenized: 2,
    otherSkipped: 1,
  },
  sections: [
    {
      role: "background",
      colors: [
        {
          hex: "#FF0000",
          opacity: 1,
          hsl: { h: 0, s: 100, l: 50 },
          count: 5,
          variableName: "color/primary",
          styleName: "Brand/Primary",
          whereUsed: [
            { id: "1", name: "Button", type: "COMPONENT_SET" },
            { id: "2", name: "Card", type: "FRAME" },
          ],
          whereUsedOverflow: 3,
        },
        {
          hex: "#00FF00",
          opacity: 0.5,
          hsl: { h: 120, s: 100, l: 50 },
          count: 1,
          variableName: null,
          styleName: null,
          whereUsed: [{ id: "3", name: "Banner", type: "SECTION" }],
          whereUsedOverflow: 0,
        },
      ],
    },
    {
      role: "text",
      colors: [
        {
          hex: "#111111",
          opacity: 1,
          hsl: { h: 0, s: 0, l: 7 },
          count: 9,
          variableName: null,
          styleName: null,
          whereUsed: [],
          whereUsedOverflow: 0,
        },
      ],
    },
    { role: "border", colors: [] },
    { role: "icon", colors: [] },
  ],
};

describe("serializeInventoryToMarkdown", () => {
  const md = serializeInventoryToMarkdown(inventory);

  it("includes a top-level heading and the summary line", () => {
    expect(md).toContain("# Color Inventory");
    expect(md).toContain(
      "3 unique colors — 2 background, 1 text, 0 border, 0 icon; 2 untokenized (2 pages scanned).",
    );
  });

  it("emits a section per role with a header row", () => {
    expect(md).toContain("## Backgrounds (2)");
    expect(md).toContain("## Text (1)");
    expect(md).toContain("## Borders (0)");
    expect(md).toContain("## Icons (0)");
    expect(md).toContain("| Hex | HSL | Variable | Style | Count | Where used |");
  });

  it("renders a row per color with hex, opacity, variable, style, count", () => {
    expect(md).toContain(
      "| #FF0000 | H 0 S 100 L 50 | color/primary | Brand/Primary | 5 |",
    );
    expect(md).toContain("| #00FF00 · 50% | H 120 S 100 L 50 | Raw | — | 1 |");
  });

  it("renders where-used containers with the overflow remainder", () => {
    expect(md).toContain("Button, Card and 3 more |");
  });

  it("shows Raw/— for untokenized colors and — for no containers", () => {
    expect(md).toContain("| #111111 | H 0 S 0 L 7 | Raw | — | 9 | — |");
  });

  it("shows a _none_ row for an empty section", () => {
    expect(md).toContain("| _none_ |");
  });
});
