import { describe, it, expect } from "vitest";
import {
  dedupeConstraintFacts,
  deriveBooleanProperties,
  deriveWidthFact,
  detectIconPlacement,
  findMatchingVariantIndex,
  widthConstraintLabel,
  type ConstraintCandidate,
  type PropertyDescriptor,
} from "./anatomy";

describe("deriveWidthFact", () => {
  it("returns null when neither minWidth nor maxWidth is set", () => {
    expect(deriveWidthFact(null, null)).toBeNull();
  });

  it("returns the fact when only minWidth is set", () => {
    expect(deriveWidthFact(120, null)).toEqual({
      minWidth: 120,
      maxWidth: null,
    });
  });

  it("returns the fact when only maxWidth is set", () => {
    expect(deriveWidthFact(null, 480)).toEqual({
      minWidth: null,
      maxWidth: 480,
    });
  });

  it("returns the fact when both are set", () => {
    expect(deriveWidthFact(120, 480)).toEqual({ minWidth: 120, maxWidth: 480 });
  });
});

describe("detectIconPlacement", () => {
  it("returns null when no property name mentions icon", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "Type", type: "VARIANT", values: ["Primary", "Secondary"] },
    ];
    expect(detectIconPlacement(descriptors)).toBeNull();
  });

  it("prefers a VARIANT icon-position axis over a BOOLEAN toggle", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "Has Icon", type: "BOOLEAN" },
      {
        name: "Icon Position",
        type: "VARIANT",
        values: ["Leading", "Trailing", "None"],
      },
    ];
    expect(detectIconPlacement(descriptors)).toEqual({
      propertyName: "Icon Position",
      propertyType: "VARIANT",
      values: ["Leading", "Trailing", "None"],
    });
  });

  it("falls back to a BOOLEAN presence toggle when no VARIANT axis exists", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "Icon", type: "BOOLEAN" },
    ];
    expect(detectIconPlacement(descriptors)).toEqual({
      propertyName: "Icon",
      propertyType: "BOOLEAN",
      values: ["True", "False"],
    });
  });

  it("falls back to a bare INSTANCE_SWAP slot with no placement values", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "Icon Slot", type: "INSTANCE_SWAP" },
    ];
    expect(detectIconPlacement(descriptors)).toEqual({
      propertyName: "Icon Slot",
      propertyType: "INSTANCE_SWAP",
      values: [],
    });
  });

  it("matches case-insensitively", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "ICON", type: "BOOLEAN" },
    ];
    expect(detectIconPlacement(descriptors)?.propertyName).toBe("ICON");
  });
});

describe("widthConstraintLabel", () => {
  it("labels a fixed-width variant as 'fixed <rounded width>'", () => {
    expect(widthConstraintLabel("FIXED", 128.4)).toBe("fixed 128");
    expect(widthConstraintLabel("FIXED", 128.6)).toBe("fixed 129");
  });

  it("labels a hugging variant as 'hug', never prefixed 'fixed'", () => {
    expect(widthConstraintLabel("HUG", 128)).toBe("hug");
  });

  it("labels a filling variant as 'fill', never prefixed 'fixed'", () => {
    expect(widthConstraintLabel("FILL", 128)).toBe("fill");
  });

  it("labels a variant clamped to minWidth === maxWidth as fixed at the clamp", () => {
    expect(widthConstraintLabel("HUG", 128, 160, 160)).toBe("fixed 160");
    expect(widthConstraintLabel("FILL", 128, 160, 160)).toBe("fixed 160");
  });

  it("keeps hug/fill when the min/max clamp leaves room to resize", () => {
    expect(widthConstraintLabel("HUG", 128, 120, 200)).toBe("hug");
    expect(widthConstraintLabel("HUG", 128, 160, null)).toBe("hug");
    expect(widthConstraintLabel("FILL", 128, null, 200)).toBe("fill");
  });
});

describe("findMatchingVariantIndex", () => {
  const children = [
    { variantProperties: { Size: "S", Type: "Primary", State: "Idle" } },
    { variantProperties: { Size: "M", Type: "Primary", State: "Idle" } },
    { variantProperties: { Size: "L", Type: "Primary", State: "Idle" } },
    { variantProperties: null },
  ];

  it("finds the child matching every target key", () => {
    const index = findMatchingVariantIndex(children, {
      Size: "M",
      Type: "Primary",
      State: "Idle",
    });
    expect(index).toBe(1);
  });

  it("returns null when no child matches", () => {
    const index = findMatchingVariantIndex(children, {
      Size: "XL",
      Type: "Primary",
      State: "Idle",
    });
    expect(index).toBeNull();
  });

  it("returns null for a mismatched non-size key even if size matches", () => {
    const index = findMatchingVariantIndex(children, {
      Size: "S",
      Type: "Secondary",
      State: "Idle",
    });
    expect(index).toBeNull();
  });

  it("skips children with no variantProperties", () => {
    const index = findMatchingVariantIndex(children, { Size: "M" });
    expect(index).toBe(1);
  });
});

