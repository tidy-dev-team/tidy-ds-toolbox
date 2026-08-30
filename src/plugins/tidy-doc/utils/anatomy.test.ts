import { describe, it, expect } from "vitest";
import {
  dedupeConstraintFacts,
  deriveBooleanProperties,
  deriveWidthFact,
  describedIconPlacements,
  detectIconPlacements,
  MAX_ICON_PLACEMENT_EXAMPLES,
  planIconPlacementExamples,
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

describe("detectIconPlacements", () => {
  it("returns nothing when no property name mentions icon", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "Type", type: "VARIANT", values: ["Primary", "Secondary"] },
    ];
    expect(detectIconPlacements(descriptors)).toEqual([]);
  });

  it("keeps every icon property, in declaration order", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "left icon#119:2", type: "BOOLEAN" },
      { name: "right icon#119:3", type: "BOOLEAN" },
      {
        name: "Icon Position",
        type: "VARIANT",
        values: ["Leading", "Trailing"],
      },
    ];
    expect(detectIconPlacements(descriptors)).toEqual([
      {
        propertyName: "left icon#119:2",
        propertyType: "BOOLEAN",
        values: ["True", "False"],
      },
      {
        propertyName: "right icon#119:3",
        propertyType: "BOOLEAN",
        values: ["True", "False"],
      },
      {
        propertyName: "Icon Position",
        propertyType: "VARIANT",
        values: ["Leading", "Trailing"],
      },
    ]);
  });

  it("keeps a bare INSTANCE_SWAP slot with no placement values", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "Icon Slot", type: "INSTANCE_SWAP" },
    ];
    expect(detectIconPlacements(descriptors)).toEqual([
      {
        propertyName: "Icon Slot",
        propertyType: "INSTANCE_SWAP",
        values: [],
      },
    ]);
  });

  it("ignores a TEXT property whose name happens to mention icon", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "Icon caption", type: "TEXT" },
    ];
    expect(detectIconPlacements(descriptors)).toEqual([]);
  });

  it("matches case-insensitively", () => {
    const descriptors: PropertyDescriptor[] = [
      { name: "ICON", type: "BOOLEAN" },
    ];
    expect(detectIconPlacements(descriptors)[0].propertyName).toBe("ICON");
  });
});

describe("describedIconPlacements", () => {
  it("names only the properties that decide where the icon sits", () => {
    const facts = detectIconPlacements([
      { name: "left icon#119:2", type: "BOOLEAN" },
      { name: "left icon M swap#119:4", type: "INSTANCE_SWAP" },
      { name: "right icon#119:6", type: "BOOLEAN" },
      { name: "right icon M swap#119:8", type: "INSTANCE_SWAP" },
      { name: "right icon S swap#156:38", type: "INSTANCE_SWAP" },
      { name: "left icon S swap#156:57", type: "INSTANCE_SWAP" },
    ]);
    expect(describedIconPlacements(facts).map((f) => f.propertyName)).toEqual([
      "left icon#119:2",
      "right icon#119:6",
    ]);
  });

  it("falls back to swap slots when nothing else describes placement", () => {
    const facts = detectIconPlacements([
      { name: "Icon Slot", type: "INSTANCE_SWAP" },
    ]);
    expect(describedIconPlacements(facts).map((f) => f.propertyName)).toEqual([
      "Icon Slot",
    ]);
  });

  it("keeps a VARIANT placement axis", () => {
    const facts = detectIconPlacements([
      { name: "Icon Position", type: "VARIANT", values: ["Leading"] },
      { name: "Icon Slot", type: "INSTANCE_SWAP" },
    ]);
    expect(describedIconPlacements(facts).map((f) => f.propertyName)).toEqual([
      "Icon Position",
    ]);
  });

  it("narrows the prose without narrowing what was detected", () => {
    const facts = detectIconPlacements([
      { name: "left icon#119:2", type: "BOOLEAN" },
      { name: "left icon M swap#119:4", type: "INSTANCE_SWAP" },
    ]);
    expect(facts).toHaveLength(2);
    expect(describedIconPlacements(facts)).toHaveLength(1);
  });
});

