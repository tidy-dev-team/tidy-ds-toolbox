import { describe, it, expect } from "vitest";
import { findDescriptionSection } from "./findDescriptionSection";
import { ComponentDescription } from "./parseDescription";

function description(sections: Record<string, string>[]): ComponentDescription {
  return { misprint: "", tags: [], sections };
}

describe("findDescriptionSection", () => {
  it("returns the content of the section whose key starts with the emoji", () => {
    const result = findDescriptionSection(
      "🎨",
      description([{ "🎨 Usage": "Use for primary actions" }]),
      "fallback",
    );
    expect(result).toBe("Use for primary actions");
  });

  it("picks the first matching section when several exist", () => {
    const result = findDescriptionSection(
      "🎨",
      description([{ "🎨 First": "one" }, { "🎨 Second": "two" }]),
      "fallback",
    );
    expect(result).toBe("one");
  });

  it("returns the fallback when no section matches the emoji", () => {
    const result = findDescriptionSection(
      "📐",
      description([{ "🎨 Usage": "Use for primary actions" }]),
      "fallback",
    );
    expect(result).toBe("fallback");
  });

  it("returns the fallback when there are no sections at all", () => {
    expect(findDescriptionSection("🎨", description([]), "fallback")).toBe(
      "fallback",
    );
  });
});
