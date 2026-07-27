import { describe, it, expect } from "vitest";
import { checkResponsiveBounds } from "./responsive-bounds";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  VariantSnapshot,
} from "../snapshot";

type Bounds = Pick<
  NodeSnapshot,
  "minWidth" | "maxWidth" | "minHeight" | "maxHeight"
>;

function root(
  id: string,
  boundsApplicable: boolean,
  bounds: Bounds = {},
): NodeSnapshot {
  return {
    id,
    name: `Variant ${id}`,
    type: "COMPONENT",
    visible: true,
    width: 100,
    height: 40,
    children: [],
    ...(boundsApplicable ? { boundsApplicable: true } : {}),
    ...bounds,
  };
}

function fixture(roots: NodeSnapshot[]): ComponentSetSnapshot {
  const variants: VariantSnapshot[] = roots.map((tree) => ({
    id: tree.id,
    name: tree.name,
    variantProperties: {},
    tree,
  }));
  return {
    id: "1:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants,
  };
}

describe("checkResponsiveBounds (#7)", () => {
  it("warns, never fails, when no bound at all is set", () => {
    const result = checkResponsiveBounds(fixture([root("1", true)]));
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("low");
  });

  it("passes when any single bound is set, since completeness is not required", () => {
    // Requiring all four would put a finding on nearly every component, which
    // is how a checklist row stops being read.
    for (const bound of [
      { minWidth: 120 },
      { maxWidth: 320 },
      { minHeight: 32 },
      { maxHeight: 80 },
    ]) {
      const result = checkResponsiveBounds(fixture([root("1", true, bound)]));
      expect(result.status).toBe("pass");
      expect(result.findings).toEqual([]);
    }
  });

  it("still names the unset bounds on a passing row", () => {
    const result = checkResponsiveBounds(
      fixture([root("1", true, { minWidth: 120 })]),
    );
    expect(result.status).toBe("pass");
    expect(result.note).toContain("maxWidth");
    expect(result.note).toContain("minHeight");
    expect(result.note).toContain("maxHeight");
    expect(result.note).not.toContain("minWidth,");
  });

  it("omits the note when every bound is set somewhere in the set", () => {
    const result = checkResponsiveBounds(
      fixture([
        root("1", true, { minWidth: 120, maxWidth: 320 }),
        root("2", true, { minHeight: 32, maxHeight: 80 }),
      ]),
    );
    expect(result.status).toBe("pass");
    expect(result.note).toBeUndefined();
  });

  it("collapses the whole set into one finding, carrying the count", () => {
    // Variants share their bound configuration, so per-variant findings would
    // repeat one fact once per variant.
    const result = checkResponsiveBounds(
      fixture([root("1", true), root("2", true), root("3", true)]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(3);
    expect(result.findings[0].message).toContain("3 of 3");
  });

  it("counts only the unbounded roots when the set is mixed", () => {
    const result = checkResponsiveBounds(
      fixture([root("1", true, { minWidth: 120 }), root("2", true)]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings[0].count).toBe(1);
    expect(result.findings[0].nodeId).toBe("2");
  });

  it("evaluates a root the collector marked applicable regardless of its own layout", () => {
    // Bounds are settable on an auto-layout frame's direct children too, so a
    // layoutMode "NONE" variant inside an auto-layout set must not be skipped.
    // The collector owns that judgement; the check must honour it.
    const nonAutoLayoutChildOfAutoLayoutSet: NodeSnapshot = {
      ...root("1", true),
      layoutMode: "NONE",
    };
    const result = checkResponsiveBounds(
      fixture([nonAutoLayoutChildOfAutoLayoutSet]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings[0].count).toBe(1);
  });

  it("is not_applicable when no root can carry bounds", () => {
    // Warning here would ask for something the file cannot express.
    const result = checkResponsiveBounds(
      fixture([root("1", false), root("2", false)]),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("auto-layout");
  });

  it("ignores roots that cannot carry bounds rather than counting them unbounded", () => {
    const result = checkResponsiveBounds(
      fixture([root("1", true, { minWidth: 120 }), root("2", false)]),
    );
    expect(result.status).toBe("pass");
  });

  it("is not_applicable for a set with no variants at all", () => {
    expect(checkResponsiveBounds(fixture([])).status).toBe("not_applicable");
  });

  it("always leaves the resize test outstanding, on every outcome", () => {
    // Unlike #19's remainder this is unconditional: that a set cannot hold
    // bounds says nothing about whether it survives being resized.
    const cases = [
      fixture([root("1", true)]), // warn
      fixture([root("1", true, { minWidth: 120 })]), // pass
      fixture([root("1", false)]), // not_applicable
    ];
    for (const fx of cases) {
      expect(checkResponsiveBounds(fx).manualRemainder).toMatch(/[Rr]esize/);
    }
  });

  it("reports under the right check id and title", () => {
    const result = checkResponsiveBounds(fixture([root("1", true)]));
    expect(result.checkId).toBe("responsive-bounds");
    expect(result.title).toBe("Responsiveness (size bounds)");
  });
});
