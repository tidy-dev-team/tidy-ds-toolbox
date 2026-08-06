import { describe, expect, it } from "vitest";
import { variantLabel } from "./variant-label";
import type { VariantSnapshot } from "./snapshot";

function variant(
  variantProperties: Record<string, string>,
  name = "Variant",
): VariantSnapshot {
  return {
    id: "2:1",
    name,
    variantProperties,
    tree: {
      id: "2:1",
      name,
      type: "COMPONENT",
      visible: true,
      width: 100,
      height: 40,
      children: [],
    },
  };
}

describe("variantLabel", () => {
  it("joins the property values in declaration order", () => {
    expect(
      variantLabel(variant({ size: "s", type: "outlined", state: "loading" })),
    ).toBe("size=s, type=outlined, state=loading");
  });

  it("handles a single property", () => {
    expect(variantLabel(variant({ State: "Hover" }))).toBe("State=Hover");
  });

  // A standalone component carries no variant properties (#13), so its node name
  // is all there is to call it.
  it("falls back to the node name when there are no properties", () => {
    expect(variantLabel(variant({}, "Badge"))).toBe("Badge");
  });

  it("keeps values verbatim, including spaces and casing", () => {
    expect(variantLabel(variant({ Variant: "Primary Large" }))).toBe(
      "Variant=Primary Large",
    );
  });
});
