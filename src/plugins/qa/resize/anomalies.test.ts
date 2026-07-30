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

  it("does not mistake a drop shadow for clipped text", () => {
    // `absoluteRenderBounds` is *larger* than the bounding box whenever a node has
    // a drop shadow or an outside stroke. Reading that as "ink does not fit its
    // box" reds row 7 on every shadowed component in the file, at every width.
    const shadowed = (width: number): MeasuredNode =>
      node("root", box(0, 0, width, 40), {
        clipsContent: false,
        // Ink 6px proud of the box on every edge: a shadow, not a defect.
        renderBox: box(-6, -6, width + 12, 52),
        children: [
          node("label", box(16, 12, 64, 16), {
            type: "TEXT",
            renderBox: box(16, 14, 60, 12),
          }),
        ],
      });

    expect(
      detectAnomalies(
        measurement(shadowed(120), 120),
        measurement(shadowed(400), 400),
      ),
    ).toEqual([]);
  });

  it("does not report a text layer whose ink already overhung at baseline", () => {
    // Text can carry an effect too. What matters is whether the resize made it
    // worse, not that ink and box disagree.
    const shadowedText = (width: number): MeasuredNode =>
      node("root", box(0, 0, width, 40), {
        children: [
          node("label", box(16, 12, 64, 16), {
            type: "TEXT",
            renderBox: box(12, 8, 72, 24),
          }),
        ],
      });

    expect(
      kinds(
        detectAnomalies(
          measurement(shadowedText(120), 120),
          measurement(shadowedText(400), 400),
        ),
      ),
    ).not.toContain("text-clipped");
  });

  it("only ever calls text clipped, never a frame", () => {
    // A frame whose ink escapes its box is a shadow or a stroke; only a TEXT node
    // can have glyphs cut off, which is what this rule is for.
    const framey = (width: number): MeasuredNode =>
      node("root", box(0, 0, width, 40), {
        children: [
          node("shape", box(16, 12, 20, 16), {
            type: "RECTANGLE",
            renderBox: box(0, 0, width, 40),
          }),
        ],
      });

    expect(
      kinds(
        detectAnomalies(
          measurement(framey(120), 120),
          measurement(framey(60), 60),
        ),
      ),
    ).not.toContain("text-clipped");
  });

  it("will not call text cut off when nothing clips it", () => {
    // Ink leaving its box is not proof of clipping. With no clipping ancestor the
    // text is still visible, it just spills over its neighbours - so claiming "cut
    // off" at high severity would be confident about something that did not happen.
    const spilling = (width: number, ink: number): MeasuredNode =>
      node("root", box(0, 0, width, 40), {
        clipsContent: false,
        children: [
          node("label", box(16, 12, 28, 16), {
            type: "TEXT",
            renderBox: box(16, 14, ink, 12),
          }),
        ],
      });

    const anomalies = detectAnomalies(
      measurement(spilling(120, 20), 120),
      measurement(spilling(60, 90), 60),
    );
    expect(kinds(anomalies)).not.toContain("text-clipped");
    const overflow = find(anomalies, "text-overflows");
    expect(overflow.confidence).toBe("candidate");
    expect(overflow.detail).toContain("spills over");
  });

  it("reports a cropped shadow as a candidate, not as clipped text", () => {
    // A shadow cropped at an edge is cosmetic and sometimes deliberate, so it is
    // stated rather than ruled on - and it is never a text finding.
    const shadowGrew = (overhang: number): MeasuredNode =>
      node("root", box(0, 0, 120, 40), {
        clipsContent: true,
        children: [
          node("chip", box(0, 0, 120, 40), {
            renderBox: box(
              -overhang,
              -overhang,
              120 + overhang * 2,
              40 + overhang * 2,
            ),
          }),
        ],
      });

    const anomalies = detectAnomalies(
      measurement(shadowGrew(0), 120),
      measurement(shadowGrew(10), 400),
    );
    const cropped = find(anomalies, "effect-clipped");
    expect(cropped.confidence).toBe("candidate");
    expect(kinds(anomalies)).not.toContain("text-clipped");
  });

  it("finds the clipping ancestor above the immediate parent", () => {
    // The thing that hides the text is often a card two levels up, not its own
    // parent, so the clipper has to be carried down the whole walk.
    const nested = (ink: number): MeasuredNode =>
      node("card", box(0, 0, 60, 40), {
        clipsContent: true,
        children: [
          node("row", box(0, 0, 60, 40), {
            clipsContent: false,
            children: [
              node("label", box(16, 12, 28, 16), {
                type: "TEXT",
                renderBox: box(16, 14, ink, 12),
              }),
            ],
          }),
        ],
      });

    const anomalies = detectAnomalies(
      measurement(nested(20), 120),
      measurement(nested(200), 60),
    );
    expect(find(anomalies, "text-clipped").confidence).toBe("verdict");
  });

  it("reports overflow when content escapes a non-immediate clipping ancestor through a non-clipping parent", () => {
    // Grandparent clips at 60x40, parent does not clip and fits inside the
    // grandparent, but child extends outside the grandparent's box.
    // The overflow of the clipping ancestor must still be reported even though
    // the immediate parent does not clip.
    const baseline = node("grandparent", box(0, 0, 120, 60), {
      clipsContent: true,
      children: [
        node("parent", box(16, 8, 40, 30), {
          clipsContent: false,
          children: [node("child", box(0, 0, 20, 20))],
        }),
      ],
    });
    const narrowed = node("grandparent", box(0, 0, 60, 40), {
      clipsContent: true,
      children: [
        node("parent", box(8, 4, 40, 30), {
          clipsContent: false,
          children: [
            // Child extends outside grandparent's box but fits inside its
            // non-clipping parent.
            node("child", box(30, 5, 50, 30)),
          ],
        }),
      ],
    });

    const anomalies = detectAnomalies(
      measurement(baseline, 120),
      measurement(narrowed, 60),
    );
    const overflow = find(anomalies, "overflow");
    expect(overflow.confidence).toBe("verdict");
    expect(overflow.nodeId).toBe("child");
    expect(overflow.detail).toContain("grandparent");
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

  it("does not call it a grown gap when the siblings overlap", () => {
    // Found on a real dropdown. Two nodes stacked at the same x give
    // `gap = -width`, so narrowing shrinks the width and the gap "grows" from
    // -280px to -204px - an artifact of the node getting narrower, not a gap
    // opening up. It fired on every finding row 7 produced.
    const stacked = (width: number): MeasuredNode =>
      node("root", box(0, 0, 400, 40), {
        children: [
          node("item-a", box(16, 12, width, 16)),
          node("item-b", box(16, 12, width, 16)),
        ],
      });

    expect(
      kinds(
        detectAnomalies(
          measurement(stacked(280), 700),
          measurement(stacked(204), 204),
        ),
      ),
    ).not.toContain("gap-grew");
  });

  it("still reports a real gap opening up from zero", () => {
    // The boundary case worth keeping: touching siblings that come apart is a
    // genuine gap, and must not be lost to the overlap guard.
    const before = node("root", box(0, 0, 120, 40), {
      children: [
        node("a", box(16, 12, 32, 16)),
        node("b", box(48, 12, 32, 16)),
      ],
    });
    const after = node("root", box(0, 0, 400, 40), {
      children: [
        node("a", box(16, 12, 32, 16)),
        node("b", box(300, 12, 32, 16)),
      ],
    });

    expect(
      kinds(detectAnomalies(measurement(before, 120), measurement(after, 400))),
    ).toContain("gap-grew");
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
    // A wrapping label unwraps when given room, so the component gets shorter.
    // This is correct and near-universal, so reporting it would bury the signal.
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
