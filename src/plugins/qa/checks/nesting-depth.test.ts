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

function entry(
  id: string,
  name: string,
  exposedInstanceIds: string[] = [],
): ExposedInstanceSnapshot {
  return { id, name, exposedInstanceIds };
}

describe("checkNestingDepth", () => {
  it("passes when nothing is exposed", () => {
    const result = checkNestingDepth(fixture([baseTree("1:1", {})]));
    expect(result.checkId).toBe("nesting-depth");
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("passes at the threshold depth (2): container exposing one direct instance", () => {
    // Icon (the container INSTANCE node) exposes Fill directly. Figma flattens
    // this the same as the deeper case: Icon.exposedInstances = [Fill].
    const tree = baseTree("1:2", {
      name: "Icon",
      isExposedInstance: true,
      exposedInstances: [entry("1:2-fill", "Fill")],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("warns above the threshold depth for a real 3-level nested chain", () => {
    // Icon exposes both Fill and Glyph (flattened — Figma lists every exposed
    // descendant on the container, not just the direct child), and Fill's own
    // exposedInstanceIds subset marks Glyph as reachable through Fill, so
    // Glyph is Fill's direct child, not Icon's.
    const tree = baseTree("1:3", {
      name: "Icon",
      isExposedInstance: true,
      exposedInstances: [
        entry("1:3-fill", "Fill", ["1:3-glyph"]),
        entry("1:3-glyph", "Glyph"),
      ],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.severity).toBe("low");
    expect(finding.nodeId).toBe("1:3-glyph");
    expect(finding.message).toContain("Icon > Fill > Glyph");
    expect(finding.actual).toBe("3 levels");
    expect(finding.count).toBe(1);
  });

  it("does not misread the flattened list as a chain skipping a level", () => {
    // A 4-entity chain Icon > A > B > C, fully flattened onto Icon:
    // Icon.exposedInstances = [A, B, C] (all reachable, per Figma's semantics).
    // Only A is Icon's real direct child; B and C must resolve under A > B.
    const tree = baseTree("1:6", {
      name: "Icon",
      isExposedInstance: true,
      exposedInstances: [
        entry("1:6-a", "A", ["1:6-b", "1:6-c"]),
        entry("1:6-b", "B", ["1:6-c"]),
        entry("1:6-c", "C"),
      ],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("warn");
    // A single real chain, not a phantom "Icon > B" or "Icon > C" shortcut.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("Icon > A > B > C");
    expect(result.findings[0].actual).toBe("4 levels");
  });

  it("passes when the container itself isn't exposed, even if its own internal chain would otherwise warn", () => {
    // Icon is NOT exposed to Button's panel — Button's panel shows nothing
    // from Icon, regardless of how deep Icon's own exposedInstances side-tree
    // (Fill > Glyph, an internal detail of Icon's own component) goes.
    const tree = baseTree("1:7", {
      name: "Icon",
      isExposedInstance: false,
      exposedInstances: [
        entry("1:7-fill", "Fill", ["1:7-glyph"]),
        entry("1:7-glyph", "Glyph"),
      ],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("reports the established prefix instead of dropping it when a descendant id doesn't resolve", () => {
    // Icon > A is real; A claims to expose "1:8-missing", an id absent from
    // the flattened list — a stale snapshot or API surprise the documented
    // "fully transitive" exposure shouldn't produce, but the chain should
    // still surface Icon > A rather than vanish silently.
    const tree = baseTree("1:8", {
      name: "Icon",
      isExposedInstance: true,
      exposedInstances: [entry("1:8-a", "A", ["1:8-missing"])],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("pass"); // "Icon > A" is only 2 levels deep
    expect(result.findings).toEqual([]);
  });

  it("warns with the established prefix (not silently dropped) when the unresolved id would push depth over threshold", () => {
    const tree = baseTree("1:9", {
      name: "Icon",
      isExposedInstance: true,
      exposedInstances: [
        entry("1:9-a", "A", ["1:9-b"]),
        entry("1:9-b", "B", ["1:9-missing"]),
      ],
    });
    const result = checkNestingDepth(fixture([tree]));
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].message).toContain("Icon > A > B");
    expect(result.findings[0].nodeId).toBe("1:9-b");
    expect(result.findings[0].actual).toBe("3 levels");
  });

  it("emits one finding per unique chain across multiple distinct chains", () => {
    const tree = baseTree("1:4", {
      children: [
        baseTree("1:4-a", {
          name: "SlotA",
          isExposedInstance: true,
          exposedInstances: [
            entry("1:4-a-fill", "Fill", ["1:4-a-glyph"]),
            entry("1:4-a-glyph", "Glyph"),
          ],
        }),
        baseTree("1:4-b", {
          name: "SlotB",
          isExposedInstance: true,
          exposedInstances: [
            entry("1:4-b-image", "Image", ["1:4-b-crop"]),
            entry("1:4-b-crop", "Crop"),
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
        name: "Icon",
        isExposedInstance: true,
        exposedInstances: [
          entry(`${id}-fill`, "Fill", [`${id}-glyph`]),
          entry(`${id}-glyph`, "Glyph"),
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
