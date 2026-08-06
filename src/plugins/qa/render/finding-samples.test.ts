import { describe, expect, it } from "vitest";
import { planChecklistSamples, type PlannableRow } from "./finding-samples";
import type { GroupedFinding } from "../grouped-findings";
import type { ComponentSetSnapshot, VariantSnapshot } from "../snapshot";
import type { ChecklistItem } from "../types";

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
    nodeId: "9:9",
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
});
