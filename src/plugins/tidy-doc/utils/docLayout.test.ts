import { describe, expect, it } from "vitest";
import { normalizeDocLayout } from "./docLayout";

describe("normalizeDocLayout", () => {
  it("accepts 'vertical'", () => {
    expect(normalizeDocLayout("vertical")).toBe("vertical");
  });

  it("accepts 'horizontal'", () => {
    expect(normalizeDocLayout("horizontal")).toBe("horizontal");
  });

  it("falls back to the default for undefined", () => {
    expect(normalizeDocLayout(undefined)).toBe("horizontal");
  });

  it("falls back to the default for garbage", () => {
    expect(normalizeDocLayout("sideways")).toBe("horizontal");
    expect(normalizeDocLayout(null)).toBe("horizontal");
    expect(normalizeDocLayout(42)).toBe("horizontal");
    expect(normalizeDocLayout({})).toBe("horizontal");
  });
});
