import { describe, expect, it } from "vitest";
import {
  MAX_SAMPLES_PER_CHECKLIST,
  MAX_SAMPLES_PER_ROW,
  planChecklistSamples,
  type PlannableRow,
} from "./finding-samples";
import type { GroupedFinding } from "../grouped-findings";
import type { ComponentSetSnapshot, VariantSnapshot } from "../snapshot";
import type { ChecklistItem, SeverityLevel } from "../types";

function variant(
  id: string,
  variantProperties: Record<string, string>,
  name = "Variant",
): VariantSnapshot {
  return {
    id,
    name,
    variantProperties,
    tree: {
      id: `${id}:root`,
      name,
      type: "COMPONENT",
      visible: true,
      width: 100,
      height: 40,
      children: [],
    },
  };
}

function snapshot(variants: VariantSnapshot[]): ComponentSetSnapshot {
  return {
    id: "1:1",
    name: "button",
    type: "COMPONENT_SET",
    description: "",
    propertyNames: [],
    properties: [],
    variants,
  };
}

function group(overrides: Partial<GroupedFinding> = {}): GroupedFinding {
  return {
    message: `"label" has no target in 18 of 108 variants.`,
    severity: "medium",
    count: 18,
    ...overrides,
  };
}

/** A row backed by the one check flagged as showing visible defects. */
function row(
  groups: GroupedFinding[],
  overrides: Partial<ChecklistItem> = {},
): PlannableRow {
  return {
    item: {
      n: 3,
      title: "Check All the Props",
      blurb: "Every property combination renders correctly across the set.",
      tier: 1,
      checkId: "variant-property-bindings",
      automated: true,
      status: "warn",
      findings: [],
      ...overrides,
    },
    groups,
  };
}

const LOADING = variant("2:1", {
  size: "s",
  type: "outlined",
  state: "loading",
});
const IDLE = variant("2:2", { size: "s", type: "outlined", state: "idle" });

