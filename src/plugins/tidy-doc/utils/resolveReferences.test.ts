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
  breakdown: { heights: [], width: null, iconPlacement: null },
  modeCollections: [],
  relatedCandidates: [
    { name: "Icon Button", matchedTokens: ["button"] },
    { name: "Link Button", matchedTokens: ["button"] },
  ],
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

  it("resolves a doDonts SpecimenScene whose props match real axis values", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      guidelines: {
        doDonts: [
          {
            description: "Don't show two primaries side by side.",
            good: { layout: "row", instances: [{ props: { Type: "Primary" } }] },
            bad: {
              layout: "row",
              instances: [
                { props: { Type: "Primary" } },
                { props: { Type: "Primary" } },
              ],
            },
          },
        ],
      },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toEqual([]);
  });

  it("flags an unknown axis name in a doDonts scene as kind=axisName", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      guidelines: {
        doDonts: [
          {
            description: "typo'd axis name",
            good: { layout: "row", instances: [{ props: { Typ: "Primary" } }] },
            bad: { layout: "row", instances: [{ props: { Type: "Primary" } }] },
          },
        ],
      },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]).toMatchObject({
      kind: "axisName",
      value: "Typ",
      didYouMean: "Type",
    });
    expect(result.unresolved[0].slot).toBe("guidelines.doDonts[0].good.instances[0].props");
  });

  it("flags an unknown axis value in a doDonts scene as kind=axisValue", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      guidelines: {
        doDonts: [
          {
            description: "typo'd value",
            good: { layout: "row", instances: [{ props: { Type: "Primry" } }] },
            bad: { layout: "row", instances: [{ props: { Type: "Primary" } }] },
          },
        ],
      },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toEqual([
      {
        slot: "guidelines.doDonts[0].good.instances[0].props.Type",
        kind: "axisValue",
        value: "Primry",
        didYouMean: "Primary",
      },
    ]);
  });

  it("batches unresolved refs across both good and bad scenes of multiple pairs", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      guidelines: {
        doDonts: [
          {
            description: "pair 0",
            good: { layout: "row", instances: [{ props: { Type: "Bogus" } }] },
            bad: { layout: "row", instances: [{ props: { State: "Hover" } }] },
          },
          {
            description: "pair 1",
            good: { layout: "row", instances: [{ props: { Type: "Primary" } }] },
            bad: { layout: "row", instances: [{ props: { State: "Zzzzz" } }] },
          },
        ],
      },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toHaveLength(2);
    expect(result.unresolved.map((u) => u.slot)).toEqual([
      "guidelines.doDonts[0].good.instances[0].props.Type",
      "guidelines.doDonts[1].bad.instances[0].props.State",
    ]);
  });

  it("resolves every related key that matches a ranked candidate", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      related: { "Icon Button": { guidance: "Use when the action has no text label." } },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toEqual([]);
  });

  it("fails resolution for a related key naming a non-existent component", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      related: { Zzzzzzzzzz: { guidance: "not a real sibling" } },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toEqual([
      {
        slot: "related",
        kind: "siblingName",
        value: "Zzzzzzzzzz",
        didYouMean: undefined,
      },
    ]);
  });

  it("batches unresolved related keys alongside unresolved variant keys", () => {
    const spec: DocSpec = {
      status: "IDEATION",
      variants: { Bogus: { description: "not a family value" } },
      related: { Nope: { guidance: "not a real sibling" } },
    };
    const result = resolveDocSpecReferences(spec, facts);
    expect(result.unresolved).toHaveLength(2);
    expect(result.unresolved.map((u) => u.slot).sort()).toEqual(["related", "variants"]);
  });
});
