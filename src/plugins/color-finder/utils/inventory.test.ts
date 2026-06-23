import { describe, it, expect } from "vitest";
import { buildColorInventory } from "./inventory";
import { ColorRole, ColorUsage, UsageContainer } from "../types";

const container = (id: string, name = id, type = "FRAME"): UsageContainer => ({
  id,
  name,
  type,
});

const usage = (over: Partial<ColorUsage> = {}): ColorUsage => ({
  hex: "#FF0000",
  opacity: 1,
  role: "background" as ColorRole,
  container: container("c1"),
  variableName: null,
  styleName: null,
  ...over,
});

const opts = (
  over: Partial<Parameters<typeof buildColorInventory>[1]> = {},
) => ({
  pagesScanned: 1,
  otherSkipped: 0,
  ...over,
});

function section(inv: ReturnType<typeof buildColorInventory>, role: ColorRole) {
  return inv.sections.find((s) => s.role === role)!;
}

describe("buildColorInventory", () => {
  it("groups usages into the correct role sections", () => {
    const inv = buildColorInventory(
      [
        usage({ role: "background", hex: "#111111" }),
        usage({ role: "text", hex: "#222222" }),
        usage({ role: "border", hex: "#333333" }),
      ],
      opts(),
    );

    expect(section(inv, "background").colors.map((c) => c.hex)).toEqual([
      "#111111",
    ]);
    expect(section(inv, "text").colors.map((c) => c.hex)).toEqual(["#222222"]);
    expect(section(inv, "border").colors.map((c) => c.hex)).toEqual([
      "#333333",
    ]);
  });

  it("always emits the four sections in background/text/border/icon order", () => {
    const inv = buildColorInventory([], opts());
    expect(inv.sections.map((s) => s.role)).toEqual([
      "background",
      "text",
      "border",
      "icon",
    ]);
  });

  it("groups icon usages into the icon section", () => {
    const inv = buildColorInventory(
      [usage({ role: "icon", hex: "#ABCDEF" })],
      opts(),
    );
    expect(section(inv, "icon").colors.map((c) => c.hex)).toEqual(["#ABCDEF"]);
    expect(inv.summary.byRole.icon).toBe(1);
  });

  it("dedups by hex + opacity (same hex, different opacity = two colors)", () => {
    const inv = buildColorInventory(
      [
        usage({ hex: "#FF0000", opacity: 1 }),
        usage({ hex: "#FF0000", opacity: 0.5 }),
      ],
      opts(),
    );
    const colors = section(inv, "background").colors;
    expect(colors).toHaveLength(2);
    expect(colors.map((c) => c.opacity).sort()).toEqual([0.5, 1]);
  });

  it("treats the same hex in different roles as distinct colors", () => {
    const inv = buildColorInventory(
      [
        usage({ hex: "#ABCDEF", role: "background" }),
        usage({ hex: "#ABCDEF", role: "text" }),
      ],
      opts(),
    );
    expect(section(inv, "background").colors).toHaveLength(1);
    expect(section(inv, "text").colors).toHaveLength(1);
    expect(inv.summary.uniqueTotal).toBe(2);
  });

  it("sums usage counts across usages of the same color", () => {
    const inv = buildColorInventory(
      [
        usage({ container: container("a") }),
        usage({ container: container("b") }),
        usage({ container: container("a") }),
      ],
      opts(),
    );
    expect(section(inv, "background").colors[0].count).toBe(3);
  });

  it("sorts a section by usage count descending by default", () => {
    const inv = buildColorInventory(
      [
        usage({ hex: "#AAAAAA" }),
        usage({ hex: "#BBBBBB" }),
        usage({ hex: "#BBBBBB" }),
        usage({ hex: "#CCCCCC" }),
        usage({ hex: "#CCCCCC" }),
        usage({ hex: "#CCCCCC" }),
      ],
      opts(),
    );
    expect(section(inv, "background").colors.map((c) => c.hex)).toEqual([
      "#CCCCCC",
      "#BBBBBB",
      "#AAAAAA",
    ]);
  });

  it("sorts by hue when sortByHue is set", () => {
    // Red (h≈0), green (h≈120), blue (h≈240). Counts are inverse to prove the
    // hue sort overrides the count sort.
    const inv = buildColorInventory(
      [
        usage({ hex: "#0000FF" }),
        usage({ hex: "#0000FF" }),
        usage({ hex: "#0000FF" }),
        usage({ hex: "#00FF00" }),
        usage({ hex: "#00FF00" }),
        usage({ hex: "#FF0000" }),
      ],
      opts({ sortByHue: true }),
    );
    expect(section(inv, "background").colors.map((c) => c.hex)).toEqual([
      "#FF0000",
      "#00FF00",
      "#0000FF",
    ]);
  });

  it("produces distinct where-used containers, capped, with overflow count", () => {
    const usages: ColorUsage[] = [];
    // 12 distinct containers, each used once → cap 10 keeps 10, overflow 2.
    for (let i = 0; i < 12; i++) {
      usages.push(usage({ container: container(`c${i}`) }));
    }
    const inv = buildColorInventory(usages, opts({ whereUsedCap: 10 }));
    const color = section(inv, "background").colors[0];
    expect(color.whereUsed).toHaveLength(10);
    expect(color.whereUsedOverflow).toBe(2);
    expect(color.count).toBe(12);
  });

  it("de-duplicates repeated containers in where-used", () => {
    const inv = buildColorInventory(
      [
        usage({ container: container("only") }),
        usage({ container: container("only") }),
        usage({ container: container("only") }),
      ],
      opts(),
    );
    const color = section(inv, "background").colors[0];
    expect(color.whereUsed).toHaveLength(1);
    expect(color.whereUsedOverflow).toBe(0);
    expect(color.count).toBe(3);
  });

  it("orders where-used by per-container usage count", () => {
    const inv = buildColorInventory(
      [
        usage({ container: container("rare") }),
        usage({ container: container("common") }),
        usage({ container: container("common") }),
        usage({ container: container("common") }),
      ],
      opts({ whereUsedCap: 1 }),
    );
    const color = section(inv, "background").colors[0];
    expect(color.whereUsed.map((c) => c.id)).toEqual(["common"]);
    expect(color.whereUsedOverflow).toBe(1);
  });

  it("passes through a variable name and treats variable-bound colors as tokenized", () => {
    const inv = buildColorInventory(
      [
        usage({ hex: "#123456", variableName: null }),
        usage({ hex: "#123456", variableName: "color/primary" }),
      ],
      opts(),
    );
    const color = section(inv, "background").colors[0];
    expect(color.variableName).toBe("color/primary");
    expect(inv.summary.untokenized).toBe(0);
  });

  it("merges a variable and a style from different usages of the same color", () => {
    const inv = buildColorInventory(
      [
        usage({
          hex: "#123456",
          variableName: "color/primary",
          styleName: null,
        }),
        usage({
          hex: "#123456",
          variableName: null,
          styleName: "Brand/Primary",
        }),
      ],
      opts(),
    );
    const color = section(inv, "background").colors[0];
    expect(color.variableName).toBe("color/primary");
    expect(color.styleName).toBe("Brand/Primary");
  });

  it("treats a style-only color as untokenized (only a variable counts)", () => {
    const inv = buildColorInventory(
      [
        usage({
          hex: "#123456",
          variableName: null,
          styleName: "Brand/Primary",
        }),
      ],
      opts(),
    );
    expect(inv.summary.untokenized).toBe(1);
  });

  it("computes summary totals (unique, by role, untokenized, otherSkipped)", () => {
    const inv = buildColorInventory(
      [
        usage({ role: "background", hex: "#111111", variableName: "bg/base" }),
        usage({ role: "background", hex: "#222222" }),
        usage({ role: "text", hex: "#333333" }),
        usage({ role: "border", hex: "#444444" }),
        usage({ role: "icon", hex: "#555555" }),
      ],
      opts({ pagesScanned: 3, otherSkipped: 7 }),
    );
    expect(inv.summary).toEqual({
      pagesScanned: 3,
      uniqueTotal: 5,
      byRole: { background: 2, text: 1, border: 1, icon: 1 },
      untokenized: 4,
      otherSkipped: 7,
    });
  });

  it("computes HSL for each color", () => {
    const inv = buildColorInventory([usage({ hex: "#FF0000" })], opts());
    expect(section(inv, "background").colors[0].hsl).toEqual({
      h: 0,
      s: 100,
      l: 50,
    });
  });

  it("handles an empty usage list", () => {
    const inv = buildColorInventory([], opts({ pagesScanned: 2 }));
    expect(inv.summary.uniqueTotal).toBe(0);
    expect(inv.summary.pagesScanned).toBe(2);
    expect(inv.sections.every((s) => s.colors.length === 0)).toBe(true);
  });
});
