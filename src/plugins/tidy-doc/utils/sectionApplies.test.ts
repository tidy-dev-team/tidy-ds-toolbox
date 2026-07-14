// Unit tests for the seven skip-when-empty predicates extracted from the
// build*Section builders (#72) — each used to be a top-of-function guard
// buried inside an async Figma-node builder; now they're plain functions
// over DerivedFacts/DocSpec, testable without building a Figma node.

import { describe, expect, it, vi } from "vitest";
import { appliesVariantsSection } from "./buildVariantsSection";
import { appliesBreakdownSection } from "./buildBreakdownSection";
import { appliesModeSection } from "./buildModeSection";
import { appliesGuidelinesSection } from "./buildGuidelinesSection";
import { appliesRelatedSection } from "./buildRelatedSection";
import { appliesConstraintsSection } from "./buildConstraintsSection";
import { appliesDoDontGridSection } from "./buildDoDontGridSection";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";

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
    breakdown: {
      heights: [],
      width: null,
      iconPlacement: null,
      constraintWidths: [],
    },
    booleanProperties: [],
    modeCollections: [],
    relatedCandidates: [],
    ...overrides,
  } as DerivedFacts;
}

function baseSpec(overrides: Partial<DocSpec> = {}): DocSpec {
  return { status: "LIVE", ...overrides } as DocSpec;
}

describe("appliesVariantsSection", () => {
  it("is false when variants is absent", () => {
    expect(appliesVariantsSection(baseSpec())).toBe(false);
  });

  it("is false when variants is present but empty (presence-only rule)", () => {
    expect(appliesVariantsSection(baseSpec({ variants: {} }))).toBe(false);
  });

  it("is true when at least one family is authored", () => {
    const spec = baseSpec({
      variants: { Primary: { description: "The main CTA." } },
    });
    expect(appliesVariantsSection(spec)).toBe(true);
  });
});

describe("appliesBreakdownSection", () => {
  it("is false when spec.breakdown is absent", () => {
    expect(appliesBreakdownSection(baseFacts(), baseSpec())).toBe(false);
  });

  it("is false, and warns, when spec.breakdown is present but no anatomy facts derived", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const applies = appliesBreakdownSection(
      baseFacts(),
      baseSpec({ breakdown: {} }),
    );
    expect(applies).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("is true when spec.breakdown is present and at least one anatomy fact exists", () => {
    const facts = baseFacts({
      breakdown: {
        heights: [],
        width: { minWidth: 40, maxWidth: null },
        iconPlacement: null,
        constraintWidths: [],
      },
    });
    expect(appliesBreakdownSection(facts, baseSpec({ breakdown: {} }))).toBe(
      true,
    );
  });
});

describe("appliesModeSection", () => {
  it("is false when spec.mode is absent", () => {
    expect(appliesModeSection(baseFacts(), baseSpec())).toBe(false);
  });

  it("is false when spec.mode is present but there are no mode collections", () => {
    expect(
      appliesModeSection(baseFacts(), baseSpec({ mode: {} })),
    ).toBe(false);
  });

  it("is true when spec.mode is present and at least one mode collection exists", () => {
    const facts = baseFacts({
      modeCollections: [
        {
          id: "vc1",
          name: "Theme",
          defaultModeId: "m1",
          modes: [{ modeId: "m1", name: "Light" }],
        },
      ],
    });
    expect(appliesModeSection(facts, baseSpec({ mode: {} }))).toBe(true);
  });
});

describe("appliesGuidelinesSection", () => {
  it("is false when spec.guidelines is absent", () => {
    expect(appliesGuidelinesSection(baseSpec())).toBe(false);
  });

  it("is false when spec.guidelines is present but every list is empty", () => {
    expect(appliesGuidelinesSection(baseSpec({ guidelines: {} }))).toBe(false);
  });

  it("is true when at least one guidance list has content", () => {
    const spec = baseSpec({
      guidelines: { whenToUse: ["Use for the primary action."] },
    });
    expect(appliesGuidelinesSection(spec)).toBe(true);
  });
});

describe("appliesRelatedSection", () => {
  it("is false when spec.related is absent", () => {
    expect(appliesRelatedSection(baseSpec())).toBe(false);
  });

  it("is false when spec.related is present but empty", () => {
    expect(appliesRelatedSection(baseSpec({ related: {} }))).toBe(false);
  });

  it("is true when at least one related key is authored", () => {
    const spec = baseSpec({
      related: { "Icon Button": { guidance: "Use for icon-only actions." } },
    });
    expect(appliesRelatedSection(spec)).toBe(true);
  });
});

describe("appliesConstraintsSection", () => {
  it("is false when there are no constraint-width facts", () => {
    expect(appliesConstraintsSection(baseFacts())).toBe(false);
  });

  it("is true when at least one constraint-width fact exists", () => {
    const facts = baseFacts({
      breakdown: {
        heights: [],
        width: null,
        iconPlacement: null,
        constraintWidths: [
          {
            width: 120,
            minWidth: null,
            maxWidth: null,
            horizontalSizing: "FIXED",
            label: "",
            sizeLabel: null,
            familyValue: null,
            columnProps: {},
          },
        ],
      },
    });
    expect(appliesConstraintsSection(facts)).toBe(true);
  });
});

describe("appliesDoDontGridSection", () => {
  it("is false when spec.guidelines.doDonts is absent", () => {
    expect(appliesDoDontGridSection(baseSpec({ guidelines: {} }))).toBe(false);
  });

  it("is false when doDonts is an empty array", () => {
    expect(
      appliesDoDontGridSection(baseSpec({ guidelines: { doDonts: [] } })),
    ).toBe(false);
  });

  it("is true when at least one Do/Don't pair is authored", () => {
    const spec = baseSpec({
      guidelines: {
        doDonts: [
          {
            description: "Keep the label short.",
            good: { layout: "row", instances: [{ props: {} }] },
            bad: { layout: "row", instances: [{ props: {} }] },
          },
        ],
      },
    });
    expect(appliesDoDontGridSection(spec)).toBe(true);
  });
});
