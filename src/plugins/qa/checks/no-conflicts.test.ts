import { describe, it, expect } from "vitest";
import { checkNoConflicts } from "./no-conflicts";
import type { ComponentSetSnapshot, VariantSnapshot } from "../snapshot";

/**
 * Minimal fixture builder — only `id`/`name`/`type`/`variants` matter to this
 * check, but the type wants a full ComponentSetSnapshot so we fill in empty
 * defaults.
 */
function fixture(
  id: string,
  name: string,
  type: "COMPONENT_SET" | "COMPONENT",
  variants: VariantSnapshot[],
): ComponentSetSnapshot {
  return {
    id,
    name,
    type,
    description: "",
    propertyNames: [],
    properties: [],
    variants,
  };
}

function variant(
  id: string,
  name: string,
  variantProperties: Record<string, string>,
  propertiesUnreadable?: string,
): VariantSnapshot {
  return {
    id,
    name,
    variantProperties,
    ...(propertiesUnreadable ? { propertiesUnreadable } : {}),
    tree: {
      id,
      name,
      type: "COMPONENT",
      visible: true,
      width: 0,
      height: 0,
      children: [],
    },
  };
}

describe("checkNoConflicts", () => {
  it("passes unique variant-property combinations", () => {
    const result = checkNoConflicts(
      fixture("1:1", "Button", "COMPONENT_SET", [
        variant("1:2", "Size=Medium, Variant=Primary, State=Default", {
          Size: "Medium",
          Variant: "Primary",
          State: "Default",
        }),
        variant("1:3", "Size=Medium, Variant=Primary, State=Hover", {
          Size: "Medium",
          Variant: "Primary",
          State: "Hover",
        }),
        variant("1:4", "Size=Large, Variant=Primary, State=Default", {
          Size: "Large",
          Variant: "Primary",
          State: "Default",
        }),
      ]),
    );
    expect(result).toEqual({
      checkId: "no-conflicts",
      title: "No conflicts",
      status: "pass",
      findings: [],
    });
  });

  it("fails a duplicated variant-property combination with findings on the offending nodes", () => {
    const result = checkNoConflicts(
      fixture("2:1", "Button", "COMPONENT_SET", [
        variant("2:2", "Size=Medium, Variant=Primary, State=Default", {
          Size: "Medium",
          Variant: "Primary",
          State: "Default",
        }),
        variant("2:3", "Size=Medium, Variant=Primary, State=Default", {
          Size: "Medium",
          Variant: "Primary",
          State: "Default",
        }),
        variant("2:4", "Size=Large, Variant=Primary, State=Default", {
          Size: "Large",
          Variant: "Primary",
          State: "Default",
        }),
      ]),
    );
    expect(result.checkId).toBe("no-conflicts");
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.nodeId).sort()).toEqual(["2:2", "2:3"]);
    expect(result.findings[0]).toMatchObject({
      nodeName: "Size=Medium, Variant=Primary, State=Default",
    });
  });

  it("passes a standalone component with no variants (not_applicable)", () => {
    const result = checkNoConflicts(fixture("3:1", "Icon", "COMPONENT", []));
    expect(result.checkId).toBe("no-conflicts");
    expect(result.status).toBe("not_applicable");
    expect(result.note).toContain("fewer than two variants");
    expect(result.findings).toEqual([]);
  });

  const REFUSAL =
    "in get_variantProperties: Component set for node has existing errors";

  it("fails when Figma refused every variant, and says it covers all of them", () => {
    const result = checkNoConflicts(
      fixture("4:1", "Button", "COMPONENT_SET", [
        variant("4:2", "Size=Medium, State=Default", {}, REFUSAL),
        variant("4:3", "Size=Medium, State=Hover", {}, REFUSAL),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "4:1",
      nodeName: "Button",
      severity: "high",
    });
    expect(result.findings[0].message).toContain("all 2 variant(s)");
    expect(result.findings[0].message).toContain(
      "Component set for node has existing errors",
    );
  });

  /**
   * The reason the refusal is recorded per variant rather than per set. A
   * set-level flag raised by one throw would make the check decline arithmetic
   * it can still do, and the duplicate below would go unreported.
   */
  it("still reports a readable duplicate when only some variants were refused", () => {
    const result = checkNoConflicts(
      fixture("5:1", "Button", "COMPONENT_SET", [
        variant("5:2", "Size=Medium, State=Default", {
          Size: "Medium",
          State: "Default",
        }),
        variant("5:3", "Size=Medium, State=Default", {
          Size: "Medium",
          State: "Default",
        }),
        variant("5:4", "Size=Large, State=Hover", {}, REFUSAL),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings.map((f) => f.nodeId).sort()).toEqual([
      "5:1",
      "5:2",
      "5:3",
    ]);
    expect(result.findings[0].message).toContain("1 of 3 variant(s)");
    expect(result.findings[0].message).not.toContain("all ");
  });

  /**
   * Two refused variants both carry `{}`, which is the same key. Grouped with
   * the readable ones they would collide and report a duplicate combination of
   * "" that a designer cannot find in the Variants panel.
   */
  it("does not invent a duplicate out of two refused variants", () => {
    const result = checkNoConflicts(
      fixture("6:1", "Button", "COMPONENT_SET", [
        variant("6:2", "Size=Medium", { Size: "Medium" }),
        variant("6:3", "Size=Large", {}, REFUSAL),
        variant("6:4", "Size=Small", {}, REFUSAL),
      ]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].nodeId).toBe("6:1");
    expect(result.findings.every((f) => !f.message.includes("Duplicate"))).toBe(
      true,
    );
  });
});
