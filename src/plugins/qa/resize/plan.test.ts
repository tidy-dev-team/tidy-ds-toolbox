import { describe, it, expect } from "vitest";
import { planResizeProbe, type ResizePlan } from "./plan";
import type { NodeSnapshot } from "../snapshot";

function root(extra: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return {
    id: "root",
    name: "Button",
    type: "COMPONENT",
    visible: true,
    width: 120,
    height: 40,
    children: [],
    layoutMode: "HORIZONTAL",
    layoutSizingHorizontal: "FILL",
    ...extra,
  };
}

function plan(extra: Partial<NodeSnapshot> = {}): ResizePlan {
  const result = planResizeProbe(root(extra));
  if ("skipped" in result)
    throw new Error(`unexpectedly skipped: ${result.skipped}`);
  return result.plan;
}

function lastTarget(p: ResizePlan) {
  return p.targets[p.targets.length - 1];
}

function skip(extra: Partial<NodeSnapshot> = {}): string {
  const result = planResizeProbe(root(extra));
  if (!("skipped" in result)) throw new Error("expected a skip");
  return result.skipped;
}

describe("planResizeProbe", () => {
  it("drives a FILL component through its parent", () => {
    // Resizing a FILL instance directly does nothing, so measuring it that way
    // would report a confident pass on a component that never moved.
    expect(plan({ layoutSizingHorizontal: "FILL" }).path).toBe("parent");
  });

  it("drives a FIXED component directly", () => {
    expect(plan({ layoutSizingHorizontal: "FIXED" }).path).toBe("direct");
  });

  it("refuses to probe a hugging component, with the reason", () => {
    expect(skip({ layoutSizingHorizontal: "HUG" })).toContain(
      "hugs its content",
    );
  });

  it("refuses when Figma reports no horizontal sizing at all", () => {
    expect(skip({ layoutSizingHorizontal: undefined })).toContain(
      "auto-layout",
    );
  });

  it("refuses a zero-width component rather than dividing into it", () => {
    expect(skip({ width: 0 })).toContain("no width to scale from");
  });

  it("measures both narrower and wider", () => {
    // Narrowing is where text clips, which is the commonest resize defect;
    // widening is where SPACE_BETWEEN blows a hole. Both or neither.
    const targets = plan().targets;
    expect(targets).toHaveLength(2);
    expect(targets[0].width).toBeLessThan(120);
    expect(targets[1].width).toBeGreaterThan(120);
  });

  it("labels each width so evidence and rows can name the state", () => {
    expect(plan().targets.map((t) => t.label)).toEqual([
      "narrowed to 48px",
      "widened to 300px",
    ]);
  });

  it("overshoots a declared maxWidth so the bound is actually tested", () => {
    // Stopping exactly at maxWidth is indistinguishable from never being pushed
    // that far, so the drive has to unambiguously try to violate it.
    const targets = plan({ maxWidth: 1000 }).targets;
    expect(targets[1].width).toBeGreaterThan(1000);
  });

  it("overshoots a declared minWidth in the narrowing pass", () => {
    const targets = plan({ minWidth: 100 }).targets;
    expect(targets[0].width).toBeLessThan(100);
  });

  it("keeps the wide pass at 2.5x when maxWidth is nowhere near it", () => {
    // No reason to drive further out to test a bound 300px does not approach.
    expect(plan({ maxWidth: 100 }).targets[1].width).toBe(300);
    expect(plan({ maxWidth: 1000 }).targets[1].width).toBe(1200);
  });

  it("caps how far it will ever drive a width, bound overshoot included", () => {
    // The ceiling wins over the overshoot: past this, Figma's own layout starts
    // producing numbers nobody wants to reason about, for no extra evidence.
    expect(lastTarget(plan({ width: 3000 })).width).toBe(4000);
    expect(lastTarget(plan({ maxWidth: 4000 })).width).toBe(4000);
  });

  it("drops the narrowing pass when there is no room for one", () => {
    // Every target is floored at 1px, so a 1px component cannot be narrowed.
    // Driving to the same width measures nothing, so that pass is dropped rather
    // than run and reported as clean.
    expect(plan({ width: 1 }).targets.map((t) => t.label)).toEqual([
      "widened to 3px",
    ]);
  });

  it("reports the baseline it will compare against", () => {
    expect(plan({ width: 240 }).baselineWidth).toBe(240);
  });
});
