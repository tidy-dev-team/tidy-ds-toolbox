import { describe, expect, it } from "vitest";
import { createSpecimenInstance } from "./specimenFactory";
import type { DerivedFacts } from "./facts";

// Fakes: componentProperties/setProperties are the only surface
// createSpecimenInstance touches on an instance, so a plain object
// satisfies the shape without any figma global.
function fakeInstance(propertyNames: string[]): InstanceNode {
  const values: Record<string, string | boolean> = {};
  const componentProperties: Record<string, { type: string; value: unknown }> =
    {};
  for (const name of propertyNames) {
    componentProperties[name] = { type: "VARIANT", value: "" };
  }
  const instance = {
    componentProperties,
    setProperties(props: Record<string, string | boolean>) {
      Object.assign(values, props);
    },
    __values: values,
  } as unknown as InstanceNode & { __values: typeof values };
  return instance;
}

function fakeComponentSet(propertyNames: string[]): ComponentSetNode {
  const instance = fakeInstance(propertyNames);
  const defaultVariant = {
    createInstance: () => instance,
  } as unknown as ComponentNode;
  return {
    type: "COMPONENT_SET",
    defaultVariant,
  } as unknown as ComponentSetNode;
}

function fakeComponent(propertyNames: string[]): ComponentNode {
  const instance = fakeInstance(propertyNames);
  return {
    type: "COMPONENT",
    createInstance: () => instance,
  } as unknown as ComponentNode;
}

function values(instance: InstanceNode): Record<string, string | boolean> {
  return (instance as unknown as { __values: Record<string, string | boolean> })
    .__values;
}

function baseFacts(overrides: Partial<DerivedFacts> = {}): DerivedFacts {
  return {
    componentId: "1:1",
    componentName: "Button",
    familyAxis: { name: null, values: [] },
    stateAxis: null,
    sizeAxis: null,
    demoted: [],
    demotedAxisValues: {},
    pinnedDefaults: {},
    breakdown: { heights: [], width: null, iconPlacement: null, constraintWidths: [] },
    booleanProperties: [],
    modeCollections: [],
    relatedCandidates: [],
    ...overrides,
  } as DerivedFacts;
}

describe("createSpecimenInstance", () => {
  it("with no options, creates a plain instance with nothing pinned", () => {
    const source = fakeComponentSet(["Type", "State"]);
    const instance = createSpecimenInstance(source);
    expect(values(instance)).toEqual({});
  });

  it("pins the family axis when facts + familyValue are given", () => {
    const source = fakeComponentSet(["Type", "State"]);
    const facts = baseFacts({ familyAxis: { name: "Type", values: ["a", "b"] } });
    const instance = createSpecimenInstance(source, {
      facts,
      familyValue: "b",
    });
    expect(values(instance)).toEqual({ Type: "b" });
  });

  it("pins rest-state defaults from facts.pinnedDefaults", () => {
    const source = fakeComponentSet(["Icon"]);
    const facts = baseFacts({ pinnedDefaults: { Icon: "none" } });
    const instance = createSpecimenInstance(source, { facts });
    expect(values(instance)).toEqual({ Icon: "none" });
  });

  it("excludes the state axis from rest-state pinning when a stateValue is given, pinning it exactly instead", () => {
    // Substring-collision guard: "State" must not also match "Loading State".
    const source = fakeComponentSet(["State", "Loading State"]);
    const facts = baseFacts({
      stateAxis: { name: "State", values: ["default", "hover"] },
      pinnedDefaults: { State: "default", "Loading State": "false" },
    });
    const instance = createSpecimenInstance(source, {
      facts,
      stateValue: "hover",
    });
    expect(values(instance)).toEqual({
      "Loading State": "false",
      State: "hover",
    });
  });

  it("applies overrides via exact match, not substring", () => {
    const source = fakeComponentSet(["Size", "Icon Size"]);
    const facts = baseFacts();
    const instance = createSpecimenInstance(source, {
      facts,
      overrides: { Size: "m" },
    });
    expect(values(instance)).toEqual({ Size: "m" });
  });

  it("applies booleanOverrides only for keys the instance actually exposes", () => {
    const source = fakeComponentSet(["Has icon#123:0"]);
    const facts = baseFacts();
    const instance = createSpecimenInstance(source, {
      facts,
      booleanOverrides: { "Has icon#123:0": true, "Missing#999:0": false },
    });
    expect(values(instance)).toEqual({ "Has icon#123:0": true });
  });

  it("skips all facts-driven pinning when facts is omitted, applying only overrides", () => {
    // buildRelatedSection's case: instantiating a sibling with no derived facts.
    const source = fakeComponentSet(["Type", "State"]);
    const instance = createSpecimenInstance(source, {
      overrides: { Type: "primary", State: "default" },
    });
    expect(values(instance)).toEqual({ Type: "primary", State: "default" });
  });

  it("works against a plain COMPONENT (no variant axes) without pinning anything", () => {
    const source = fakeComponent([]);
    const instance = createSpecimenInstance(source);
    expect(values(instance)).toEqual({});
  });
});
