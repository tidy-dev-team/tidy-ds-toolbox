import { describe, expect, it } from "vitest";
import { TOKENS, paint, fill, stroke } from "./buildChrome";

describe("TOKENS", () => {
  it("is a flat map of #RRGGBB hex strings", () => {
    for (const [name, hex] of Object.entries(TOKENS)) {
      expect(hex, name).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("has no duplicate values", () => {
    const values = Object.values(TOKENS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("paint", () => {
  it("converts a hex token to a SOLID paint with normalized RGB", () => {
    expect(paint(TOKENS.card)).toEqual({
      type: "SOLID",
      color: { r: 1, g: 1, b: 1 },
    });
  });

  it("converts black correctly", () => {
    expect(paint(TOKENS.black)).toEqual({
      type: "SOLID",
      color: { r: 0, g: 0, b: 0 },
    });
  });

  it("omits opacity when not given", () => {
    expect(paint(TOKENS.ink)).not.toHaveProperty("opacity");
  });

  it("carries opacity through when given", () => {
    expect(paint(TOKENS.marker, 0.16)).toEqual({
      type: "SOLID",
      color: expect.any(Object),
      opacity: 0.16,
    });
  });
});

describe("fill", () => {
  it("sets a single-entry SOLID fills array on the node", () => {
    const node = { fills: [] } as unknown as MinimalFillsMixin;
    fill(node, TOKENS.good);
    expect(node.fills).toEqual([paint(TOKENS.good)]);
  });

  it("forwards opacity", () => {
    const node = { fills: [] } as unknown as MinimalFillsMixin;
    fill(node, TOKENS.bad, 0.5);
    expect(node.fills).toEqual([paint(TOKENS.bad, 0.5)]);
  });
});

describe("stroke", () => {
  it("sets a single-entry SOLID strokes array on the node", () => {
    const node = { strokes: [] } as unknown as MinimalStrokesMixin;
    stroke(node, TOKENS.border);
    expect(node.strokes).toEqual([paint(TOKENS.border)]);
  });
});
