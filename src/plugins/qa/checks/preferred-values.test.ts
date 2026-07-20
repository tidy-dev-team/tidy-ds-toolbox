import { describe, it, expect } from "vitest";
import { checkPreferredValues } from "./preferred-values";
import type {
  ComponentPropertySnapshot,
  ComponentSetSnapshot,
} from "../snapshot";

/**
 * Minimal fixture builder — only `properties` matters to this check, but the
 * type wants a full ComponentSetSnapshot so we fill in empty defaults.
 */
function fixture(properties: ComponentPropertySnapshot[]): ComponentSetSnapshot {
  return {
    id: "1:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: properties.map((p) => p.name),
    properties,
    variants: [],
  };
}

describe("checkPreferredValues", () => {
  it("passes when every INSTANCE_SWAP prop has populated preferred values", () => {
    const result = checkPreferredValues(
      fixture([
        { name: "Icon", type: "INSTANCE_SWAP", preferredValuesCount: 3 },
        { name: "Size", type: "VARIANT" },
      ]),
    );
    expect(result).toEqual({
      checkId: "preferred-values",
      title: "Preferred values",
      status: "pass",
      findings: [],
    });
  });

  it("warns when an INSTANCE_SWAP prop has an empty preferred values list", () => {
    const result = checkPreferredValues(
      fixture([
        { name: "Icon", type: "INSTANCE_SWAP", preferredValuesCount: 0 },
      ]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "1:1",
      nodeName: "Icon",
    });
  });

  it("is not_applicable when the set exposes no INSTANCE_SWAP props", () => {
    const result = checkPreferredValues(
      fixture([
        { name: "Size", type: "VARIANT" },
        { name: "Disabled", type: "BOOLEAN" },
      ]),
    );
    expect(result).toEqual({
      checkId: "preferred-values",
      title: "Preferred values",
      status: "not_applicable",
      findings: [],
    });
  });
});
