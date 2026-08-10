import { describe, expect, it } from "vitest";

import { extractVariantValue } from "./variantValue";

describe("extractVariantValue", () => {
  it("reads the value of the named property", () => {
    expect(extractVariantValue("Size=m, State=hover", "State")).toBe("hover");
  });

  it("trims the spacing Figma writes between properties", () => {
    expect(extractVariantValue("Size=m, State=hover", "Size")).toBe("m");
  });

  it("matches the property name whole, not as a substring", () => {
    expect(extractVariantValue("Icon Size=16, Size=m", "Size")).toBe("m");
  });

  it("keeps an equals sign inside the value", () => {
    expect(extractVariantValue("Label=a=b", "Label")).toBe("a=b");
  });

  it("returns empty for a property the variant does not carry", () => {
    expect(extractVariantValue("Size=m", "State")).toBe("");
  });

  it("returns empty for an unnamed property", () => {
    expect(extractVariantValue("Size=m", "")).toBe("");
  });
});
