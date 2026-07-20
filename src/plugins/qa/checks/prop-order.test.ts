import { describe, it, expect } from "vitest";
import { checkPropOrder } from "./prop-order";
import type { ComponentSetSnapshot } from "../snapshot";

/**
 * Minimal fixture builder — only `propertyNames` matters to this check, but
 * the type wants a full ComponentSetSnapshot so we fill in empty defaults.
 */
function fixture(propertyNames: string[]): ComponentSetSnapshot {
  return {
    id: "1:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames,
    properties: propertyNames.map((name) => ({ name, type: "VARIANT" })),
    variants: [],
  };
}

describe("checkPropOrder", () => {
  it("passes the full canonical order", () => {
    const result = checkPropOrder(fixture(["Size", "Variant", "State"]));
    expect(result).toEqual({
      checkId: "prop-order",
      title: "Prop order (consolidated catalogue)",
      status: "pass",
      findings: [],
    });
  });

  it("fails out-of-order known props", () => {
    const result = checkPropOrder(fixture(["State", "Size"]));
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "1:1",
      nodeName: "Button",
    });
  });

  it("passes a partial subset that preserves relative order", () => {
    const result = checkPropOrder(fixture(["Size", "State"]));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("allows unknown props to trail the known ones", () => {
    const result = checkPropOrder(fixture(["Size", "State", "Icon"]));
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails when an unknown prop precedes a known one out of order", () => {
    const result = checkPropOrder(fixture(["State", "Size", "Icon"]));
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
  });
});
