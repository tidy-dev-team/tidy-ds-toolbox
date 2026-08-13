import { describe, it, expect } from "vitest";
import { parseComponentDescription } from "./parseDescription";

describe("parseComponentDescription", () => {
  it("returns an empty result for an empty description", () => {
    expect(parseComponentDescription("")).toEqual({
      misprint: "",
      tags: [],
      sections: [],
    });
  });

  it("captures a misprint block regardless of case", () => {
    const result = parseComponentDescription("Misprint: none found");
    expect(result.misprint).toBe("Misprint: none found");
    expect(result.sections).toEqual([]);
  });

  it("splits a hashtag line into individual tags", () => {
    const result = parseComponentDescription("#button #primary #cta");
    expect(result.tags).toEqual(["#button", "#primary", "#cta"]);
  });

  it("splits everything else into title/content sections on the first newline", () => {
    const result = parseComponentDescription("🎨 Usage\nUse for primary actions");
    expect(result.sections).toEqual([
      { "🎨 Usage": "Use for primary actions" },
    ]);
  });

  it("joins multi-line section content back with newlines", () => {
    const result = parseComponentDescription(
      "🎨 Usage\nLine one\nLine two",
    );
    expect(result.sections).toEqual([{ "🎨 Usage": "Line one\nLine two" }]);
  });

  it("keeps a title-only section with empty content", () => {
    const result = parseComponentDescription("🎨 Usage");
    expect(result.sections).toEqual([{ "🎨 Usage": "" }]);
  });

  it("separates blocks on triple newlines and classifies each independently", () => {
    const description = [
      "Misprint: fixed typo",
      "#tag1 #tag2",
      "🎨 Usage\nDo this",
      "📐 Sizing\nDo that",
    ].join("\n\n\n");

    const result = parseComponentDescription(description);

    expect(result.misprint).toBe("Misprint: fixed typo");
    expect(result.tags).toEqual(["#tag1", "#tag2"]);
    expect(result.sections).toEqual([
      { "🎨 Usage": "Do this" },
      { "📐 Sizing": "Do that" },
    ]);
  });

  it("drops empty blocks produced by extra triple-newline separators", () => {
    const result = parseComponentDescription(
      "🎨 Usage\nDo this\n\n\n\n\n\n📐 Sizing\nDo that",
    );
    expect(result.sections).toEqual([
      { "🎨 Usage": "Do this" },
      { "📐 Sizing": "Do that" },
    ]);
  });
});
