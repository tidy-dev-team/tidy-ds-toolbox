import { describe, it, expect } from "vitest";
import {
  detectAnomalies,
  detectBoundAnomalies,
  type Anomaly,
} from "./anomalies";
import type { MeasuredBox, MeasuredNode, Measurement } from "./measured";

function box(x: number, y: number, width: number, height: number): MeasuredBox {
  return { x, y, width, height };
}

function node(
  id: string,
  b: MeasuredBox,
  extra: Partial<MeasuredNode> = {},
): MeasuredNode {
  return {
    id,
    name: id,
    type: "FRAME",
    visible: true,
    box: b,
    children: [],
    ...extra,
  };
}

function measurement(
  root: MeasuredNode,
  requestedWidth: number,
  label = "state",
): Measurement {
  return { root, requestedWidth, label };
}

/** A healthy 120px button: 16px padding, 8px gap, icon then label. */
function healthyBaseline(): MeasuredNode {
  return node("root", box(0, 0, 120, 40), {
    clipsContent: true,
    children: [
      node("icon", box(16, 12, 16, 16)),
      node("label", box(40, 12, 64, 16), {
        type: "TEXT",
        renderBox: box(40, 14, 60, 12),
      }),
    ],
  });
}

function kinds(anomalies: readonly Anomaly[]): string[] {
  return anomalies.map((a) => a.kind);
}

function find(anomalies: readonly Anomaly[], kind: string): Anomaly {
  const found = anomalies.find((a) => a.kind === kind);
  if (!found) throw new Error(`no ${kind} anomaly in ${kinds(anomalies)}`);
  return found;
}

