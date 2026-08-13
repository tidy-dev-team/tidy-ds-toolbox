import { describe, it, expect } from "vitest";
import {
  componentGroups,
  componentRegistry,
  getComponent,
  getAllComponentNames,
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
    const totalEntries = componentGroups.flat().length;
    expect(Object.keys(componentRegistry)).toHaveLength(totalEntries);
  });

  it("has no duplicate names across groups", () => {
    const names = componentGroups.flat().map(([name]) => name);
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
