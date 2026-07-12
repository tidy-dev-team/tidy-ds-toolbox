import { describe, it, expect } from "vitest";
import {
  deriveWidthFact,
  detectIconPlacement,
  findMatchingVariantIndex,
  widthConstraintLabel,
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
