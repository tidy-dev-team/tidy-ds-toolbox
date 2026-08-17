import { describe, it, expect } from "vitest";
import { conflictingVariantsMessage } from "./conflictingVariantsMessage";

describe("conflictingVariantsMessage", () => {
  it("names the component set", () => {
    const message = conflictingVariantsMessage(
      "Button",
      "Component set for node has existing errors",
    );
    expect(message).toContain("Button");
  });

  it("says the variants conflict, and includes Figma's reason", () => {
    const message = conflictingVariantsMessage(
      "Button",
      "Component set for node has existing errors",
    );
    expect(message).toContain("conflicting variant combination");
    expect(message).toContain("Component set for node has existing errors");
  });

  it("says what to do next, without naming a Figma API function", () => {
    const message = conflictingVariantsMessage("Button", "some reason");
    expect(message).toContain("Open the Variants panel in Figma");
    expect(message).not.toContain("get_variantProperties");
  });
});
