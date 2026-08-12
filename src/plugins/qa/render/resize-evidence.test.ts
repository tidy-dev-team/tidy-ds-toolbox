import { describe, it, expect } from "vitest";
import { planResizeEvidence } from "./resize-evidence";
import { isPlan, type StateGridPlan } from "./state-grid";
import type {
  ComponentPropertySnapshot,
  ComponentSetSnapshot,
  ResizeProbeSnapshot,
} from "../snapshot";
import type { Anomaly } from "../resize/anomalies";

function anomaly(extra: Partial<Anomaly> = {}): Anomaly {
  return {
    kind: "overflow",
    confidence: "verdict",
    nodeId: "layer",
    nodeName: "Label",
    detail: "the label is cut off.",
    measuredAtWidth: 48,
    state: "narrowed to 48px",
    ...extra,
  };
}

function probe(extra: Partial<ResizeProbeSnapshot> = {}): ResizeProbeSnapshot {
  return {
    variantId: "1",
    variantName: "State=Default",
    baselineWidth: 120,
    states: ["narrowed to 48px", "widened to 300px"],
    anomalies: [],
    ...extra,
  };
}

/** A set with one TEXT property, so the long-text cell has something to set. */
function snapshot(
  properties: ComponentPropertySnapshot[] = [
    { name: "Label", key: "Label#1:0", type: "TEXT" },
  ],
): ComponentSetSnapshot {
  return {
    id: "set",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: properties.map((p) => p.name),
    properties,
    variants: [],
  };
}

function plan(extra: Partial<ResizeProbeSnapshot> = {}): StateGridPlan {
  const result = planResizeEvidence(probe(extra), snapshot());
  if (!isPlan(result)) throw new Error(`no plan: ${result.reason}`);
  return result;
}

function reason(input: ResizeProbeSnapshot | undefined): string {
  const result = planResizeEvidence(input, snapshot());
  if (isPlan(result)) throw new Error("expected no plan");
  return result.reason;
}

describe("planResizeEvidence", () => {
  it("draws nothing when the component measured clean", () => {
    // The healthy path, and the common one: a clean QA run costs exactly what it
    // did before this feature existed.
    expect(reason(probe())).toContain("nothing drifted");
  });

  it("draws nothing when the probe never ran", () => {
    expect(reason(undefined)).toContain("did not run");
  });

  it("draws nothing when the probe skipped, and forwards the reason", () => {
    expect(
      reason(probe({ skipped: "the component hugs its content." })),
    ).toContain("hugs its content");
  });

  it("draws nothing for an unmoved component", () => {
    // There is no broken state to photograph if the component never moved.
    expect(reason(probe({ unmoved: true, anomalies: [anomaly()] }))).toContain(
      "did not move",
    );
  });

  it("puts the baseline first, for comparison", () => {
    const cells = plan({ anomalies: [anomaly()] }).rows[0].cells;
    expect(cells[0].label).toContain("baseline");
    expect(cells[0].width).toBe(120);
  });

  it("draws the state that broke, at the width it broke at", () => {
    const cells = plan({ anomalies: [anomaly()] }).rows[0].cells;
    expect(cells[1].label).toBe("narrowed to 48px");
    expect(cells[1].width).toBe(48);
  });

  it("captions the cell with the measured numbers", () => {
    const cells = plan({
      anomalies: [anomaly({ detail: "the gap went from 8px to 288px." })],
    }).rows[0].cells;
    expect(cells[1].captions[0]).toContain("288px");
  });

  it("groups every anomaly at one width into one cell", () => {
    const cells = plan({
      anomalies: [anomaly(), anomaly({ nodeId: "other", detail: "second." })],
    }).rows[0].cells;
    expect(cells).toHaveLength(2);
    expect(cells[1].captions).toHaveLength(2);
  });

  it("captions verdicts before candidates", () => {
    // A truncated caption list should keep the facts that settle something.
    const cells = plan({
      anomalies: [
        anomaly({ confidence: "candidate", detail: "a candidate." }),
        anomaly({ confidence: "verdict", detail: "a verdict." }),
      ],
    }).rows[0].cells;
    expect(cells[1].captions[0]).toBe("a verdict.");
  });

  it("caps captions and says how many it dropped", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      anomaly({ detail: `finding ${i}.` }),
    );
    const captions = plan({ anomalies: many }).rows[0].cells[1].captions;
    expect(captions).toHaveLength(4);
    expect(captions[3]).toContain("+3 more");
  });

  it("draws a cell per broken width, up to the cap, and says what it dropped", () => {
    const plan3 = plan({
      anomalies: [
        anomaly({ state: "narrowed to 48px", measuredAtWidth: 48 }),
        anomaly({ state: "widened to 300px", measuredAtWidth: 300 }),
      ],
      textStress: {
        anomalies: [anomaly({ state: "with long text", measuredAtWidth: 120 })],
      },
    });
    // Baseline plus two states: three broken states existed, so one is dropped.
    expect(plan3.rows[0].cells).toHaveLength(3);
    expect(plan3.footnote).toContain("1 further broken state");
  });

  it("shows the long-text state with the string that was measured", () => {
    // A shorter stand-in might not clip, and the picture would then contradict the
    // finding it exists to prove.
    const cell = plan({
      textStress: { anomalies: [anomaly({ state: "with long text" })] },
    }).rows[0].cells[1];
    // Keyed by the raw Figma property key, which is what setProperties wants.
    expect(cell.properties?.["Label#1:0"]).toContain("deliberately far longer");
    // No width: mixing a driven width with injected text confuses two variables.
    expect(cell.width).toBeUndefined();
  });

  it("stacks its cells vertically, since driven widths vary too much to sit side by side", () => {
    expect(plan({ anomalies: [anomaly()] }).cellDirection).toBe("VERTICAL");
  });

  it("always states that the block is not the verdict", () => {
    const built = plan({ anomalies: [anomaly()] });
    expect(built.footnote).toContain("status comes from the measurements");
    expect(built.footnote).toContain("Other variants");
    expect(built.subtitle).toContain("State=Default");
  });
});
