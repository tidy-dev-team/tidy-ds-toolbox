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

  const validScene = {
    layout: "row" as const,
    instances: [{ props: { Type: "Primary" }, labelOverride: "Primary" }],
  };

  it("accepts a guidelines block with bullet lists and a doDonts pair", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      guidelines: {
        whenToUse: ["When a single primary action is needed."],
        doDonts: [
          {
            description: "Don't pair two primary buttons in the same row.",
            good: validScene,
            bad: { layout: "row", instances: [validScene.instances[0], validScene.instances[0]] },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a present-but-empty guidelines object (presence-only minimum rule)", () => {
    const result = DocSpecSchema.safeParse({ status: "LIVE", guidelines: {} });
    expect(result.success).toBe(true);
  });

  it("rejects a doDonts pair missing the bad scene", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      guidelines: { doDonts: [{ description: "ok", good: validScene }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a SpecimenScene with zero instances", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      guidelines: {
        doDonts: [
          {
            description: "ok",
            good: { layout: "row", instances: [] },
            bad: validScene,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a SpecimenScene with more than 4 instances", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      guidelines: {
        doDonts: [
          {
            description: "ok",
            good: { layout: "row", instances: Array(5).fill(validScene.instances[0]) },
            bad: validScene,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a doDonts array longer than 6 pairs", () => {
    const pair = { description: "ok", good: validScene, bad: validScene };
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      guidelines: { doDonts: Array(7).fill(pair) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid SpecimenScene layout", () => {
    const result = DocSpecSchema.safeParse({
      status: "IDEATION",
      guidelines: {
        doDonts: [
          {
            description: "ok",
            good: { layout: "diagonal", instances: [validScene.instances[0]] },
            bad: validScene,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});
