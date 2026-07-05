import { describe, it, expect } from "vitest";
import { resolveDocSpecReferences } from "./resolveReferences";
import type { DerivedFacts } from "./facts";
import type { DocSpec } from "./docSpec";

const facts: DerivedFacts = {
  componentId: "1:2",
  componentName: "Button",
  familyAxis: { name: "Type", values: ["Primary", "Secondary", "Tertiary"] },
  stateAxis: { name: "State", values: ["Hover", "Idle", "Pressed"] },
  sizeAxis: null,
  demoted: [],
  pinnedDefaults: { State: "Idle" },
};

describe("resolveDocSpecReferences", () => {
  it("resolves every variant key that matches a real family value", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      variants: {
        Primary: { description: "The default action." },
        Secondary: { description: "A lower-emphasis action." },
      },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toEqual([]);
    expect(result.resolved).toBe(spec);
  });

  it("batches every unresolved variant key in one call, not fail-on-first", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      variants: {
        Primry: { description: "typo'd family value" },
        Bogus: { description: "not a family value at all" },
      },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toHaveLength(2);
    expect(result.unresolved.map((u) => u.value).sort()).toEqual(["Bogus", "Primry"]);
    expect(result.unresolved.every((u) => u.slot === "variants" && u.kind === "familyValue")).toBe(true);
  });

  it("attaches a didYouMean hint for a near-miss", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      variants: { Primry: { description: "typo" } },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved[0].didYouMean).toBe("Primary");
  });

  it("omits didYouMean for a value with no close match", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      variants: { Zzzzzzzzzz: { description: "nowhere close" } },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved[0].didYouMean).toBeUndefined();
  });

  it("resolves nothing (no error) when variants is absent", () => {
    const spec: DocSpec = { status: "LIVE" };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toEqual([]);
  });
});
