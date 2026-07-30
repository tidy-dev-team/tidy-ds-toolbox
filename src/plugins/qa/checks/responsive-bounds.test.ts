import { describe, it, expect } from "vitest";
import { checkResponsiveBounds } from "./responsive-bounds";
import type {
  ComponentSetSnapshot,
  NodeSnapshot,
  ResizeProbeSnapshot,
  VariantSnapshot,
} from "../snapshot";
import type { Anomaly } from "../resize/anomalies";

type Bounds = Pick<
  NodeSnapshot,
  "minWidth" | "maxWidth" | "minHeight" | "maxHeight"
>;

function root(
  id: string,
  boundsApplicable: boolean,
  bounds: Bounds = {},
): NodeSnapshot {
  return {
    id,
    name: `Variant ${id}`,
    type: "COMPONENT",
    visible: true,
    width: 100,
    height: 40,
    children: [],
    ...(boundsApplicable ? { boundsApplicable: true } : {}),
    ...bounds,
  };
}

function fixture(roots: NodeSnapshot[]): ComponentSetSnapshot {
  const variants: VariantSnapshot[] = roots.map((tree) => ({
    id: tree.id,
    name: tree.name,
    variantProperties: {},
    tree,
  }));
  return {
    id: "1:1",
    name: "Button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants,
  };
}

