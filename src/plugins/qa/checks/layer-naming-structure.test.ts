import { describe, it, expect } from "vitest";
import { checkLayerNamingStructure } from "./layer-naming-structure";
import type { NodeSnapshot } from "../snapshot";
import type { ComponentSetSnapshot } from "../snapshot";

/** Node factory with sensible defaults; override only what a case needs. */
function node(
  partial: Partial<NodeSnapshot> & { id: string; name: string },
): NodeSnapshot {
  return {
    type: "FRAME",
    visible: true,
    width: 100,
    height: 100,
    children: [],
    ...partial,
  };
}

/** A visible solid fill — enough to make a node "have a background". */
const SOLID_FILL = { type: "SOLID", visible: true, opacity: 1, hex: "#FFFFFF" };

/** Wrap a single tree as a one-variant component set. */
function set(tree: NodeSnapshot): ComponentSetSnapshot {
  return {
    id: "0:1",
    name: "Button",
    type: "COMPONENT",
    description: "",
    propertyNames: [],
    properties: [],
    variants: [{ id: tree.id, name: tree.name, variantProperties: {}, tree }],
  };
}

describe("checkLayerNamingStructure — name cleanliness", () => {
  it("warns on a default Figma layer name", () => {
    const result = checkLayerNamingStructure(
      set(
        node({
          id: "1:0",
          name: "Root",
          fills: [SOLID_FILL],
          children: [node({ id: "1:1", name: "Frame 1204" })],
        }),
      ),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "1:1",
      nodeName: "Frame 1204",
    });
  });

  it("passes when every name is clean", () => {
    const result = checkLayerNamingStructure(
      set(
        node({
          id: "2:0",
          name: "Root",
          fills: [SOLID_FILL],
          children: [
            node({ id: "2:1", name: "Icon" }),
            node({ id: "2:2", name: "Label" }),
          ],
        }),
      ),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("does NOT inspect the interiors of a nested instance", () => {
    // The snapshot excludes instance interiors by design; this fabricates one
    // to prove the walk never descends into INSTANCE children.
    const result = checkLayerNamingStructure(
      set(
        node({
          id: "3:0",
          name: "Root",
          fills: [SOLID_FILL],
          children: [
            node({
              id: "3:1",
              name: "Avatar",
              type: "INSTANCE",
              mainComponentId: "9:9",
              children: [
                node({ id: "3:2", name: "Vector 3" }),
                node({ id: "3:3", name: "Rectangle 7" }),
              ],
            }),
          ],
        }),
      ),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });
});

describe("checkLayerNamingStructure — structural redundancy", () => {
  const redundantChild = node({
    id: "r:2",
    name: "Label",
    layoutMode: "VERTICAL",
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
  });

  function wrapperTree(wrapper: Partial<NodeSnapshot>): ComponentSetSnapshot {
    return set(
      node({
        id: "r:0",
        name: "Root",
        fills: [SOLID_FILL], // keep the root out of the redundancy check
        layoutMode: "VERTICAL",
        children: [
          node({
            id: "r:1",
            name: "Content",
            layoutMode: "VERTICAL",
            layoutSizingHorizontal: "FILL",
            layoutSizingVertical: "HUG",
            children: [redundantChild],
            ...wrapper,
          }),
        ],
      }),
    );
  }

  it("warns on a genuinely redundant single-child wrapper", () => {
    const result = checkLayerNamingStructure(wrapperTree({}));
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ nodeId: "r:1" });
  });

  it("does NOT flag a wrapper with padding", () => {
    const result = checkLayerNamingStructure(wrapperTree({ paddingTop: 8 }));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("does NOT flag a wrapper with a background fill", () => {
    const result = checkLayerNamingStructure(
      wrapperTree({ fills: [SOLID_FILL] }),
    );
    expect(result.findings).toEqual([]);
  });

  it("does NOT flag a wrapper with a stroke", () => {
    const result = checkLayerNamingStructure(
      wrapperTree({ strokes: [SOLID_FILL] }),
    );
    expect(result.findings).toEqual([]);
  });

  it("does NOT flag a wrapper with an effect", () => {
    const result = checkLayerNamingStructure(wrapperTree({ effectCount: 1 }));
    expect(result.findings).toEqual([]);
  });

  it("does NOT flag a wrapper whose layout axis differs from its child", () => {
    const result = checkLayerNamingStructure(
      wrapperTree({ layoutMode: "HORIZONTAL" }),
    );
    expect(result.findings).toEqual([]);
  });

  it("does NOT flag a multi-child wrapper", () => {
    const result = checkLayerNamingStructure(
      wrapperTree({
        children: [redundantChild, node({ id: "r:3", name: "Extra" })],
      }),
    );
    expect(result.findings).toEqual([]);
  });
});
