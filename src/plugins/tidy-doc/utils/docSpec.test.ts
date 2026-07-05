import { describe, it, expect } from "vitest";
import { DocSpecSchema } from "./docSpec";

describe("DocSpecSchema", () => {
  it("accepts a minimal valid spec (status only)", () => {
    const result = DocSpecSchema.safeParse({ status: "IDEATION" });
    expect(result.success).toBe(true);
  });

  it("accepts a present-but-empty variants object (presence-only minimum rule)", () => {
    const result = DocSpecSchema.safeParse({ status: "LIVE", variants: {} });
    expect(result.success).toBe(true);
  });

  it("accepts a full spec across every Section key", () => {
    const result = DocSpecSchema.safeParse({
      status: "REVIEWING",
      variants: {
        Primary: { description: "The default call to action.", whenToUse: ["Use for the main action on a page."] },
      },
      breakdown: { heightCaption: "Height scales with size.", widthCaption: "Width hugs content.", iconPlacementCaption: "Icons sit left of the label." },
      mode: { caption: "Adapts to light and dark themes." },
      guidelines: {
        whenToUse: ["When a single primary action is needed."],
        whenNotToUse: ["When multiple equal-weight actions are shown."],
        general: ["Keep labels short and action-oriented."],
      },
      related: { "Icon Button": { guidance: "Use when the action has no text label." } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a spec missing status", () => {
    const result = DocSpecSchema.safeParse({ variants: {} });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown status enum value", () => {
    const result = DocSpecSchema.safeParse({ status: "SHIPPED" });
    expect(result.success).toBe(false);
  });

  it("rejects an over-length variant description", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      variants: { Primary: { description: "x".repeat(241) } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an over-length whenToUse item", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      variants: { Primary: { description: "ok", whenToUse: ["x".repeat(121)] } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whenToUse array longer than 6 items", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      variants: { Primary: { description: "ok", whenToUse: Array(7).fill("short") } },
    });
    expect(result.success).toBe(false);
  });
});
