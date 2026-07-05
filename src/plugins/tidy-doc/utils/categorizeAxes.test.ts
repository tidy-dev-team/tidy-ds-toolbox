import { describe, it, expect } from "vitest";
import { categorizeAxes, type AxisDescriptor } from "./categorizeAxes";

describe("categorizeAxes", () => {
  it("picks the axis named 'Type' as family over 'Kind'/'Variant'", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "Kind", values: ["Ghost", "Outline"] },
      { name: "Type", values: ["Primary", "Secondary"] },
      { name: "Variant", values: ["A", "B"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.familyAxis.name).toBe("Type");
    expect(result.familyAxis.values).toEqual(["Primary", "Secondary"]);
    expect(result.demoted.sort()).toEqual(["Kind", "Variant"]);
  });

  it("falls back to 'Kind' when no 'Type' axis is present", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "Kind", values: ["Ghost", "Outline"] },
      { name: "Variant", values: ["A", "B"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.familyAxis.name).toBe("Kind");
    expect(result.demoted).toEqual(["Variant"]);
  });

  it("promotes the single remaining axis when none match the name precedence", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "Emphasis", values: ["Bold", "Subtle"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.familyAxis.name).toBe("Emphasis");
    expect(result.familyAxis.values).toEqual(["Bold", "Subtle"]);
    expect(result.demoted).toEqual([]);
  });

  it("picks the first-declared axis by declaration order when multiple axes are type-like by value but neither name matches the precedence list", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "Style", values: ["Filled", "Outline"] },
      { name: "Look", values: ["Solid", "Ghost"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.familyAxis.name).toBe("Style");
    expect(result.demoted).toEqual(["Look"]);
  });

  it("collapses to a single unnamed family when several axes remain but none categorise as type-like by name or value", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "Emphasis", values: ["Strong", "Weak"] },
      { name: "Flavor", values: ["Sweet", "Sour"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.familyAxis).toEqual({ name: null, values: ["default"] });
    expect(result.demoted).toEqual([]);
    expect(result.pinnedDefaults.Emphasis).toBe("Strong");
    expect(result.pinnedDefaults.Flavor).toBe("Sweet");
  });

  it("falls back to a single unnamed family when no type-like axis exists", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "State", values: ["Hover", "Idle", "Pressed"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.familyAxis).toEqual({ name: null, values: ["default"] });
    expect(result.stateAxis?.name).toBe("State");
  });

  it("excludes size from family candidates", () => {
    const descriptors: AxisDescriptor[] = [
      {
        name: "Size",
        values: ["Small", "Medium", "Large"],
        defaultValue: "Medium",
      },
      { name: "Type", values: ["Primary", "Secondary"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.familyAxis.name).toBe("Type");
    expect(result.sizeAxis?.name).toBe("Size");
    expect(result.pinnedDefaults.Size).toBe("Medium");
  });

  it("detects state by value overlap even when the axis isn't named 'State'", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "Interaction", values: ["Hover", "Pressed", "Rest"] },
      { name: "Type", values: ["Primary", "Secondary"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.stateAxis?.name).toBe("Interaction");
  });

  it("recognises 'Regular/Hover/Pressed' values as state even on an unnamed axis", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "Interaction", values: ["Regular", "Hover", "Pressed"] },
      { name: "Kind", values: ["Ghost", "Outline"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.stateAxis?.name).toBe("Interaction");
    expect(result.familyAxis.name).toBe("Kind");
  });

  it("pins non-family axes to defaultValue when present", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "State", values: ["Hover", "Idle"], defaultValue: "Idle" },
      { name: "Type", values: ["Primary", "Secondary"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.pinnedDefaults.State).toBe("Idle");
  });

  it("pins non-family axes to the first option when no defaultValue is given", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "State", values: ["Hover", "Idle"] },
      { name: "Type", values: ["Primary", "Secondary"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.pinnedDefaults.State).toBe("Hover");
  });

  it("ignores a defaultValue that isn't among the axis's own values", () => {
    const descriptors: AxisDescriptor[] = [
      { name: "State", values: ["Hover", "Idle"], defaultValue: "Bogus" },
      { name: "Type", values: ["Primary", "Secondary"] },
    ];
    const result = categorizeAxes(descriptors);
    expect(result.pinnedDefaults.State).toBe("Hover");
  });
});
