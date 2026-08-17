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

  it("says what to do next", () => {
    const message = conflictingVariantsMessage("Button", "some reason");
    expect(message).toContain("Open the Variants panel in Figma");
  });

  it("reports the reason it was given verbatim, and does not sanitise it", () => {
    // Deliberately not this function's job. `readVariantProperties` strips
    // Figma's `in <fn>: ` prefix at the single point where the throw becomes
    // a value, so the reason arriving here is already fit to print. Doing it
    // again here would be a second implementation that can only drift.
    //
    // The previous version of this test asserted the absence of
    // "get_variantProperties" while feeding in "some reason" - a string that
    // could never contain it. It passed by construction and could not fail,
    // which is why the real message shipped with the API name still in it.
    const message = conflictingVariantsMessage("Button", "  odd  spacing  ");
    expect(message).toContain("  odd  spacing  ");
  });
});
