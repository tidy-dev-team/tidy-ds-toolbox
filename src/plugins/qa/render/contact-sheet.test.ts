import { describe, it, expect } from "vitest";
import { planContactSheet } from "./contact-sheet";
import { isPlan, type StateGridPlan } from "./state-grid";
import type {
  ComponentPropertySnapshot,
  ComponentSetSnapshot,
  NodeSnapshot,
} from "../snapshot";

function tree(id: string): NodeSnapshot {
  return {
    id,
    name: id,
    type: "COMPONENT",
    visible: true,
    width: 120,
    height: 40,
    children: [],
  };
}

function boolProp(name: string): ComponentPropertySnapshot {
  return { name, key: `${name}#1:0`, type: "BOOLEAN" };
}

function snapshot(
  variantNames: string[],
  properties: ComponentPropertySnapshot[] = [],
): ComponentSetSnapshot {
  return {
    id: "set",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: properties.map((p) => p.name),
    properties,
    variants: variantNames.map((name, i) => ({
      id: `v${i}`,
      name,
      variantProperties: { State: name },
      tree: tree(`v${i}`),
    })),
  };
}

function plan(...args: Parameters<typeof snapshot>): StateGridPlan {
  const result = planContactSheet(snapshot(...args));
  if (!isPlan(result)) throw new Error(`no plan: ${result.reason}`);
  return result;
}

describe("planContactSheet", () => {
  it("draws nothing for a component with a single appearance", () => {
    // A one-cell contact sheet is a copy of the component next to the component.
    const result = planContactSheet(snapshot(["Default"]));
    expect(isPlan(result)).toBe(false);
    if (!isPlan(result)) expect(result.reason).toContain("single state");
  });

  it("makes a row per variant", () => {
    expect(
      plan(["Default", "Hover", "Pressed"]).rows.map((r) => r.label),
    ).toEqual(["Default", "Hover", "Pressed"]);
  });

  it("makes a column per boolean combination, all-off first", () => {
    // All-off is the resting state, so the leftmost column is the one a designer
    // already recognises and the rest read as departures from it.
    const labels = plan(["Default"], [boolProp("Icon")]).rows[0].cells.map(
      (c) => c.label,
    );
    expect(labels).toEqual(["all off", "Icon"]);
  });

  it("expands two booleans into four columns", () => {
    const labels = plan(
      ["Default"],
      [boolProp("Icon"), boolProp("Badge")],
    ).rows[0].cells.map((c) => c.label);
    expect(labels).toEqual(["all off", "Icon", "Badge", "Icon + Badge"]);
  });

  it("sets the variant axes and the booleans in one properties object", () => {
    // A variant row and a boolean column are the same mechanism - one
    // setProperties call per cell - rather than two.
    const cell = plan(["Hover"], [boolProp("Icon")]).rows[0].cells[1];
    expect(cell.properties).toEqual({ State: "Hover", "Icon#1:0": true });
  });

  it("caps the boolean axes and names what it dropped", () => {
    const built = plan(["Default"], ["A", "B", "C", "D"].map(boolProp));
    expect(built.rows[0].cells).toHaveLength(8);
    expect(built.footnote).toContain('"D"');
  });

  it("caps total instances and names the variants it dropped", () => {
    // The combinatorial ceiling: capped, not sampled at random and not refused,
    // and the footnote says exactly what was left out.
    const many = Array.from({ length: 40 }, (_, i) => `V${i}`);
    const built = plan(many, [boolProp("Icon"), boolProp("Badge")]);
    expect(built.rows).toHaveLength(12); // 48 cells / 4 columns
    expect(built.footnote).toContain("28 further variant(s)");
    expect(built.footnote).toContain("capped at 48");
  });

  it("says nothing about a cap when nothing was dropped", () => {
    expect(plan(["A", "B"], [boolProp("Icon")]).footnote).not.toContain(
      "capped",
    );
  });

  it("never claims a verdict", () => {
    // The whole reason it is safe to draw: it cannot be wrong, because it claims
    // nothing.
    const built = plan(["Default", "Hover"]);
    expect(built.footnote).toContain("No verdict");
    expect(built.footnote).toContain("tick is still yours");
    expect(built.rows[0].cells.every((c) => c.captions.length === 0)).toBe(
      true,
    );
  });

  it("works on a set with variants and no booleans at all", () => {
    const built = plan(["Default", "Hover"]);
    expect(built.rows).toHaveLength(2);
    expect(built.rows[0].cells.map((c) => c.label)).toEqual(["all off"]);
  });
});