describe("planChecklistSamples", () => {
  it("plans nothing for no rows", () => {
    expect(planChecklistSamples([], snapshot([LOADING]))).toEqual({
      rows: [],
      total: 0,
    });
  });

  it("plans a sample for a flagged check, captioned with variant and coverage", () => {
    const plan = planChecklistSamples(
      [row([group({ affectedVariantIds: ["2:1"], affectedVariantCount: 18 })])],
      snapshot([LOADING, IDLE]),
    );

    expect(plan.total).toBe(1);
    expect(plan.rows).toEqual([
      {
        n: 3,
        samples: [
          {
            groupIndex: 0,
            variantId: "2:1",
            caption:
              "size=s, type=outlined, state=loading - 1 of 18 affected variants",
          },
        ],
      },
    ]);
  });

  it("keeps the sample on the index of the line it belongs to", () => {
    const plan = planChecklistSamples(
      [
        row([
          group({ message: "first, no variants" }),
          group({
            message: "second, has variants",
            affectedVariantIds: ["2:2"],
            affectedVariantCount: 4,
          }),
        ]),
      ],
      snapshot([LOADING, IDLE]),
    );

    expect(plan.rows[0].samples).toHaveLength(1);
    expect(plan.rows[0].samples[0].groupIndex).toBe(1);
  });

  describe("the denominator", () => {
    // The whole reason affectedVariantCount exists apart from the id list: the
    // ids are capped, so reading the denominator off them would report the cap
    // and shrink the defect as it grows.
    it("prints the uncapped count, not the length of the capped id list", () => {
      const plan = planChecklistSamples(
        [
          row([
            group({
              affectedVariantIds: ["2:1", "2:2"],
              affectedVariantCount: 57,
            }),
          ]),
        ],
        snapshot([LOADING, IDLE]),
      );
      expect(plan.rows[0].samples[0].caption).toContain("1 of 57");
    });

    it("omits the fraction when only one variant is affected", () => {
      const plan = planChecklistSamples(
        [
          row([
            group({ affectedVariantIds: ["2:1"], affectedVariantCount: 1 }),
          ]),
        ],
        snapshot([LOADING]),
      );
      expect(plan.rows[0].samples[0].caption).toBe(
        "size=s, type=outlined, state=loading",
      );
    });

    it("omits the fraction when the count is missing entirely", () => {
      const plan = planChecklistSamples(
        [row([group({ affectedVariantIds: ["2:1"] })])],
        snapshot([LOADING]),
      );
      expect(plan.rows[0].samples[0].caption).not.toContain(" of ");
    });
  });

  describe("what earns no sample", () => {
    it("skips a check that is not flagged as showing visible defects", () => {
      const plan = planChecklistSamples(
        [
          row(
            [group({ affectedVariantIds: ["2:1"], affectedVariantCount: 18 })],
            { checkId: "grid-4px" },
          ),
        ],
        snapshot([LOADING]),
      );
      expect(plan).toEqual({ rows: [], total: 0 });
    });

    it("skips a row with no checkId at all", () => {
      const plan = planChecklistSamples(
        [
          row(
            [group({ affectedVariantIds: ["2:1"], affectedVariantCount: 18 })],
            { checkId: undefined, automated: false, status: "manual" },
          ),
        ],
        snapshot([LOADING]),
      );
      expect(plan).toEqual({ rows: [], total: 0 });
    });

    // Only fail and warn carry findings, so this is belt-and-braces - but it is
    // the rule design stated, and pinning it stops a future status that somehow
    // carries findings from quietly drawing pictures.
    it.each(["pass", "not_applicable", "manual", "not_run"] as const)(
      "skips a row with status %s",
      (status) => {
        const plan = planChecklistSamples(
          [
            row(
              [
                group({
                  affectedVariantIds: ["2:1"],
                  affectedVariantCount: 18,
                }),
              ],
              { status },
            ),
          ],
          snapshot([LOADING]),
        );
        expect(plan).toEqual({ rows: [], total: 0 });
      },
    );

    it("skips a finding that declared no affected variants", () => {
      const plan = planChecklistSamples([row([group()])], snapshot([LOADING]));
      expect(plan).toEqual({ rows: [], total: 0 });
    });

    it("skips a finding whose declared variant is not in the snapshot", () => {
      // A set that changed under the run, or an id from somewhere else. Drawing
      // nothing beats drawing a caption for a variant we cannot name.
      const plan = planChecklistSamples(
        [
          row([
            group({ affectedVariantIds: ["9:404"], affectedVariantCount: 3 }),
          ]),
        ],
        snapshot([LOADING]),
      );
      expect(plan).toEqual({ rows: [], total: 0 });
    });

    it("omits a row entirely when none of its findings earn a sample", () => {
      const plan = planChecklistSamples(
        [row([group(), group()])],
        snapshot([LOADING]),
      );
      expect(plan.rows).toEqual([]);
    });
  });

  it("falls back to the node name for a variant with no properties", () => {
    const standalone = variant("3:1", {}, "Badge");
    const plan = planChecklistSamples(
      [row([group({ affectedVariantIds: ["3:1"], affectedVariantCount: 2 })])],
      snapshot([standalone]),
    );
    expect(plan.rows[0].samples[0].caption).toBe(
      "Badge - 1 of 2 affected variants",
    );
  });

  it("totals samples across rows", () => {
    const plan = planChecklistSamples(
      [
        row([group({ affectedVariantIds: ["2:1"], affectedVariantCount: 18 })]),
        row([group({ affectedVariantIds: ["2:2"], affectedVariantCount: 4 })], {
          n: 16,
          status: "fail",
        }),
      ],
      snapshot([LOADING, IDLE]),
    );
    expect(plan.total).toBe(2);
    expect(plan.rows.map((r) => r.n)).toEqual([3, 16]);
  });

  // Found by rendering the real `button` and looking at it, having passed every
  // test above. Three findings - missing `label`, missing `icon L`, missing
  // `icon R` - all had no target in the same 18 loading variants, so all three
  // picked the same variant and the row drew three identical pictures with three
  // identical captions.
  describe("one picture per variant, per row", () => {
    it("draws a variant once even when several findings point at it", () => {
      const plan = planChecklistSamples(
        [
          row([
            group({
              message: `"label" has no target`,
              affectedVariantIds: ["2:1"],
              affectedVariantCount: 18,
            }),
            group({
              message: `"icon L" has no target`,
              affectedVariantIds: ["2:1"],
              affectedVariantCount: 18,
            }),
            group({
              message: `"icon R" has no target`,
              affectedVariantIds: ["2:1"],
              affectedVariantCount: 18,
            }),
          ]),
        ],
        snapshot([LOADING]),
      );

      expect(plan.total).toBe(1);
      expect(plan.rows[0].samples).toHaveLength(1);
      expect(plan.rows[0].samples[0].groupIndex).toBe(0);
    });

    // The repeats were never candidates, so the row is showing everything it had
    // and must not claim to be hiding anything.
    it("says nothing about coverage when only repeats were dropped", () => {
      const plan = planChecklistSamples(
        [
          row([
            group({ message: "a", affectedVariantIds: ["2:1"] }),
            group({ message: "b", affectedVariantIds: ["2:1"] }),
          ]),
        ],
        snapshot([LOADING]),
      );
      expect(plan.rows[0].coverageNotice).toBeUndefined();
    });

    it("still draws both when two findings point at different variants", () => {
      const plan = planChecklistSamples(
        [
          row([
            group({ message: "a", affectedVariantIds: ["2:1"] }),
            group({ message: "b", affectedVariantIds: ["2:2"] }),
          ]),
        ],
        snapshot([LOADING, IDLE]),
      );
      expect(plan.rows[0].samples.map((s) => s.variantId)).toEqual([
        "2:1",
        "2:2",
      ]);
    });

    // The correction to the first version of this dedupe, found on `button`: keyed
    // on the variant alone it dropped every Light-mode contrast finding, because
    // those pairs fail on the same variants as their Dark counterparts. One variant
    // in two modes is two different images, each proving its own finding.
    it("draws the same variant twice when the modes differ", () => {
      const plan = planChecklistSamples(
        [
          row(
            [
              group({
                message: "pair fails in Dark",
                affectedVariantIds: ["2:1"],
                affectedVariantCount: 6,
                modeId: "m:dark",
                modeName: "Dark",
              }),
              group({
                message: "pair fails in Light",
                affectedVariantIds: ["2:1"],
                affectedVariantCount: 6,
                modeId: "m:light",
                modeName: "Light",
              }),
            ],
            { n: 16, checkId: "high-contrast", status: "fail" },
          ),
        ],
        snapshot([LOADING]),
      );

      expect(plan.rows[0].samples).toHaveLength(2);
      expect(plan.rows[0].samples.map((s) => s.pinnedModeId)).toEqual([
        "m:dark",
        "m:light",
      ]);
    });

    it("still collapses the same variant in the same mode", () => {
      const contrast = (message: string) =>
        group({
          message,
          affectedVariantIds: ["2:1"],
          affectedVariantCount: 6,
          modeId: "m:dark",
          modeName: "Dark",
        });
      const plan = planChecklistSamples(
        [
          row([contrast("pair A"), contrast("pair B")], {
            n: 16,
            checkId: "high-contrast",
            status: "fail",
          }),
        ],
        snapshot([LOADING]),
      );
      expect(plan.rows[0].samples).toHaveLength(1);
    });

    // Deliberately per row, not per checklist: the same variant on two rows is
    // illustrating two different defects, and each row owns its own evidence.
    it("draws the same variant again on a different row", () => {
      const plan = planChecklistSamples(
        [
          row([group({ affectedVariantIds: ["2:1"] })], { n: 3 }),
          row([group({ affectedVariantIds: ["2:1"] })], {
            n: 16,
            status: "fail",
          }),
        ],
        snapshot([LOADING]),
      );
      expect(plan.total).toBe(2);
      expect(plan.rows.map((r) => r.n)).toEqual([3, 16]);
    });
  });

  describe("the pinned mode (#173)", () => {
    const contrast = (overrides: Partial<GroupedFinding> = {}) =>
      row(
        [
          group({
            severity: "high",
            affectedVariantIds: ["2:1"],
            affectedVariantCount: 6,
            ...overrides,
          }),
        ],
        { n: 16, checkId: "high-contrast", status: "fail" },
      );

    it("pins the mode and names it in the caption", () => {
      const plan = planChecklistSamples(
        [contrast({ modeId: "m:1", modeName: "DNA" })],
        snapshot([LOADING]),
      );
      const sample = plan.rows[0].samples[0];
      expect(sample.pinnedModeId).toBe("m:1");
      expect(sample.pinnedModeName).toBe("DNA");
      expect(sample.caption).toBe(
        "size=s, type=outlined, state=loading - mode DNA - 1 of 6 affected variants",
      );
    });

    it("pins nothing for a finding that is not about a mode", () => {
      const plan = planChecklistSamples([contrast()], snapshot([LOADING]));
      const sample = plan.rows[0].samples[0];
      expect(sample.pinnedModeId).toBeUndefined();
      expect(sample.caption).not.toContain("mode");
    });

    // Both fields or neither. A caption that names a mode the stage did not pin,
    // or a pin the caption does not mention, is the failure this feature exists to
    // avoid - the picture and the words have to agree.
    it("refuses a half-declared mode", () => {
      const idOnly = planChecklistSamples(
        [contrast({ modeId: "m:1" })],
        snapshot([LOADING]),
      );
      expect(idOnly.rows[0].samples[0].pinnedModeId).toBeUndefined();
      expect(idOnly.rows[0].samples[0].caption).not.toContain("mode");

      const nameOnly = planChecklistSamples(
        [contrast({ modeName: "DNA" })],
        snapshot([LOADING]),
      );
      expect(nameOnly.rows[0].samples[0].pinnedModeId).toBeUndefined();
      expect(nameOnly.rows[0].samples[0].caption).not.toContain("mode");
    });

    // `evaluatedModes` falls back to a single anonymous mode for a set painted in
    // literal hex, and pinning "" would be pinning nothing while saying otherwise.
    it("treats an empty mode id as no mode", () => {
      const plan = planChecklistSamples(
        [contrast({ modeId: "", modeName: "" })],
        snapshot([LOADING]),
      );
      expect(plan.rows[0].samples[0].pinnedModeId).toBeUndefined();
    });
  });

  describe("the bounds (#172)", () => {
    /** n findings, each naming its own variant, all in one row. */
    function manyGroups(n: number, severity: SeverityLevel = "medium") {
      return Array.from({ length: n }, (_, i) =>
        group({
          message: `defect ${i}`,
          severity,
          affectedVariantIds: [`v:${i}`],
          affectedVariantCount: 3,
        }),
      );
    }

    function manyVariants(n: number): VariantSnapshot[] {
      return Array.from({ length: n }, (_, i) =>
        variant(`v:${i}`, { state: `s${i}` }),
      );
    }

    it("draws every sample and says nothing when neither bound bites", () => {
      const plan = planChecklistSamples(
        [row(manyGroups(MAX_SAMPLES_PER_ROW))],
        snapshot(manyVariants(MAX_SAMPLES_PER_ROW)),
      );
      expect(plan.total).toBe(MAX_SAMPLES_PER_ROW);
      expect(plan.rows[0].coverageNotice).toBeUndefined();
      expect(plan.droppedNotice).toBeUndefined();
    });

    it("draws exactly the checklist budget and says nothing at the boundary", () => {
      // Two rows of three: exactly six candidates against a six-sample budget.
      const plan = planChecklistSamples(
        [
          row(manyGroups(MAX_SAMPLES_PER_ROW), { n: 3 }),
          row(manyGroups(MAX_SAMPLES_PER_ROW), { n: 16, status: "fail" }),
        ],
        snapshot(manyVariants(MAX_SAMPLES_PER_ROW)),
      );
      expect(plan.total).toBe(MAX_SAMPLES_PER_CHECKLIST);
      expect(plan.droppedNotice).toBeUndefined();
      expect(plan.rows.every((r) => r.coverageNotice === undefined)).toBe(true);
    });

    it("caps a row and says how many of how many it is showing", () => {
      const plan = planChecklistSamples(
        [row(manyGroups(MAX_SAMPLES_PER_ROW + 2))],
        snapshot(manyVariants(MAX_SAMPLES_PER_ROW + 2)),
      );
      expect(plan.rows[0].samples).toHaveLength(MAX_SAMPLES_PER_ROW);
      expect(plan.rows[0].coverageNotice).toBe(
        "Showing 3 of 5 variant samples for this row.",
      );
      expect(plan.total).toBe(MAX_SAMPLES_PER_ROW);
    });

    /**
     * Enough critical candidates elsewhere to consume the whole checklist budget,
     * so the row under test is guaranteed to lose to them.
     *
     * Three rows of three, because the per-row bound caps each at three: two rows
     * would leave exactly the budget and drop nothing.
     */
    const budgetEaters = () =>
      [16, 19, 5].map((n) =>
        row(manyGroups(MAX_SAMPLES_PER_ROW, "critical"), { n, status: "fail" }),
      );

    it("singularises the count phrase", () => {
      const plan = planChecklistSamples(
        [...budgetEaters(), row(manyGroups(1, "low"), { n: 3 })],
        snapshot(manyVariants(MAX_SAMPLES_PER_ROW)),
      );
      expect(plan.rows.find((r) => r.n === 3)?.coverageNotice).toBe(
        "Showing 0 of 1 variant sample for this row.",
      );
    });

    it("caps the whole checklist and names that cause once, in the header", () => {
      // Four rows of three: twelve candidates against a six-sample budget.
      const rows = [3, 16, 5, 9].map((n) =>
        row(manyGroups(MAX_SAMPLES_PER_ROW), { n, status: "fail" }),
      );
      const plan = planChecklistSamples(
        rows,
        snapshot(manyVariants(MAX_SAMPLES_PER_ROW)),
      );

      expect(plan.total).toBe(MAX_SAMPLES_PER_CHECKLIST);
      expect(plan.droppedNotice).toBe(
        "6 variant samples not shown (at most 6 per checklist).",
      );
    });

    // The bug the first version had: the row notice was derived from the per-row
    // bound alone, so a row of five kept three, said "2 not shown", and then lost
    // two of those three to the checklist-wide bound - leaving one picture beside
    // a line understating the omission by two. Counting against what the row
    // wanted cannot drift, whichever bound did the cutting.
    it("counts the row notice against what the row wanted, not the row bound", () => {
      const plan = planChecklistSamples(
        // Five low-severity candidates on row 3, and enough criticals elsewhere
        // to take the whole budget.
        [...budgetEaters(), row(manyGroups(5, "low"), { n: 3 })],
        snapshot(manyVariants(5)),
      );

      const row3 = plan.rows.find((r) => r.n === 3);
      expect(row3?.samples).toEqual([]);
      // Derived from the row bound alone this would have read "2 more not shown"
      // - 5 wanted less the 3 the row bound allowed - beside zero pictures.
      expect(row3?.coverageNotice).toBe(
        "Showing 0 of 5 variant samples for this row.",
      );
    });

    // The reason the checklist-wide bound ranks before it cuts: rows are drawn in
    // checklist order, so without ranking row 3's low-severity warnings would
    // spend the budget before row 16's critical failures were even considered.
    it("spends the checklist budget on the most severe candidates first", () => {
      const plan = planChecklistSamples(
        [
          row(manyGroups(MAX_SAMPLES_PER_ROW, "low"), { n: 3 }),
          row(manyGroups(MAX_SAMPLES_PER_ROW, "critical"), {
            n: 16,
            status: "fail",
          }),
          row(manyGroups(MAX_SAMPLES_PER_ROW, "high"), { n: 19 }),
        ],
        snapshot(manyVariants(MAX_SAMPLES_PER_ROW)),
      );

      const byRow = new Map(plan.rows.map((r) => [r.n, r.samples.length]));
      expect(byRow.get(16)).toBe(MAX_SAMPLES_PER_ROW);
      expect(byRow.get(19)).toBe(MAX_SAMPLES_PER_ROW);
      // The low-severity row is the one that loses everything.
      expect(byRow.get(3) ?? 0).toBe(0);
      expect(plan.total).toBe(MAX_SAMPLES_PER_CHECKLIST);
    });

    it("keeps drawing order stable, in checklist order then line order", () => {
      const plan = planChecklistSamples(
        [
          row(manyGroups(2, "critical"), { n: 16, status: "fail" }),
          row(manyGroups(2, "critical"), { n: 3 }),
        ],
        snapshot(manyVariants(2)),
      );
      // Ranking is for choosing, not for drawing: rows come back in the order
      // they were given, and samples in the order of the lines they hang off.
      expect(plan.rows.map((r) => r.n)).toEqual([16, 3]);
      expect(plan.rows[0].samples.map((s) => s.groupIndex)).toEqual([0, 1]);
    });

    // A row can lose every one of its samples to the checklist-wide bound while
    // still owing its own notice - the notice is the only thing left saying that
    // row had visible defects at all, so it must survive an empty sample list.
    it("keeps a row that kept no samples but owes a notice", () => {
      const plan = planChecklistSamples(
        [
          row(manyGroups(MAX_SAMPLES_PER_ROW, "critical"), { n: 16 }),
          row(manyGroups(MAX_SAMPLES_PER_ROW, "critical"), { n: 19 }),
          row(manyGroups(MAX_SAMPLES_PER_ROW + 4, "low"), { n: 3 }),
        ],
        snapshot(manyVariants(MAX_SAMPLES_PER_ROW + 4)),
      );

      const row3 = plan.rows.find((r) => r.n === 3);
      expect(row3).toBeDefined();
      expect(row3?.samples).toEqual([]);
      expect(row3?.coverageNotice).toBe(
        "Showing 0 of 7 variant samples for this row.",
      );
    });
  });
});
