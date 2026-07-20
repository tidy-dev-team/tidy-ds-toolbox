import { describe, it, expect } from "vitest";
import { checkInteractionHoverOnly } from "./interaction-hover-only";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  VariantSnapshot,
} from "../snapshot";

/**
 * Minimal node fixture builder — only `id`/`name`/`type`/`children` and
 * `reactionTriggers` matter to this check; the rest are filled with the
 * cheapest valid defaults.
 */
function node(
  id: string,
  name: string,
  overrides: Partial<NodeSnapshot> = {},
): NodeSnapshot {
  return {
    id,
    name,
    type: "FRAME",
    visible: true,
    width: 100,
    height: 100,
    children: [],
    ...overrides,
  };
}

function variant(id: string, name: string, tree: NodeSnapshot): VariantSnapshot {
  return { id, name, variantProperties: {}, tree };
}

function fixture(variants: VariantSnapshot[]): ComponentSetSnapshot {
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

describe("checkInteractionHoverOnly", () => {
  it("passes when the only reactions are ON_HOVER", () => {
    const tree = node("1:2", "Default", {
      reactionTriggers: ["ON_HOVER"],
    });
    const result = checkInteractionHoverOnly(
      fixture([variant("1:2", "Default", tree)]),
    );
    expect(result).toEqual({
      checkId: "interaction-hover-only",
      title: "Interaction (hover-only)",
      status: "pass",
      findings: [],
    });
  });

  it("fails on an ON_CLICK reaction", () => {
    const tree = node("1:3", "Default", {
      reactionTriggers: ["ON_CLICK"],
    });
    const result = checkInteractionHoverOnly(
      fixture([variant("1:3", "Default", tree)]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "1:3",
      nodeName: "Default",
    });
  });

  it("fails on an ON_PRESS reaction nested in the tree", () => {
    const child = node("1:5", "Icon", {
      reactionTriggers: ["ON_PRESS"],
    });
    const tree = node("1:4", "Default", { children: [child] });
    const result = checkInteractionHoverOnly(
      fixture([variant("1:4", "Default", tree)]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "1:5",
      nodeName: "Icon",
    });
  });

  it("fails when one variant is hover-only and another has a click reaction", () => {
    const hoverTree = node("2:1", "Default", {
      reactionTriggers: ["ON_HOVER"],
    });
    const clickTree = node("2:2", "Pressed", {
      reactionTriggers: ["ON_CLICK"],
    });
    const result = checkInteractionHoverOnly(
      fixture([
        variant("2:1", "Default", hoverTree),
        variant("2:2", "Pressed", clickTree),
      ]),
    );
    expect(result.status).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      nodeId: "2:2",
      nodeName: "Pressed",
    });
  });

  it("is not_applicable when no reactions exist anywhere", () => {
    const tree = node("3:1", "Default", {
      children: [node("3:2", "Label")],
    });
    const result = checkInteractionHoverOnly(
      fixture([variant("3:1", "Default", tree)]),
    );
    expect(result).toEqual({
      checkId: "interaction-hover-only",
      title: "Interaction (hover-only)",
      status: "not_applicable",
      findings: [],
    });
  });
});
