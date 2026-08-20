import { describe, it, expect } from "vitest";
import {
  componentGroups,
  componentRegistry,
  getComponent,
  getAllComponentNames,
  visibleGroups,
} from "./componentData";

describe("componentRegistry", () => {
  it("flattens every group entry into the registry, keyed by name", () => {
    expect(componentRegistry["Avatar"]).toEqual({
      key: "e978573d54b4b61133aaa9fb1287eef36df0e1ed",
      name: "Avatar",
      type: "component",
    });
  });

  it("defaults type to 'component' when the group entry omits it", () => {
    expect(componentRegistry["Badge"].type).toBe("component");
  });

  it("preserves an explicit type from the group entry", () => {
    expect(componentRegistry["Tabs / Outline Tab Bar"].type).toBe("component");
  });

  it("contains one registry entry per non-empty group entry", () => {
    const totalEntries = componentGroups.flatMap((group) => group.items).length;
    expect(Object.keys(componentRegistry)).toHaveLength(totalEntries);
  });

  it("has no duplicate names across groups", () => {
    const names = componentGroups
      .flatMap((group) => group.items)
      .map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("getComponent", () => {
  it("returns the registry entry for a known name", () => {
    expect(getComponent("Avatar")?.key).toBe(
      "e978573d54b4b61133aaa9fb1287eef36df0e1ed",
    );
  });

  it("returns undefined for an unknown name", () => {
    expect(getComponent("Not A Real Component")).toBeUndefined();
  });
});

describe("getAllComponentNames", () => {
  it("returns every name present in the registry", () => {
    const names = getAllComponentNames();
    expect(names).toContain("Avatar");
    expect(names).toContain("Modal");
    expect(names).toHaveLength(Object.keys(componentRegistry).length);
  });
});

describe("componentGroups", () => {
  it("gives every group a name and at least one item", () => {
    for (const group of componentGroups) {
      expect(group.name).not.toBe("");
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("names each group once", () => {
    const names = componentGroups.map((group) => group.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("visibleGroups", () => {
  it("keeps a group's heading with its own items when the groups above it filter out", () => {
    const groups = visibleGroups("snackbar");

    expect(groups.map((group) => group.name)).toEqual(["Snackbar"]);
    expect(groups[0].items.map(([name]) => name)).toEqual([
      "Snackbar / Basic",
      "Snackbar / Contained",
      "Snackbar / Outlined",
      "Snackbar / Partial Stroke",
    ]);
  });

  it("returns every group, in declaration order, for an empty term", () => {
    const groups = visibleGroups("");

    expect(groups).toHaveLength(componentGroups.length);
    expect(groups.map((group) => group.name).slice(0, 3)).toEqual([
      "Avatar",
      "Badge",
      "Navigation & Buttons",
    ]);
  });

  it("returns nothing when no item matches", () => {
    expect(visibleGroups("no such component")).toEqual([]);
  });

  it("ignores space around the term, so a stray space does not empty the list", () => {
    expect(visibleGroups("  snackbar ").map((group) => group.name)).toEqual([
      "Snackbar",
    ]);
  });
});