describe("planIconPlacementExamples", () => {
  it("plans nothing when there are no icon properties", () => {
    expect(planIconPlacementExamples([])).toEqual([]);
  });

  it("turns two boolean toggles into left, right and none", () => {
    const examples = planIconPlacementExamples(
      detectIconPlacements([
        { name: "left icon#119:2", type: "BOOLEAN" },
        { name: "right icon#119:3", type: "BOOLEAN" },
      ]),
    );
    expect(examples).toEqual([
      {
        label: "Left Icon",
        booleanOverrides: {
          "left icon#119:2": true,
          "right icon#119:3": false,
        },
        variantOverrides: {},
      },
      {
        label: "Right Icon",
        booleanOverrides: {
          "left icon#119:2": false,
          "right icon#119:3": true,
        },
        variantOverrides: {},
      },
      {
        label: "No Icon",
        booleanOverrides: {
          "left icon#119:2": false,
          "right icon#119:3": false,
        },
        variantOverrides: {},
      },
    ]);
  });

  it("never turns on two toggles at once", () => {
    const examples = planIconPlacementExamples(
      detectIconPlacements([
        { name: "a icon#1:1", type: "BOOLEAN" },
        { name: "b icon#1:2", type: "BOOLEAN" },
        { name: "c icon#1:3", type: "BOOLEAN" },
      ]),
    );
    for (const example of examples) {
      const on = Object.values(example.booleanOverrides).filter(Boolean);
      expect(on.length).toBeLessThanOrEqual(1);
    }
  });

  it("plans one example per value of a VARIANT icon axis", () => {
    const examples = planIconPlacementExamples(
      detectIconPlacements([
        {
          name: "Icon Position",
          type: "VARIANT",
          values: ["Leading", "Trailing"],
        },
      ]),
    );
    expect(examples).toEqual([
      {
        label: "Leading",
        booleanOverrides: {},
        variantOverrides: { "Icon Position": "Leading" },
      },
      {
        label: "Trailing",
        booleanOverrides: {},
        variantOverrides: { "Icon Position": "Trailing" },
      },
    ]);
  });

  it("turns every boolean off while a variant value is shown", () => {
    const examples = planIconPlacementExamples(
      detectIconPlacements([
        { name: "left icon#119:2", type: "BOOLEAN" },
        { name: "Icon Position", type: "VARIANT", values: ["Leading"] },
      ]),
    );
    const variantExample = examples.find(
      (example) => example.variantOverrides["Icon Position"] === "Leading",
    );
    expect(variantExample?.booleanOverrides).toEqual({
      "left icon#119:2": false,
    });
  });

  it("plans nothing for an INSTANCE_SWAP slot, which offers no icon to pick", () => {
    expect(
      planIconPlacementExamples(
        detectIconPlacements([{ name: "Icon Slot", type: "INSTANCE_SWAP" }]),
      ),
    ).toEqual([]);
  });

  it("caps the plan so a many-toggle component stays a placement note", () => {
    const examples = planIconPlacementExamples(
      detectIconPlacements(
        Array.from({ length: 10 }, (_, i) => ({
          name: `icon ${i}#1:${i}`,
          type: "BOOLEAN" as const,
        })),
      ),
    );
    expect(examples).toHaveLength(MAX_ICON_PLACEMENT_EXAMPLES);
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
        cand({
          sizeLabel: "s",
          familyValue: "1",
          width: 160,
          minWidth: 160,
          maxWidth: 160,
        }),
        cand({
          sizeLabel: "s",
          familyValue: "2",
          width: 332,
          minWidth: 332,
          maxWidth: 332,
        }),
        cand({
          sizeLabel: "m",
          familyValue: "1",
          width: 220,
          minWidth: 220,
          maxWidth: 220,
        }),
        cand({
          sizeLabel: "m",
          familyValue: "2",
          width: 452,
          minWidth: 452,
          maxWidth: 452,
        }),
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
        cand({
          familyValue: "Primary",
          width: 100,
          minWidth: 100,
          maxWidth: 100,
        }),
        cand({
          familyValue: "Secondary",
          width: 100,
          minWidth: 100,
          maxWidth: 100,
        }),
        cand({
          familyValue: "Tertiary",
          width: 140,
          minWidth: 140,
          maxWidth: 140,
        }),
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
      cand({
        familyValue: null,
        columnProps: { Icon: "False" },
        width: 100,
        minWidth: 100,
        maxWidth: 100,
      }),
      cand({
        familyValue: null,
        columnProps: { Icon: "True" },
        width: 130,
        minWidth: 130,
        maxWidth: 130,
      }),
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
    expect(deriveBooleanProperties([{ key: "Size", type: "VARIANT" }])).toEqual(
      [],
    );
  });
});
