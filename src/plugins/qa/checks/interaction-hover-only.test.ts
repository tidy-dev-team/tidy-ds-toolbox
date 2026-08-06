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

/**
 * Variants default to declaring a hover state, because that is what makes #11
 * applicable at all: without it every case below would short-circuit to
 * `not_applicable` and stop exercising the trigger logic they exist to test.
 * The gate itself is tested explicitly at the bottom of the file.
 */
function variant(
  id: string,
  name: string,
  tree: NodeSnapshot,
  variantProperties: Record<string, string> = { State: "hover" },
): VariantSnapshot {
  return { id, name, variantProperties, tree };
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

  it("is not_applicable when a hover state exists but no reactions do", () => {
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
      // Matched on the condition it names rather than verbatim, so rewording
      // the reason does not need a synchronised test edit.
      note: expect.stringContaining("prototype reaction"),
      findings: [],
    });
  });

  describe("the hover-state gate", () => {
    it("is not_applicable when no variant declares a hover state", () => {
      const tree = node("4:1", "Idle", { reactionTriggers: ["ON_HOVER"] });
      const result = checkInteractionHoverOnly(
        fixture([variant("4:1", "Idle", tree, { State: "idle" })]),
      );
      expect(result.status).toBe("not_applicable");
      expect(result.note).toMatch(/no hover state/i);
      expect(result.findings).toEqual([]);
    });

    // The deliberate consequence of design's rule, pinned so it reads as a
    // decision rather than a regression: a disallowed trigger on a set with no
    // hover state is skipped, where it used to fail.
    it("skips a disallowed trigger when no hover state is declared", () => {
      const tree = node("4:2", "Idle", { reactionTriggers: ["ON_CLICK"] });
      const result = checkInteractionHoverOnly(
        fixture([variant("4:2", "Idle", tree, { State: "idle" })]),
      );
      expect(result.status).toBe("not_applicable");
      expect(result.findings).toEqual([]);
    });

    it("applies when only one of several variants declares the hover state", () => {
      const idle = node("4:3", "Idle", {});
      const hover = node("4:4", "Hover", { reactionTriggers: ["ON_CLICK"] });
      const result = checkInteractionHoverOnly(
        fixture([
          variant("4:3", "Idle", idle, { State: "idle" }),
          variant("4:4", "Hover", hover, { State: "Hover" }),
        ]),
      );
      expect(result.status).toBe("fail");
    });

    it("matches the hover value regardless of casing, padding or property name", () => {
      const tree = node("4:5", "Hover", { reactionTriggers: ["ON_CLICK"] });
      const result = checkInteractionHoverOnly(
        fixture([variant("4:5", "Hover", tree, { Interaction: "  HOVER " })]),
      );
      expect(result.status).toBe("fail");
    });

    // A standalone component carries no variant properties at all (#13), so it
    // can never declare a hover state and is always skipped.
    it("is not_applicable for a set with no variant properties", () => {
      const tree = node("4:6", "Default", { reactionTriggers: ["ON_HOVER"] });
      const result = checkInteractionHoverOnly(
        fixture([variant("4:6", "Default", tree, {})]),
      );
      expect(result.status).toBe("not_applicable");
      expect(result.note).toMatch(/no hover state/i);
    });
  });
});
