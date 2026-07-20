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
    { name: "Size", type: "VARIANT" },
    { name: "State", type: "VARIANT" },
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
  it("lists the 9 Tier 1 checks with unique ids", () => {
    expect(CHECKS).toHaveLength(9);
    expect(new Set(CHECKS.map((c) => c.id)).size).toBe(9);
    // The static Tier 1 PRD sections, per issue #76.
    expect(CHECKS.map((c) => c.prdSection)).toEqual([
      2, 4, 5, 9, 10, 11, 12, 13, 15,
    ]);
  });

  it("resolves ids via getCheck and rejects unknown ones", () => {
    expect(getCheck("tokens")?.prdSection).toBe(5);
    expect(unknownCheckIds(["tokens", "nope"])).toEqual(["nope"]);
  });
});

describe("runChecks", () => {
  it("reports every unimplemented requested check (Tier 0: all of them)", () => {
    const outcome = runChecks(FIXTURE);
    const implemented = Object.keys(CHECK_REGISTRY);
    expect(outcome.results.map((r) => r.checkId)).toEqual(implemented);
    expect(outcome.results.length + outcome.notImplemented.length).toBe(
      CHECKS.length,
    );
  });

  it("honours the checks filter", () => {
    const outcome = runChecks(FIXTURE, ["tokens", "no-conflicts"] as CheckId[]);
    expect([
      ...outcome.results.map((r) => r.checkId),
      ...outcome.notImplemented,
    ]).toEqual(["tokens", "no-conflicts"]);
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