describe("checkResponsiveBounds (#7)", () => {
  it("warns, never fails, when no bound at all is set", () => {
    const result = checkResponsiveBounds(fixture([root("1", true)]));
    expect(result.status).toBe("warn");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("low");
  });

  it("passes when any single bound is set, since completeness is not required", () => {
    // Requiring all four would put a finding on nearly every component, which
    // is how a checklist row stops being read.
    for (const bound of [
      { minWidth: 120 },
      { maxWidth: 320 },
      { minHeight: 32 },
      { maxHeight: 80 },
    ]) {
      const result = checkResponsiveBounds(fixture([root("1", true, bound)]));
      expect(result.status).toBe("pass");
      expect(result.findings).toEqual([]);
    }
  });

  it("still names the unset bounds on a passing row", () => {
    const result = checkResponsiveBounds(
      fixture([root("1", true, { minWidth: 120 })]),
    );
    expect(result.status).toBe("pass");
    expect(result.note).toContain("maxWidth");
    expect(result.note).toContain("minHeight");
    expect(result.note).toContain("maxHeight");
    expect(result.note).not.toContain("minWidth,");
  });

  it("omits the note when every bound is set somewhere in the set", () => {
    const result = checkResponsiveBounds(
      fixture([
        root("1", true, { minWidth: 120, maxWidth: 320 }),
        root("2", true, { minHeight: 32, maxHeight: 80 }),
      ]),
    );
    expect(result.status).toBe("pass");
    expect(result.note).toBeUndefined();
  });

  it("collapses the whole set into one finding, carrying the count", () => {
    // Variants share their bound configuration, so per-variant findings would
    // repeat one fact once per variant.
    const result = checkResponsiveBounds(
      fixture([root("1", true), root("2", true), root("3", true)]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].count).toBe(3);
    expect(result.findings[0].message).toContain("3 of 3");
  });

  it("counts only the unbounded roots when the set is mixed", () => {
    const result = checkResponsiveBounds(
      fixture([root("1", true, { minWidth: 120 }), root("2", true)]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings[0].count).toBe(1);
    expect(result.findings[0].nodeId).toBe("2");
  });

  it("evaluates a root the collector marked applicable regardless of its own layout", () => {
    // Bounds are settable on an auto-layout frame's direct children too, so a
    // layoutMode "NONE" variant inside an auto-layout set must not be skipped.
    // The collector owns that judgement; the check must honour it.
    const nonAutoLayoutChildOfAutoLayoutSet: NodeSnapshot = {
      ...root("1", true),
      layoutMode: "NONE",
    };
    const result = checkResponsiveBounds(
      fixture([nonAutoLayoutChildOfAutoLayoutSet]),
    );
    expect(result.status).toBe("warn");
    expect(result.findings[0].count).toBe(1);
  });

  it("is not_applicable when no root can carry bounds", () => {
    // Warning here would ask for something the file cannot express.
    const result = checkResponsiveBounds(
      fixture([root("1", false), root("2", false)]),
    );
    expect(result.status).toBe("not_applicable");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("auto-layout");
  });

  it("ignores roots that cannot carry bounds rather than counting them unbounded", () => {
    const result = checkResponsiveBounds(
      fixture([root("1", true, { minWidth: 120 }), root("2", false)]),
    );
    expect(result.status).toBe("pass");
  });

  it("is not_applicable for a set with no variants at all", () => {
    expect(checkResponsiveBounds(fixture([])).status).toBe("not_applicable");
  });

  it("always leaves the resize test outstanding, on every outcome", () => {
    // Unlike #19's remainder this is unconditional: that a set cannot hold
    // bounds says nothing about whether it survives being resized.
    const cases = [
      fixture([root("1", true)]), // warn
      fixture([root("1", true, { minWidth: 120 })]), // pass
      fixture([root("1", false)]), // not_applicable
    ];
    for (const fx of cases) {
      expect(checkResponsiveBounds(fx).manualRemainder).toMatch(/[Rr]esize/);
    }
  });

  it("reports under the right check id and title", () => {
    const result = checkResponsiveBounds(fixture([root("1", true)]));
    expect(result.checkId).toBe("responsive-bounds");
    expect(result.title).toBe("Responsiveness (bounds + resize)");
  });
});

/**
 * The resize half (#111). Every case below drives the check through
 * `snapshot.resizeProbe`, which is a plain-JSON facet, so the measured behaviour
 * is fixture-tested exactly like everything else here.
 */
describe("checkResponsiveBounds, resize half (#111)", () => {
  const anomaly = (
    confidence: "verdict" | "candidate",
    detail = "something drifted.",
  ): Anomaly => ({
    kind: confidence === "verdict" ? "overflow" : "gap-grew",
    confidence,
    nodeId: "layer",
    nodeName: "Label",
    detail,
    measuredAtWidth: 300,
    state: "widened to 300px",
  });

  /** A set whose bounds half passes, so the resize half is what moves the row. */
  function withProbe(probe: ResizeProbeSnapshot): ComponentSetSnapshot {
    return {
      ...fixture([root("1", true, { minWidth: 120 })]),
      resizeProbe: probe,
    };
  }

  const measured = (anomalies: Anomaly[]): ResizeProbeSnapshot => ({
    variantId: "1",
    variantName: "Variant 1",
    baselineWidth: 120,
    states: ["narrowed to 48px", "widened to 300px"],
    anomalies,
  });

  it("fails the row on a verdict anomaly", () => {
    // Content clipped away or collapsed is wrong however it got there, so this is
    // the first thing on row 7 that can go red.
    const result = checkResponsiveBounds(
      withProbe(measured([anomaly("verdict")])),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].severity).toBe("high");
  });

  it("only warns on a candidate anomaly, and asks for confirmation", () => {
    // SPACE_BETWEEN is correct on a select or a list row; a wrong red there costs
    // more trust than a missed finding.
    const result = checkResponsiveBounds(
      withProbe(measured([anomaly("candidate")])),
    );
    expect(result.status).toBe("warn");
    expect(result.findings[0].severity).toBe("low");
    // The advisory lives on the row, once - not repeated into every finding, where
    // it was most of the payload on a set that produced eight of them.
    expect(result.findings[0].message).not.toContain(
      "Confirm each is intended",
    );
    expect(result.note).toContain("Confirm each is intended");
    // The text-clipping limitation note is present when measured.
    expect(result.note).toContain(
      "Text whose glyphs are already cropped by Figma",
    );
  });

  it("says the candidate advisory once, however many candidates there are", () => {
    const result = checkResponsiveBounds(
      withProbe(
        measured([
          anomaly("candidate", "gap one."),
          anomaly("candidate", "gap two."),
          anomaly("candidate", "gap three."),
        ]),
      ),
    );
    expect(result.findings).toHaveLength(3);
    expect(result.note?.match(/Confirm each is intended/g)).toHaveLength(1);
  });

  it("omits the candidate advisory when there is no candidate", () => {
    const result = checkResponsiveBounds(
      withProbe(measured([anomaly("verdict")])),
    );
    expect(result.note ?? "").not.toContain("Confirm each is intended");
  });

  it("carries the measured numbers and the state into the finding", () => {
    const result = checkResponsiveBounds(
      withProbe(
        measured([anomaly("candidate", "the gap went from 8px to 288px.")]),
      ),
    );
    expect(result.findings[0].message).toContain("widened to 300px");
    expect(result.findings[0].message).toContain("288px");
  });

  it("passes when the probe measured the component and found nothing", () => {
    const result = checkResponsiveBounds(withProbe(measured([])));
    expect(result.status).toBe("pass");
    expect(result.note).toContain("narrowed to 48px");
    expect(result.note).toContain("widened to 300px");
  });

  it("reaches a verdict even when the bounds half had nothing to say", () => {
    // Bounds n/a plus a clean measurement is a real result, and leaving the row
    // not_applicable would throw it away.
    const snapshot = {
      ...fixture([root("1", false)]),
      resizeProbe: measured([]),
    };
    expect(checkResponsiveBounds(snapshot).status).toBe("pass");
  });

  it("lets the resize half fail a row whose bounds half is not_applicable", () => {
    const snapshot = {
      ...fixture([root("1", false)]),
      resizeProbe: measured([anomaly("verdict")]),
    };
    expect(checkResponsiveBounds(snapshot).status).toBe("fail");
  });

  it("keeps a bounds warning when the resize half is clean", () => {
    // Escalation runs one way only: the resize half cannot lower a warn the
    // bounds half reached.
    const snapshot = {
      ...fixture([root("1", true)]),
      resizeProbe: measured([]),
    };
    expect(checkResponsiveBounds(snapshot).status).toBe("warn");
  });

  it("drops the whole-resize remainder once geometry was measured", () => {
    const result = checkResponsiveBounds(withProbe(measured([])));
    expect(result.manualRemainder).not.toContain(
      "Only min/max bounds are checked automatically",
    );
    // What genuinely remains is what geometry cannot see.
    expect(result.manualRemainder).toContain("distorts");
  });

  it("names the variants the probe did not measure", () => {
    const snapshot = {
      ...fixture([root("1", true, { minWidth: 120 }), root("2", true)]),
      resizeProbe: measured([]),
    };
    const result = checkResponsiveBounds(snapshot);
    expect(result.manualRemainder).toContain(
      "other 1 variant(s)",
    );
  });

  it("keeps owing the whole resize test when the probe skipped", () => {
    const result = checkResponsiveBounds(
      withProbe({ skipped: "the component hugs its content horizontally." }),
    );
    expect(result.manualRemainder).toContain(
      "Only min/max bounds are checked automatically",
    );
    expect(result.note).toContain("hugs its content");
  });

  it("refuses to pass on an unmoved component, and says why", () => {
    // Bounds Figma is enforcing and a component the probe could not drive are
    // indistinguishable from in here, and a clean measurement is worthless
    // either way. This is the one outcome where green would be misleading.
    const result = checkResponsiveBounds(
      withProbe({ ...measured([]), unmoved: true }),
    );
    // Not a pass: a green chip on a row titled "Responsiveness" would read as
    // though resize behaviour had been established, and it has not been. The bounds
    // half did pass, which is why this is amber rather than red.
    expect(result.status).toBe("warn");
    expect(result.note).toContain("could not be measured");
    expect(result.manualRemainder).toContain(
      "Only min/max bounds are checked automatically",
    );
  });

  it("leaves an unmoved component's other statuses alone", () => {
    // Only a `pass` is misleading. A warn already asks for attention, and
    // not_applicable states more honestly than an amber that neither half evaluated
    // anything.
    const unbounded = {
      ...fixture([root("1", true)]),
      resizeProbe: { ...measured([]), unmoved: true },
    };
    expect(checkResponsiveBounds(unbounded).status).toBe("warn");

    const cannotHoldBounds = {
      ...fixture([root("1", false)]),
      resizeProbe: { ...measured([]), unmoved: true },
    };
    expect(checkResponsiveBounds(cannotHoldBounds).status).toBe(
      "not_applicable",
    );
  });

  it("reports long-text anomalies alongside the width ones", () => {
    const result = checkResponsiveBounds(
      withProbe({
        ...measured([]),
        textStress: {
          anomalies: [anomaly("verdict", "the label is cut off.")],
        },
      }),
    );
    expect(result.status).toBe("fail");
    expect(result.findings[0].message).toContain("cut off");
  });

  it("says so when long text could not be tested", () => {
    const result = checkResponsiveBounds(
      withProbe({
        ...measured([]),
        textStress: { skipped: "the component defines no text properties." },
      }),
    );
    expect(result.note).toContain("no text properties");
    expect(result.status).toBe("pass");
  });

  it("behaves exactly as before when the facet was never collected", () => {
    // A filtered run that does not collect the probe must not change the row: the
    // facet mechanism is what keeps an unrequested probe inert.
    const result = checkResponsiveBounds(fixture([root("1", true)]));
    expect(result.status).toBe("warn");
    expect(result.manualRemainder).toContain(
      "Only min/max bounds are checked automatically",
    );
  });

  it("notes when declared minWidth was not tested because the narrowing floor kept the drive above it", () => {
    const probe: ResizeProbeSnapshot = {
      variantId: "1",
      variantName: "Variant 1",
      baselineWidth: 300,
      states: ["narrowed to 120px", "widened to 750px"],
      anomalies: [],
      bounds: { minWidth: 100 },
      // Narrowest driven width is 120, which is above minWidth of 100.
      requestedWidths: [300, 120, 750],
    };
    const result = checkResponsiveBounds(withProbe(probe));
    expect(result.note).toContain("minWidth of 100px was not tested");
    expect(result.note).toContain("120px");
  });

  it("notes when declared maxWidth was not tested because the ceiling kept the drive below it", () => {
    const probe: ResizeProbeSnapshot = {
      variantId: "1",
      variantName: "Variant 1",
      baselineWidth: 120,
      states: ["narrowed to 48px", "widened to 300px"],
      anomalies: [],
      bounds: { maxWidth: 400 },
      // Widest driven width is 300, which is below maxWidth of 400.
      requestedWidths: [120, 48, 300],
    };
    const result = checkResponsiveBounds(withProbe(probe));
    expect(result.note).toContain("maxWidth of 400px was not tested");
    expect(result.note).toContain("300px");
  });

  it("does not note untested minWidth when the drive actually went below it", () => {
    const probe: ResizeProbeSnapshot = {
      variantId: "1",
      variantName: "Variant 1",
      baselineWidth: 120,
      states: ["narrowed to 48px", "widened to 300px"],
      anomalies: [],
      bounds: { minWidth: 100 },
      // Narrowest is 48, which is below minWidth of 100 — bound was tested.
      requestedWidths: [120, 48, 300],
    };
    const result = checkResponsiveBounds(withProbe(probe));
    // The probe-level note about untested minWidth should not appear.
    expect(result.note ?? "").not.toContain("minWidth of 100px was not tested");
  });

  it("does not note untested maxWidth when the drive actually went above it", () => {
    const probe: ResizeProbeSnapshot = {
      variantId: "1",
      variantName: "Variant 1",
      baselineWidth: 120,
      states: ["narrowed to 48px", "widened to 300px"],
      anomalies: [],
      bounds: { maxWidth: 200 },
      // Widest is 300, which is above maxWidth of 200 — bound was tested.
      requestedWidths: [120, 48, 300],
    };
    const result = checkResponsiveBounds(withProbe(probe));
    // The probe-level note about untested maxWidth should not appear.
    expect(result.note ?? "").not.toContain("maxWidth of 200px was not tested");
  });
});

