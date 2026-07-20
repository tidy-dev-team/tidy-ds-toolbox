import { describe, it, expect } from "vitest";
import { checkTokens } from "./tokens";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  PaintSnapshot,
} from "../snapshot";

/** Build a single NodeSnapshot with sensible defaults. */
function node(overrides: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    id: "n:1",
    name: "Layer",
    type: "FRAME",
    visible: true,
    width: 10,
    height: 10,
    children: [],
    ...overrides,
  };
}

/** Wrap a tree in a one-variant ComponentSetSnapshot. */
function setWith(tree: NodeSnapshot): ComponentSetSnapshot {
  return {
    id: "cs:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: [{ id: "v:1", name: "Default", variantProperties: {}, tree }],
  };
}

/** SOLID, visible, opaque, no bound variable — the untokenized paint. */
function rawPaint(overrides: Partial<PaintSnapshot> = {}): PaintSnapshot {
  return {
    type: "SOLID",
    visible: true,
    opacity: 1,
    hex: "#FF0000",
    ...overrides,
  };
}

describe("checkTokens", () => {
  it("uses the correct check id and title", () => {
    const result = checkTokens(setWith(node()));
    expect(result.checkId).toBe("tokens");
    expect(result.title).toBe("Tokens (Styles & Variables)");
  });

  // --- fills / strokes ---
  it("flags a raw fill on a visible layer", () => {
    const result = checkTokens(setWith(node({ fills: [rawPaint()] })));
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "n:1",
      nodeName: "Layer",
    });
  });

  it("flags a raw stroke on a visible layer", () => {
    const result = checkTokens(setWith(node({ strokes: [rawPaint()] })));
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
  });

  it("passes a fill bound to a color variable", () => {
    const result = checkTokens(
      setWith(
        node({ fills: [rawPaint({ boundVariableId: "VariableID:1:2" })] }),
      ),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("skips a fully transparent fill", () => {
    const result = checkTokens(
      setWith(node({ fills: [rawPaint({ opacity: 0 })] })),
    );
    expect(result.status).toBe("pass");
  });

  it("skips an image fill", () => {
    const result = checkTokens(
      setWith(node({ fills: [rawPaint({ type: "IMAGE", hex: undefined })] })),
    );
    expect(result.status).toBe("pass");
  });

  it("skips a gradient fill", () => {
    const result = checkTokens(
      setWith(
        node({
          fills: [rawPaint({ type: "GRADIENT_LINEAR", hex: undefined })],
        }),
      ),
    );
    expect(result.status).toBe("pass");
  });

  it("does nothing when there is no fill", () => {
    const result = checkTokens(setWith(node()));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("skips an invisible paint entry", () => {
    const result = checkTokens(
      setWith(node({ fills: [rawPaint({ visible: false })] })),
    );
    expect(result.status).toBe("pass");
  });

  // --- visibility / naming walk rules ---
  it("skips a hidden layer (and its subtree)", () => {
    const hidden = node({
      id: "n:2",
      visible: false,
      fills: [rawPaint()],
      children: [node({ id: "n:3", fills: [rawPaint()] })],
    });
    const result = checkTokens(setWith(hidden));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it('skips a "."-prefixed layer (and its subtree)', () => {
    const dotted = node({
      id: "n:2",
      name: ".bg",
      fills: [rawPaint()],
      children: [node({ id: "n:3", fills: [rawPaint()] })],
    });
    const result = checkTokens(setWith(dotted));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  // --- typography ---
  it("flags unstyled text", () => {
    const result = checkTokens(
      setWith(node({ type: "TEXT", textStyleId: "" })),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ nodeId: "n:1" });
  });

  it("passes text bound to a text style", () => {
    const result = checkTokens(
      setWith(node({ type: "TEXT", textStyleId: "S:123" })),
    );
    expect(result.status).toBe("pass");
  });

  it("warns on mixed text-style ranges", () => {
    const result = checkTokens(
      setWith(node({ type: "TEXT", textStyleId: "MIXED" })),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("low");
  });

  // --- spacing ---
  it("flags non-zero unbound padding and gap", () => {
    const result = checkTokens(
      setWith(
        node({
          layoutMode: "HORIZONTAL",
          paddingLeft: 8,
          itemSpacing: 4,
          boundVariableKeys: [],
        }),
      ),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(2);
  });

  it("passes non-zero spacing bound to variables", () => {
    const result = checkTokens(
      setWith(
        node({
          layoutMode: "HORIZONTAL",
          paddingLeft: 8,
          itemSpacing: 4,
          boundVariableKeys: ["paddingLeft", "itemSpacing"],
        }),
      ),
    );
    expect(result.status).toBe("pass");
  });

  it("exempts zero padding and gap", () => {
    const result = checkTokens(
      setWith(
        node({
          layoutMode: "HORIZONTAL",
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          itemSpacing: 0,
          boundVariableKeys: [],
        }),
      ),
    );
    expect(result.status).toBe("pass");
  });

  // --- effects ---
  it("flags an unstyled effect when an effect is present", () => {
    const result = checkTokens(
      setWith(node({ effectCount: 1, effectStyleId: "" })),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
  });

  it("passes an effect bound to an effect style", () => {
    const result = checkTokens(
      setWith(node({ effectCount: 1, effectStyleId: "S:eff" })),
    );
    expect(result.status).toBe("pass");
  });

  it("skips effects when no effect is present", () => {
    const result = checkTokens(
      setWith(node({ effectCount: 0, effectStyleId: "" })),
    );
    expect(result.status).toBe("pass");
  });

  // --- aggregation across the tree / variants ---
  it("walks nested visible children", () => {
    const tree = node({
      children: [node({ id: "n:child", fills: [rawPaint()] })],
    });
    const result = checkTokens(setWith(tree));
    expect(result.status).toBe("fail");
    expect(result.findings[0]).toMatchObject({ nodeId: "n:child" });
  });
});
