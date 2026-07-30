import { describe, it, expect } from "vitest";
import { stretchRisks } from "./stretch-risk";
import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";

function node(name: string, extra: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    id: `id-${name}`,
    name,
    type: "FRAME",
    visible: true,
    width: 120,
    height: 40,
    children: [],
    ...extra,
  };
}

/** A container that spreads its content and can be stretched. */
function spreader(extra: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return node("Row", {
    layoutMode: "HORIZONTAL",
    primaryAxisAlignItems: "SPACE_BETWEEN",
    layoutSizingHorizontal: "FILL",
    children: [node("Icon"), node("Label", { type: "TEXT" })],
    ...extra,
  });
}

function snapshot(...trees: NodeSnapshot[]): ComponentSetSnapshot {
  return {
    id: "set",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants: trees.map((tree, i) => ({
      id: `variant-${i}`,
      name: `State=${i}`,
      variantProperties: { State: String(i) },
      tree,
    })),
  };
}

describe("stretchRisks", () => {
  it("finds SPACE_BETWEEN on a container that can stretch", () => {
    const risks = stretchRisks(snapshot(spreader()));
    expect(risks).toHaveLength(1);
    expect(risks[0].nodeName).toBe("Row");
    expect(risks[0].variantName).toBe("State=0");
  });

  it("ignores a container that hugs its content", () => {
    // HUG leaves no free space for SPACE_BETWEEN to distribute, so there is
    // nothing that can spread apart.
    expect(
      stretchRisks(snapshot(spreader({ layoutSizingHorizontal: "HUG" }))),
    ).toEqual([]);
  });

  it("still flags a FIXED container", () => {
    // FILL is not the only way a container gets stretched: a designer dragging a
    // FIXED-width component wider produces exactly the same hole.
    expect(
      stretchRisks(snapshot(spreader({ layoutSizingHorizontal: "FIXED" }))),
    ).toHaveLength(1);
  });

  it("ignores SPACE_BETWEEN on a vertical stack", () => {
    // The primary axis is vertical there, so driving the width does not
    // distribute anything.
    expect(
      stretchRisks(snapshot(spreader({ layoutMode: "VERTICAL" }))),
    ).toEqual([]);
  });

  it("ignores any other distribution", () => {
    for (const align of ["MIN", "MAX", "CENTER"] as const) {
      expect(
        stretchRisks(snapshot(spreader({ primaryAxisAlignItems: align }))),
      ).toEqual([]);
    }
  });

  it("ignores a container with only one child", () => {
    // SPACE_BETWEEN needs two things to put space between; with one child it
    // behaves as MIN and nothing spreads.
    expect(
      stretchRisks(snapshot(spreader({ children: [node("Label")] }))),
    ).toEqual([]);
  });

  it("ignores hidden children when counting", () => {
    expect(
      stretchRisks(
        snapshot(
          spreader({
            children: [node("Icon"), node("Ghost", { visible: false })],
          }),
        ),
      ),
    ).toEqual([]);
  });

  it("finds nested spreaders, not just variant roots", () => {
    const root = node("Root", {
      layoutMode: "HORIZONTAL",
      layoutSizingHorizontal: "FILL",
      children: [spreader()],
    });
    const risks = stretchRisks(snapshot(root));
    expect(risks.map((r) => r.nodeName)).toEqual(["Row"]);
  });

  it("scans every variant, not only the one the probe resizes", () => {
    // The whole reason this scan exists: the probe measures one variant, and an
    // icon-only variant can spread while the label variant is fine.
    const safe = spreader({ layoutSizingHorizontal: "HUG" });
    const risky = spreader();
    const risks = stretchRisks(snapshot(safe, risky));
    expect(risks).toHaveLength(1);
    expect(risks[0].variantName).toBe("State=1");
  });

  it("reports a shared layer once per variant it appears in", () => {
    // Deduping across variants is `dedupeFindings`' job at the run boundary, so
    // this stays a plain per-node scan.
    expect(stretchRisks(snapshot(spreader(), spreader()))).toHaveLength(2);
  });

  it("skips hidden containers", () => {
    expect(stretchRisks(snapshot(spreader({ visible: false })))).toEqual([]);
  });
});