describe("checkResponsiveBounds, stretch pre-scan (#111)", () => {
  function spreader(id: string): NodeSnapshot {
    return {
      ...root(id, true, { minWidth: 120 }),
      layoutMode: "HORIZONTAL",
      primaryAxisAlignItems: "SPACE_BETWEEN",
      layoutSizingHorizontal: "FILL",
      children: [
        { ...root(`${id}-icon`, false), name: "Icon" },
        { ...root(`${id}-label`, false), name: "Label" },
      ],
    };
  }

  it("names an unmeasured spreader in the remainder without moving the row", () => {
    // A suspicion is not a chip: SPACE_BETWEEN is exactly right for a select or a
    // list row, and turning every one of those amber would make the row noise.
    const snapshot: ComponentSetSnapshot = {
      ...fixture([root("1", true, { minWidth: 120 }), spreader("2")]),
      resizeProbe: {
        variantId: "1",
        variantName: "Variant 1",
        baselineWidth: 120,
        states: ["widened to 300px"],
        anomalies: [],
      },
    };
    const result = checkResponsiveBounds(snapshot);
    expect(result.status).toBe("pass");
    expect(result.note).toContain("spread content apart when stretched");
    expect(result.note).toContain("Variant 2");
  });

  it("stays quiet about the variant the probe actually measured", () => {
    // The probe measured it, so either there is a real gap finding or there is
    // nothing to say - repeating the suspicion would double-report it.
    const snapshot: ComponentSetSnapshot = {
      ...fixture([spreader("1")]),
      resizeProbe: {
        variantId: "1",
        variantName: "Variant 1",
        baselineWidth: 120,
        states: ["widened to 300px"],
        anomalies: [],
      },
    };
    expect(checkResponsiveBounds(snapshot).note).not.toContain(
      "spread content apart",
    );
  });

  it("scans the whole set even with no probe at all", () => {
    expect(checkResponsiveBounds(fixture([spreader("1")])).note).toContain(
      "spread content apart when stretched",
    );
  });
});
