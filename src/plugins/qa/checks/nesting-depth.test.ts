import { describe, it, expect } from "vitest";
import { checkNestingDepth } from "./nesting-depth";
import type {
  ComponentSetSnapshot,
  ExposedInstanceSnapshot,
  NodeSnapshot,
} from "../snapshot";

function baseTree(id: string, overrides: Partial<NodeSnapshot>): NodeSnapshot {
  return {
    id,
    name: "Button",
    type: "COMPONENT",
    visible: true,
    width: 120,
    height: 40,
    children: [],
    ...overrides,
  };
}

function fixture(variants: NodeSnapshot[]): ComponentSetSnapshot {
  return {
    id: "1:0",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: variants.map((tree, i) => ({
      id: tree.id,
      name: `Button-${i}`,
      variantProperties: {},
      tree,
    })),
  };
}

function exposed(
  id: string,
  name: string,
  children: ExposedInstanceSnapshot[] = [],
): ExposedInstanceSnapshot {
  return { id, name, exposedInstances: children };
}

describe("checkNestingDepth", () => {
  it("passes when nothing is exposed", () => {
    const result = checkNestingDepth(fixture([baseTree("1:1", {})]));
    expect(result.checkId).toBe("nesting-depth");
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("passes at the threshold depth (2)", () => {
    const tree = baseTree("1:2", {
      exposedInstances: [exposed("1:2-icon", "Icon", [exposed("1:2-fill", "Fill")])],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("warns above the threshold depth", () => {
    const tree = baseTree("1:3", {
      exposedInstances: [
        exposed("1:3-icon", "Icon", [
          exposed("1:3-fill", "Fill", [exposed("1:3-glyph", "Glyph")]),
        ]),
      ],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.severity).toBe("low");
    expect(finding.nodeId).toBe("1:3-glyph");
    expect(finding.actual).toBe("3 levels");
    expect(finding.count).toBe(1);
  });

  it("emits one finding per unique chain across multiple distinct chains", () => {
    const tree = baseTree("1:4", {
      children: [
        baseTree("1:4-a", {
          name: "SlotA",
          exposedInstances: [
            exposed("1:4-a-1", "Icon", [
              exposed("1:4-a-2", "Fill", [exposed("1:4-a-3", "Glyph")]),
            ]),
          ],
        }),
        baseTree("1:4-b", {
          name: "SlotB",
          exposedInstances: [
            exposed("1:4-b-1", "Avatar", [
              exposed("1:4-b-2", "Image", [exposed("1:4-b-3", "Crop")]),
            ]),
          ],
        }),
      ],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(2);
  });

  it("collapses the same chain repeated across many variants into one finding with the occurrence count", () => {
    const makeVariant = (id: string) =>
      baseTree(id, {
        exposedInstances: [
          exposed(`${id}-icon`, "Icon", [
            exposed(`${id}-fill`, "Fill", [exposed(`${id}-glyph`, "Glyph")]),
          ]),
        ],
      });

    const variants = Array.from({ length: 64 }, (_, i) =>
      makeVariant(`1:${i}`),
    );
    const result = checkNestingDepth(fixture(variants));

    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(64);
    // Representative node points at the first variant's occurrence.
    expect(result.findings[0].nodeId).toBe("1:0-glyph");
  });
});
