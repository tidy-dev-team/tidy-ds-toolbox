import { describe, expect, it } from "vitest";
import { affectedVariants, findingMode, modeFields } from "./finding-fields";
import { MAX_REPORTED_NODES } from "./dedupe-findings";

describe("findingMode", () => {
  it("reads a fully declared mode", () => {
    expect(findingMode({ modeId: "m:1", modeName: "DNA" })).toEqual({
      id: "m:1",
      name: "DNA",
    });
  });

  // The rule this function exists to hold in one place. It was written out at
  // three sites and the three disagreed about an empty name, so one layer
  // forwarded a mode the next refused to pin.
  it.each([
    ["nothing at all", {}],
    ["id only", { modeId: "m:1" }],
    ["name only", { modeName: "DNA" }],
    ["an empty id", { modeId: "", modeName: "DNA" }],
    ["an empty name", { modeId: "m:1", modeName: "" }],
  ])("treats %s as no mode", (_label, finding) => {
    expect(findingMode(finding)).toBeUndefined();
  });
});

describe("modeFields", () => {
  it("spreads both fields for a declared mode", () => {
    expect(modeFields({ modeId: "m:1", modeName: "DNA" })).toEqual({
      modeId: "m:1",
      modeName: "DNA",
    });
  });

  it("spreads nothing at all when there is no mode, so no key appears", () => {
    const spread = { ...modeFields({ modeId: "m:1" }) };
    expect(Object.keys(spread)).toEqual([]);
  });
});

describe("affectedVariants", () => {
  it("keeps the ids in order and counts them", () => {
    expect(affectedVariants(["2:1", "2:2", "2:3"])).toEqual({
      affectedVariantIds: ["2:1", "2:2", "2:3"],
      affectedVariantCount: 3,
    });
  });

  // The crossed-binding finding flattens several layer groups and can name one
  // variant twice; counting it twice would overstate the denominator.
  it("deduplicates, preserving first-seen order", () => {
    expect(affectedVariants(["2:2", "2:1", "2:2"])).toEqual({
      affectedVariantIds: ["2:2", "2:1"],
      affectedVariantCount: 2,
    });
  });

  // The whole reason the two fields are separate: the ids are a sample to draw
  // from, the count is what a caption prints, and a denominator read off a capped
  // list would report the cap and shrink as the defect grew.
  it("caps the ids and leaves the count uncapped", () => {
    const ids = Array.from(
      { length: MAX_REPORTED_NODES + 7 },
      (_, i) => `v:${i}`,
    );
    const result = affectedVariants(ids);
    expect(result.affectedVariantIds).toHaveLength(MAX_REPORTED_NODES);
    expect(result.affectedVariantCount).toBe(MAX_REPORTED_NODES + 7);
  });

  it("accepts a Set, since one producer keeps its variants that way", () => {
    expect(affectedVariants(new Set(["2:1", "2:2"]))).toEqual({
      affectedVariantIds: ["2:1", "2:2"],
      affectedVariantCount: 2,
    });
  });

  it("reports an empty set as empty rather than as absent", () => {
    expect(affectedVariants([])).toEqual({
      affectedVariantIds: [],
      affectedVariantCount: 0,
    });
  });
});
