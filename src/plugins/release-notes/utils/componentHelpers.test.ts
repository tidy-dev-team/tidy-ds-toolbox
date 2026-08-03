import { describe, it, expect } from "vitest";
import { subjectsFromScan, type ScannedNode } from "./componentHelpers";

function node(
  id: string,
  name: string,
  parentType: string | null = "PAGE",
): ScannedNode {
  return { id, name, parentType };
}

describe("subjectsFromScan", () => {
  it("offers a component set", () => {
    expect(subjectsFromScan([node("1:1", "Button")])).toEqual([
      { id: "1:1", name: "Button" },
    ]);
  });

  it("offers a component that is not in a set", () => {
    // The bug this rule fixes: a variantless component such as Divider had no
    // set to represent it, so a set-only scan never listed it.
    expect(subjectsFromScan([node("2:1", "Divider", "SECTION")])).toEqual([
      { id: "2:1", name: "Divider" },
    ]);
  });

  it("drops a variant, because its set already stands for it", () => {
    const scanned = [
      node("1:1", "Button"),
      node("1:2", "Size=Large, State=Hover", "COMPONENT_SET"),
      node("1:3", "Size=Small, State=Hover", "COMPONENT_SET"),
    ];

    expect(subjectsFromScan(scanned)).toEqual([{ id: "1:1", name: "Button" }]);
  });

  it("keeps a component nested in a frame or another component", () => {
    const scanned = [
      node("3:1", "Icon", "FRAME"),
      node("3:2", "Badge", "COMPONENT"),
    ];

    expect(subjectsFromScan(scanned).map((s) => s.name)).toEqual([
      "Icon",
      "Badge",
    ]);
  });

  it("keeps a top-level component whose parent is the page itself", () => {
    expect(subjectsFromScan([node("4:1", "Spacer", null)])).toEqual([
      { id: "4:1", name: "Spacer" },
    ]);
  });
});