describe("detectAnomalies", () => {
  it("reports nothing when widening only moves the content block", () => {
    // The correct FILL outcome: padding still 16, gap still 8, height unchanged,
    // content re-positioned. Nothing proportional happens, and a rule that
    // expected proportional spacing would fail every correct button in the file.
    const widened = node("root", box(0, 0, 400, 40), {
      clipsContent: true,
      children: [
        node("icon", box(16, 12, 16, 16)),
        node("label", box(40, 12, 64, 16), {
          type: "TEXT",
          renderBox: box(40, 14, 60, 12),
        }),
      ],
    });

    expect(
      detectAnomalies(
        measurement(healthyBaseline(), 120),
        measurement(widened, 400),
      ),
    ).toEqual([]);
  });

  it("measures a gap that actually grew, as a candidate not a verdict", () => {
    // The canonical SPACE_BETWEEN + FILL defect: the icon flies left, the label
    // right, and the button has a 280px hole in the middle. Correct for a
    // dropdown or a list row, so the geometry states the fact and does not rule.
    const widened = node("root", box(0, 0, 400, 40), {
      clipsContent: true,
      children: [
        node("icon", box(16, 12, 16, 16)),
        node("label", box(320, 12, 64, 16), {
          type: "TEXT",
          renderBox: box(320, 14, 60, 12),
        }),
      ],
    });

    const anomalies = detectAnomalies(
      measurement(healthyBaseline(), 120),
      measurement(widened, 400),
    );

    const gap = find(anomalies, "gap-grew");
    expect(gap.confidence).toBe("candidate");
    // The whole point of measuring: "suspicious combination" becomes a number
    // that can go on a row without hedging.
    expect(gap.detail).toContain("8");
    expect(gap.detail).toContain("288");
    expect(gap.nodeId).toBe("root");
  });

  it("reports content escaping a clipping frame as a verdict", () => {
    const widened = node("root", box(0, 0, 60, 40), {
      clipsContent: true,
      children: [node("label", box(16, 12, 200, 16), { type: "TEXT" })],
    });

    const anomalies = detectAnomalies(
      measurement(healthyBaseline(), 120),
      measurement(widened, 60),
    );

    const overflow = find(anomalies, "overflow");
    expect(overflow.confidence).toBe("verdict");
    expect(overflow.nodeId).toBe("label");
  });

  it("does not call it overflow when the parent does not clip", () => {
    // Spilling out of a non-clipping frame is routine and often deliberate - a
    // badge hanging off a corner. Only invisible content is a defect.
    const widened = node("root", box(0, 0, 60, 40), {
      clipsContent: false,
      children: [node("badge", box(50, 12, 40, 16))],
    });

    const baseline = node("root", box(0, 0, 120, 40), {
      clipsContent: false,
      children: [node("badge", box(50, 12, 40, 16))],
    });

    expect(
      kinds(
        detectAnomalies(measurement(baseline, 120), measurement(widened, 60)),
      ),
    ).not.toContain("overflow");
  });

  it("reports text whose ink no longer fits its box as clipped", () => {
    // The layout box stays put when text is cut off; the render bounds are what
    // shrink, so clipping is only visible by comparing the two.
    const widened = node("root", box(0, 0, 60, 40), {
      clipsContent: true,
      children: [
        node("label", box(16, 12, 28, 16), {
          type: "TEXT",
          // Ink wider than the box it sits in: the tail is cut off.
          renderBox: box(16, 14, 60, 12),
        }),
      ],
    });

    const anomalies = detectAnomalies(
      measurement(healthyBaseline(), 120),
      measurement(widened, 60),
    );

    const clipped = find(anomalies, "text-clipped");
    expect(clipped.confidence).toBe("verdict");
    expect(clipped.nodeId).toBe("label");
  });

  it("reports a node that collapsed to nothing", () => {
    const widened = node("root", box(0, 0, 400, 40), {
      clipsContent: true,
      children: [
        node("icon", box(16, 12, 0, 16)),
        node("label", box(40, 12, 64, 16), { type: "TEXT" }),
      ],
    });

    const anomalies = detectAnomalies(
      measurement(healthyBaseline(), 120),
      measurement(widened, 400),
    );

    const collapse = find(anomalies, "collapse");
    expect(collapse.confidence).toBe("verdict");
    expect(collapse.nodeId).toBe("icon");
  });

  it("does not report a node that was already collapsed at baseline", () => {
    // Nothing drifted: it was zero-sized before the resize too, so the resize
    // did not break it and this row is not the place to say so.
    const baseline = node("root", box(0, 0, 120, 40), {
      clipsContent: true,
      children: [node("icon", box(16, 12, 0, 16))],
    });
    const widened = node("root", box(0, 0, 400, 40), {
      clipsContent: true,
      children: [node("icon", box(16, 12, 0, 16))],
    });

    expect(
      kinds(
        detectAnomalies(measurement(baseline, 120), measurement(widened, 400)),
      ),
    ).not.toContain("collapse");
  });

  it("reports siblings that newly overlap, as a candidate", () => {
    // An intentional avatar stack overlaps by design, so this needs design
    // intent to rule on - it is stated, not judged.
    const widened = node("root", box(0, 0, 60, 40), {
      clipsContent: false,
      children: [
        node("icon", box(16, 12, 30, 16)),
        node("label", box(30, 12, 24, 16), { type: "TEXT" }),
      ],
    });

    const anomalies = detectAnomalies(
      measurement(healthyBaseline(), 120),
      measurement(widened, 60),
    );

    const overlap = find(anomalies, "overlap");
    expect(overlap.confidence).toBe("candidate");
  });

  it("ignores overlap that was already there at baseline", () => {
    const overlapping = (width: number): MeasuredNode =>
      node("root", box(0, 0, width, 40), {
        children: [
          node("a", box(16, 12, 30, 16)),
          node("b", box(30, 12, 24, 16)),
        ],
      });

    expect(
      kinds(
        detectAnomalies(
          measurement(overlapping(120), 120),
          measurement(overlapping(400), 400),
        ),
      ),
    ).not.toContain("overlap");
  });

  it("reports a root that grew taller when only its width was driven", () => {
    const widened = node("root", box(0, 0, 400, 96), {
      clipsContent: true,
      children: [
        node("icon", box(16, 12, 16, 16)),
        node("label", box(40, 12, 64, 16), { type: "TEXT" }),
      ],
    });

    const anomalies = detectAnomalies(
      measurement(healthyBaseline(), 120),
      measurement(widened, 400),
    );

    const grew = find(anomalies, "height-changed");
    // Text that unwraps as it widens legitimately changes height, so this is
    // stated rather than ruled on.
    expect(grew.confidence).toBe("candidate");
    expect(grew.detail).toContain("40");
    expect(grew.detail).toContain("96");
  });

  it("does not report height shrinking as the component is widened", () => {
    // A wrapping label unwraps when given room; the component getting shorter is
    // the auto-layout working, not drifting.
    const widened = node("root", box(0, 0, 400, 40), {
      clipsContent: true,
      children: [node("label", box(16, 12, 64, 16), { type: "TEXT" })],
    });
    const baseline = node("root", box(0, 0, 120, 96), {
      clipsContent: true,
      children: [node("label", box(16, 12, 64, 16), { type: "TEXT" })],
    });

    expect(
      kinds(
        detectAnomalies(measurement(baseline, 120), measurement(widened, 400)),
      ),
    ).not.toContain("height-changed");
  });

  it("tolerates sub-pixel drift everywhere", () => {
    const widened = node("root", box(0, 0, 400, 40.2), {
      clipsContent: true,
      children: [
        node("icon", box(16.1, 12, 16, 16)),
        node("label", box(40.3, 12, 64, 16), {
          type: "TEXT",
          renderBox: box(40.3, 14, 60.2, 12),
        }),
      ],
    });

    expect(
      detectAnomalies(
        measurement(healthyBaseline(), 120),
        measurement(widened, 400),
      ),
    ).toEqual([]);
  });

  it("skips hidden nodes entirely", () => {
    // A hidden layer's box is meaningless - Figma leaves it where it was - and
    // judging it would put findings on states nobody can see.
    const widened = node("root", box(0, 0, 60, 40), {
      clipsContent: true,
      children: [
        node("ghost", box(16, 12, 400, 16), { visible: false }),
        node("label", box(16, 12, 28, 16), { type: "TEXT" }),
      ],
    });
    const baseline = node("root", box(0, 0, 120, 40), {
      clipsContent: true,
      children: [
        node("ghost", box(16, 12, 400, 16), { visible: false }),
        node("label", box(16, 12, 28, 16), { type: "TEXT" }),
      ],
    });

    expect(
      detectAnomalies(measurement(baseline, 120), measurement(widened, 60)),
    ).toEqual([]);
  });

  it("carries the width it measured at onto every anomaly", () => {
    const widened = node("root", box(0, 0, 400, 40), {
      clipsContent: true,
      children: [
        node("icon", box(16, 12, 0, 16)),
        node("label", box(40, 12, 64, 16), { type: "TEXT" }),
      ],
    });

    const anomalies = detectAnomalies(
      measurement(healthyBaseline(), 120),
      measurement(widened, 400, "widened to 400px"),
    );

    expect(anomalies.every((a) => a.measuredAtWidth === 400)).toBe(true);
    expect(anomalies.every((a) => a.state === "widened to 400px")).toBe(true);
  });
});

