import { describe, expect, it } from "vitest";
import { deriveMatrixModel } from "./matrixModel";
import type { DerivedFacts } from "./facts";

function makeFacts(overrides: Partial<DerivedFacts> = {}): DerivedFacts {
  return {
    componentId: "1:1",
    componentName: "Button",
    familyAxis: { name: "Type", values: ["Primary", "Secondary"] },
    stateAxis: { name: "State", values: ["Rest", "Hover", "Disabled"] },
    sizeAxis: { name: "Size", values: ["S", "M", "L"] },
    demoted: ["Icon Position"],
    demotedAxisValues: { "Icon Position": ["Leading", "Trailing"] },
    pinnedDefaults: {
      State: "Rest",
      Size: "M",
      "Icon Position": "Leading",
    },
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
  };
}

describe("deriveMatrixModel", () => {
  it("reference case: size + family + one demoted axis", () => {
    const model = deriveMatrixModel(makeFacts());

    expect(model.sizeGroups).toEqual([
      { label: "S", sizeValue: "S" },
      { label: "M", sizeValue: "M" },
      { label: "L", sizeValue: "L" },
    ]);
    expect(model.rowAxisName).toBe("Type");
    expect(model.rows).toEqual([
      { label: "Primary", familyValue: "Primary" },
      { label: "Secondary", familyValue: "Secondary" },
    ]);
    expect(model.columns).toEqual([
      { label: "Leading", props: { "Icon Position": "Leading" } },
      { label: "Trailing", props: { "Icon Position": "Trailing" } },
    ]);
    expect(model.truncatedColumnCount).toBe(0);
  });

  it("no size axis: a single unlabeled group", () => {
    const model = deriveMatrixModel(makeFacts({ sizeAxis: null }));
    expect(model.sizeGroups).toEqual([{ label: null, sizeValue: null }]);
  });

  it("no named family axis: a single row labeled with the component name", () => {
    const model = deriveMatrixModel(
      makeFacts({ familyAxis: { name: null, values: ["default"] } }),
    );
    expect(model.rowAxisName).toBeNull();
    expect(model.rows).toEqual([{ label: "Button", familyValue: null }]);
  });

  it("no demoted axes: a single empty column", () => {
    const model = deriveMatrixModel(
      makeFacts({ demoted: [], demotedAxisValues: {} }),
    );
    expect(model.columns).toEqual([{ label: "", props: {} }]);
  });

  it("multiple demoted axes: cartesian product and the column cap", () => {
    const model = deriveMatrixModel(
      makeFacts({
        demoted: ["Icon Position", "Density"],
        demotedAxisValues: {
          "Icon Position": ["Leading", "Trailing", "None"],
          Density: ["Compact", "Comfortable", "Spacious", "Roomy", "Airy"],
        },
      }),
    );

    // 3 * 5 = 15 combinations, capped at 12.
    expect(model.columns).toHaveLength(12);
    expect(model.truncatedColumnCount).toBe(3);
    expect(model.columns[0]).toEqual({
      label: "Leading / Compact",
      props: { "Icon Position": "Leading", Density: "Compact" },
    });
  });

  it("excludes the state axis from columns and pins it to its rest default", () => {
    const model = deriveMatrixModel(makeFacts());
    for (const column of model.columns) {
      expect(column.props).not.toHaveProperty("State");
    }
    // The rest default lives in pinnedDefaults, which the renderer (not the
    // model) applies to every cell via the shared specimen factory.
    expect(model.rowAxisName).not.toBe("State");
  });
});
