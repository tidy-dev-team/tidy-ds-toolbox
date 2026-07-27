import { describe, it, expect } from "vitest";
import { checkDocumentation } from "./documentation";
import type { ComponentSetSnapshot } from "../snapshot";

function fixture(documentationLinks?: string[]): ComponentSetSnapshot {
  return {
    id: "1:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    ...(documentationLinks ? { documentationLinks } : {}),
    propertyNames: [],
    properties: [],
    variants: [],
  };
}

describe("checkDocumentation (#19)", () => {
  it("passes when a documentation link is set, and names it", () => {
    const result = checkDocumentation(
      fixture(["https://storybook.example/button"]),
    );
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("https://storybook.example/button");
  });

  it("reports not_applicable, never a failure, when there is no link", () => {
    const result = checkDocumentation(fixture());
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
  });

  it("treats an empty link list the same as an absent one", () => {
    expect(checkDocumentation(fixture([])).status).toBe("not_applicable");
  });

  it("explains what was looked for, so an empty row isn't read as broken", () => {
    // Design described item 19 as a stage, not a field; if their docs live
    // somewhere other than Figma's link field this note is what reveals it.
    const note = checkDocumentation(fixture()).note ?? "";
    expect(note).toMatch(/documentation-link field/);
    expect(note).toMatch(/before documentation/);
  });

  it("lists every link when more than one is set", () => {
    const result = checkDocumentation(
      fixture(["https://a.example", "https://b.example"]),
    );
    expect(result.note).toContain("https://a.example");
    expect(result.note).toContain("https://b.example");
  });

  // The regression: a static per-item remainder put "Read the documentation"
  // and an unticked box on the row precisely when there was no documentation,
  // contradicting the whole point of not treating absence as a defect.
  it("asks for no content review when there is no documentation", () => {
    for (const fx of [fixture(), fixture([])]) {
      const result = checkDocumentation(fx);
      expect(result.status).toBe("not_applicable");
      expect(result.manualRemainder).toBeUndefined();
    }
  });

  it("asks for a content review once a link exists", () => {
    // The row claims usage guidance and properties are documented, which a link
    // alone cannot establish.
    const result = checkDocumentation(fixture(["https://storybook.example"]));
    expect(result.status).toBe("pass");
    expect(result.manualRemainder).toMatch(/covers usage/);
  });

  it("reports under the right check id and title", () => {
    const result = checkDocumentation(fixture());
    expect(result.checkId).toBe("documentation");
    expect(result.title).toBe("Documentation");
  });
});