describe("dedupeConstraintFacts", () => {
  const cand = (
    over: Partial<ConstraintCandidate> = {},
  ): ConstraintCandidate => ({
    sizeLabel: "s",
    familyValue: null,
    columnProps: {},
    width: 160,
    horizontalSizing: "FIXED",
    minWidth: 160,
    maxWidth: 160,
    ...over,
  });

  it("leaves a single-signature size group unlabeled (uniform constraint)", () => {
    // A Button whose Primary/Secondary/Tertiary are all the same width.
    const facts = dedupeConstraintFacts([
      cand({ familyValue: "Primary" }),
      cand({ familyValue: "Secondary" }),
      cand({ familyValue: "Tertiary" }),
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0].label).toBe("");
    expect(facts[0].familyValue).toBe("Primary");
  });

  it("labels each distinct width with '<axis> = <value>'", () => {
    // A button group whose 1- and 2-button variants differ in width.
    const facts = dedupeConstraintFacts(
      [
        cand({ familyValue: "1", width: 160, minWidth: 160, maxWidth: 160 }),
        cand({ familyValue: "2", width: 332, minWidth: 332, maxWidth: 332 }),
      ],
      "BtnAmount",
    );
    expect(facts.map((f) => [f.label, f.width])).toEqual([
      ["BtnAmount = 1", 160],
      ["BtnAmount = 2", 332],
    ]);
  });

  it("omits the axis prefix when there is no family axis name", () => {
    const facts = dedupeConstraintFacts([
      cand({ familyValue: "1", width: 160, minWidth: 160, maxWidth: 160 }),
      cand({ familyValue: "2", width: 332, minWidth: 332, maxWidth: 332 }),
    ]);
    expect(facts.map((f) => f.label)).toEqual(["1", "2"]);
  });

  it("groups per size, preserving size and first-seen order", () => {
    const facts = dedupeConstraintFacts(
      [
        cand({ sizeLabel: "s", familyValue: "1", width: 160, minWidth: 160, maxWidth: 160 }),
        cand({ sizeLabel: "s", familyValue: "2", width: 332, minWidth: 332, maxWidth: 332 }),
        cand({ sizeLabel: "m", familyValue: "1", width: 220, minWidth: 220, maxWidth: 220 }),
        cand({ sizeLabel: "m", familyValue: "2", width: 452, minWidth: 452, maxWidth: 452 }),
      ],
      "BtnAmount",
    );
    expect(facts.map((f) => [f.sizeLabel, f.label, f.width])).toEqual([
      ["s", "BtnAmount = 1", 160],
      ["s", "BtnAmount = 2", 332],
      ["m", "BtnAmount = 1", 220],
      ["m", "BtnAmount = 2", 452],
    ]);
  });

  it("merges family values that share one width into a single labeled cell", () => {
    // Primary + Secondary share a width; Tertiary differs.
    const facts = dedupeConstraintFacts(
      [
        cand({ familyValue: "Primary", width: 100, minWidth: 100, maxWidth: 100 }),
        cand({ familyValue: "Secondary", width: 100, minWidth: 100, maxWidth: 100 }),
        cand({ familyValue: "Tertiary", width: 140, minWidth: 140, maxWidth: 140 }),
      ],
      "Type",
    );
    expect(facts.map((f) => [f.label, f.width])).toEqual([
      ["Type = Primary, Secondary", 100],
      ["Type = Tertiary", 140],
    ]);
  });

  it("falls back to the column combination when the family axis does not distinguish", () => {
    // No family axis; a demoted column drives the width difference.
    const facts = dedupeConstraintFacts([
      cand({ familyValue: null, columnProps: { Icon: "False" }, width: 100, minWidth: 100, maxWidth: 100 }),
      cand({ familyValue: null, columnProps: { Icon: "True" }, width: 130, minWidth: 130, maxWidth: 130 }),
    ]);
    expect(facts.map((f) => [f.label, f.width])).toEqual([
      ["False", 100],
      ["True", 130],
    ]);
  });
});

describe("deriveBooleanProperties", () => {
  it("picks BOOLEAN properties, stripping the #id suffix for the name", () => {
    expect(
      deriveBooleanProperties([
        { key: "Type", type: "VARIANT" },
        { key: "validation#12:3", type: "BOOLEAN", defaultValue: false },
        { key: "Label#4:5", type: "TEXT" },
        { key: "hasIcon#6:7", type: "BOOLEAN", defaultValue: true },
      ]),
    ).toEqual([
      { key: "validation#12:3", name: "validation", defaultValue: false },
      { key: "hasIcon#6:7", name: "hasIcon", defaultValue: true },
    ]);
  });

  it("returns an empty list when there are no BOOLEAN properties", () => {
    expect(
      deriveBooleanProperties([{ key: "Size", type: "VARIANT" }]),
    ).toEqual([]);
  });
});