describe("detectBoundAnomalies", () => {
  const at = (width: number): Measurement =>
    measurement(node("root", box(0, 0, width, 40)), width, `${width}px`);

  it("reports a maxWidth the component grew straight past", () => {
    const anomalies = detectBoundAnomalies(at(400), { maxWidth: 300 });
    expect(anomalies.map((a) => a.kind)).toEqual(["bound-ignored"]);
    expect(anomalies[0].confidence).toBe("verdict");
    expect(anomalies[0].detail).toContain("300");
    expect(anomalies[0].detail).toContain("400");
  });

  it("reports nothing when the bound held", () => {
    // Driven to 400 but it stopped at 300: the bound working, which is the whole
    // thing `responsive-bounds` could only ever note the existence of.
    const stopped = measurement(node("root", box(0, 0, 300, 40)), 400, "400px");
    expect(detectBoundAnomalies(stopped, { maxWidth: 300 })).toEqual([]);
  });

  it("says nothing when the probe never drove past the bound", () => {
    // A component sitting comfortably inside its maximum is no evidence either
    // way, and claiming otherwise would be a pass nobody earned.
    expect(detectBoundAnomalies(at(200), { maxWidth: 300 })).toEqual([]);
  });

  it("reports a minWidth the component shrank straight past", () => {
    const anomalies = detectBoundAnomalies(at(40), { minWidth: 100 });
    expect(anomalies.map((a) => a.kind)).toEqual(["bound-ignored"]);
    expect(anomalies[0].detail).toContain("100");
  });

  it("reports nothing when no bounds are declared", () => {
    expect(detectBoundAnomalies(at(400), {})).toEqual([]);
  });
});
