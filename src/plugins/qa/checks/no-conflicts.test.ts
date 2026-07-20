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
): VariantSnapshot {
  return {
    id,
    name,
    variantProperties,
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
    expect(result.findings.map((f) => f.nodeId).sort()).toEqual([
      "2:2",
      "2:3",
    ]);
    expect(result.findings[0]).toMatchObject({
      nodeName: "Size=Medium, Variant=Primary, State=Default",
    });
  });

  it("passes a standalone component with no variants (not_applicable)", () => {
    const result = checkNoConflicts(
      fixture("3:1", "Icon", "COMPONENT", []),
    );
    expect(result.checkId).toBe("no-conflicts");
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
  });
});
