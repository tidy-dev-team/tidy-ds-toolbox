import { describe, it, expect } from "vitest";
import { CHECK_REGISTRY, runChecks, unknownCheckIds } from "./index";
import type { CheckFn } from "./index";
import { CHECKS, getCheck } from "../types";
import type { CheckId } from "../types";
import type { ComponentSetSnapshot } from "../snapshot";
import { isOnGrid } from "../qa-config";

const FIXTURE: ComponentSetSnapshot = {
  id: "1:1",
  name: "Button",
  type: "COMPONENT_SET",
  description: "",
  propertyNames: ["Size", "State"],
  properties: [
    { name: "Size", key: "Size", type: "VARIANT" },
    { name: "State", key: "State", type: "VARIANT" },
  ],
  variants: [
    {
      id: "1:2",
      name: "Size=Medium, State=Default",
      variantProperties: { Size: "Medium", State: "Default" },
      tree: {
        id: "1:2",
        name: "Size=Medium, State=Default",
        type: "COMPONENT",
        visible: true,
        width: 120,
        height: 40,
        children: [],
      },
    },
  ],
};

describe("check catalogue", () => {
  it("lists the 10 Tier 1 checks plus the 6 Tier 2 checks, with unique ids", () => {
    expect(CHECKS).toHaveLength(16);
    expect(new Set(CHECKS.map((c) => c.id)).size).toBe(16);
    // The static Tier 1 PRD sections (issue #76), then Tier 2 appended in
    // shipping order: #14 (issue #99), #8 (issue #101), #17 (issue #102),
    // #16 (issue #103), then #7 and #19: the two items the source interview
    // showed were narrow advisory checks rather than the broad ones the PRD
    // described (docs/qa-source-interview.md). #3 lands last: its automatable
    // core turned out to be per-variant property *wiring*, which is structural
    // and so Tier 1 shaped, not the dynamic test it was filed as.
    expect(CHECKS.map((c) => c.prdSection)).toEqual([
      2, 4, 5, 9, 10, 11, 12, 13, 15, 14, 8, 17, 16, 7, 19, 3,
    ]);
  });

  it("resolves ids via getCheck and rejects unknown ones", () => {
    expect(getCheck("tokens")?.prdSection).toBe(5);
    expect(unknownCheckIds(["tokens", "nope"])).toEqual(["nope"]);
  });
});

describe("runChecks", () => {
  it("partitions the catalogue into implemented results and not-implemented ids", () => {
    const outcome = runChecks(FIXTURE);
    const implemented = new Set(Object.keys(CHECK_REGISTRY));
    const order = CHECKS.map((c) => c.id);
    // Results come back in PRD (CHECKS) order, restricted to implemented checks;
    // everything else in the catalogue lands in notImplemented, same order.
    expect(outcome.results.map((r) => r.checkId)).toEqual(
      order.filter((id) => implemented.has(id)),
    );
    expect(outcome.notImplemented).toEqual(
      order.filter((id) => !implemented.has(id)),
    );
    expect(outcome.results.length + outcome.notImplemented.length).toBe(
      CHECKS.length,
    );
  });

  // #129: a bare "n/a" chip with no reason is its own honesty problem, and it
  // clusters hardest on asset sets, where it can be the majority of the frame.
  // This is a guard on the whole class rather than on the six checks that were
  // fixed - a new check that forgets its reason fails here, not in review.
  it("gives every not_applicable result a reason", () => {
    const notApplicable = runChecks(FIXTURE).results.filter(
      (r) => r.status === "not_applicable",
    );
    // Guard the guard: a bare fixture must actually drive checks to n/a, or
    // this asserts nothing. The bare component set is exactly the asset-set
    // shape the issue is about.
    expect(notApplicable.length).toBeGreaterThanOrEqual(5);
    const unexplained = notApplicable
      .filter((r) => !r.note?.trim())
      .map((r) => r.checkId);
    expect(unexplained).toEqual([]);
  });

  it("does not restate the chip instead of giving a reason", () => {
    // The issue rules out a generic fallback: "the value is in the specific
    // reason, which only each check knows". A reason has to name the condition
    // that produced it, so it cannot be a stock phrase or a few words long.
    const SHORTEST_REAL_REASON = 30;
    const notApplicable = runChecks(FIXTURE).results.filter(
      (r) => r.status === "not_applicable",
    );
    for (const result of notApplicable) {
      expect(result.note).not.toMatch(/nothing applicable to evaluate/i);
      expect(result.note?.length ?? 0).toBeGreaterThan(SHORTEST_REAL_REASON);
    }
    // Each check writes its own, so no two rows may share a reason.
    const reasons = notApplicable.map((r) => r.note);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it("honours the checks filter", () => {
    const requested = ["tokens", "prop-order"] as CheckId[];
    const outcome = runChecks(FIXTURE, requested);
    // Only the requested ids flow through, whether implemented or not.
    const seen = [
      ...outcome.results.map((r) => r.checkId),
      ...outcome.notImplemented,
    ];
    expect(new Set(seen)).toEqual(new Set(requested));
    expect(seen).toHaveLength(requested.length);
  });

  it("runs a registered check function against the snapshot", () => {
    const fake: CheckFn = (snapshot) => ({
      checkId: "tokens",
      title: "Tokens (Styles & Variables)",
      status: snapshot.name === "Button" ? "pass" : "fail",
      findings: [],
    });
    CHECK_REGISTRY.tokens = fake;
    try {
      const outcome = runChecks(FIXTURE, ["tokens"] as CheckId[]);
      expect(outcome.notImplemented).toEqual([]);
      expect(outcome.results).toEqual([
        {
          checkId: "tokens",
          title: "Tokens (Styles & Variables)",
          status: "pass",
          findings: [],
        },
      ]);
    } finally {
      delete CHECK_REGISTRY.tokens;
    }
  });

  it("dedupes each check's findings, so one shared-layer defect is one finding", () => {
    // Variants share layers, so a per-node check reports the same defect once per
    // variant: on a real 64-variant Button that turned 4 token defects into 170
    // findings (#118). Deduping here rather than in each check keeps every check
    // a plain per-node function.
    const perNode: CheckFn = () => ({
      checkId: "tokens",
      title: "Tokens (Styles & Variables)",
      status: "fail",
      findings: Array.from({ length: 56 }, (_, i) => ({
        severity: "medium" as const,
        nodeId: `2625:${10450 + i}`,
        nodeName: "Right Icon",
        message: `"Right Icon" itemSpacing is 10 but not bound to a spacing variable.`,
        expected: "Spacing bound to a variable",
        actual: "10",
      })),
    });
    CHECK_REGISTRY.tokens = perNode;
    try {
      const [result] = runChecks(FIXTURE, ["tokens"] as CheckId[]).results;
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].count).toBe(56);
      // The status the check decided is untouched; only the findings collapse.
      expect(result.status).toBe("fail");
      // Jump-to-node survives.
      expect(result.findings[0].nodeId).toBe("2625:10450");
      expect(result.findings[0].nodeIds?.length).toBeGreaterThan(1);
    } finally {
      delete CHECK_REGISTRY.tokens;
    }
  });
});

describe("qa-config", () => {
  it("grid rule: multiples of 4 or exactly 2", () => {
    expect(isOnGrid(0)).toBe(true);
    expect(isOnGrid(2)).toBe(true);
    expect(isOnGrid(4)).toBe(true);
    expect(isOnGrid(6)).toBe(false);
    expect(isOnGrid(8)).toBe(true);
    expect(isOnGrid(10)).toBe(false);
    expect(isOnGrid(12)).toBe(true);
  });
});
