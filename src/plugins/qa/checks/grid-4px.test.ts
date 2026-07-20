import { describe, it, expect } from "vitest";
import { checkGrid4px } from "./grid-4px";
import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";

/**
 * Minimal fixture builder — only the geometry fields on the variant's tree
 * root matter to this check; everything else gets empty defaults.
 */
function fixture(
  id: string,
  name: string,
  tree: Partial<NodeSnapshot>,
): ComponentSetSnapshot {
  return {
    id,
    name,
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: [
      {
        id: `${id}-variant`,
        name,
        variantProperties: {},
        tree: {
          id: `${id}-variant`,
          name,
          type: "COMPONENT",
          visible: true,
          width: 120,
          height: 40,
          children: [],
          ...tree,
        },
      },
    ],
  };
}

describe("checkGrid4px", () => {
  it("passes when all fixed dims/padding/gap/radius/stroke are on-grid", () => {
    const result = checkGrid4px(
      fixture("1:1", "Button", {
        width: 120,
        height: 40,
        layoutSizingHorizontal: "FIXED",
        layoutSizingVertical: "FIXED",
        paddingTop: 8,
        paddingRight: 16,
        paddingBottom: 8,
        paddingLeft: 16,
        itemSpacing: 4,
        cornerRadius: 2,
        strokeWeight: 4,
      }),
    );
    expect(result.checkId).toBe("grid-4px");
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("warns with per-node findings for off-grid fixed dims/padding/gap/radius/stroke", () => {
    const result = checkGrid4px(
      fixture("1:2", "Button", {
        width: 121,
        height: 41,
        layoutSizingHorizontal: "FIXED",
        layoutSizingVertical: "FIXED",
        paddingTop: 7,
        paddingRight: 15,
        paddingBottom: 9,
        paddingLeft: 5,
        itemSpacing: 3,
        cornerRadius: 6,
        strokeWeight: 10,
      }),
    );
    expect(result.status).toBe("warn");
    expect(result.findings.length).toBeGreaterThanOrEqual(9);
    for (const finding of result.findings) {
      expect(finding.severity).toBe("low");
      expect(finding.nodeId).toBe("1:2-variant");
    }
  });

  it("exempts width when horizontal sizing is Hug, and height when vertical sizing is Fill", () => {
    const result = checkGrid4px(
      fixture("1:3", "Button", {
        width: 121, // off-grid, but exempt
        height: 41, // off-grid, but exempt
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "FILL",
      }),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("handles MIXED corner radius and stroke weight without crashing", () => {
    const result = checkGrid4px(
      fixture("1:4", "Button", {
        cornerRadius: "MIXED",
        strokeWeight: "MIXED",
      }),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("walks nested children and reports off-grid nodes with their own id/name", () => {
    const result = checkGrid4px(
      fixture("1:5", "Button", {
        cornerRadius: 4,
        children: [
          {
            id: "1:5-child",
            name: "Label",
            type: "TEXT",
            visible: true,
            width: 50,
            height: 21,
            layoutSizingHorizontal: "FIXED",
            layoutSizingVertical: "FIXED",
            children: [],
          },
        ],
      }),
    );
    expect(result.status).toBe("warn");
    expect(
      result.findings.some(
        (f) => f.nodeId === "1:5-child" && f.nodeName === "Label",
      ),
    ).toBe(true);
  });
});
