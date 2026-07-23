import { describe, expect, it } from "vitest";
import { groupFindings } from "./grouped-findings";
import type { Finding } from "./types";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "low",
    nodeId: "1:1",
    nodeName: "Layer",
    message: `strokeWeight (1) on "Layer" is off the 4px grid.`,
    ...overrides,
  };
}

describe("groupFindings", () => {
  it("returns an empty array for no findings", () => {
    expect(groupFindings([])).toEqual([]);
  });

  it("collapses repeated per-node findings into one grouped line with a count", () => {
    const findings = [
      finding({ nodeId: "1:1", nodeName: "Layer A", message: `width (14) on "Layer A" is off the 4px grid.` }),
      finding({ nodeId: "1:2", nodeName: "Layer B", message: `width (14) on "Layer B" is off the 4px grid.` }),
      finding({ nodeId: "1:3", nodeName: "Layer C", message: `width (14) on "Layer C" is off the 4px grid.` }),
    ];

    const groups = groupFindings(findings);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      message: `width (14) on "…" is off the 4px grid.`,
      count: 3,
      severity: "low",
    });
  });

  it("keeps distinct kinds as separate groups", () => {
    const findings = [
      finding({ message: `width (14) on "Layer A" is off the 4px grid.` }),
      finding({ message: `height (18) on "Layer A" is off the 4px grid.` }),
    ];

    expect(groupFindings(findings)).toHaveLength(2);
  });

  it("distinguishes groups by expected/actual even with the same message shape", () => {
    const findings = [
      finding({ message: `"Layer" foo is bar`, expected: "a", actual: "1" }),
      finding({ message: `"Layer" foo is bar`, expected: "b", actual: "2" }),
    ];

    expect(groupFindings(findings)).toHaveLength(2);
  });

  it("orders groups by highest severity first", () => {
    const findings = [
      finding({ message: "low one", severity: "low" }),
      finding({ message: "critical one", severity: "critical" }),
      finding({ message: "medium one", severity: "medium" }),
    ];

    const groups = groupFindings(findings);

    expect(groups.map((g) => g.severity)).toEqual(["critical", "medium", "low"]);
  });

  it("escalates a group's severity to the highest seen among its members", () => {
    const findings = [
      finding({ message: `stroke on "Layer A"`, severity: "low" }),
      finding({ message: `stroke on "Layer B"`, severity: "high" }),
    ];

    const groups = groupFindings(findings);

    expect(groups).toHaveLength(1);
    expect(groups[0].severity).toBe("high");
    expect(groups[0].count).toBe(2);
  });

  it("breaks severity ties by larger count first", () => {
    const findings = [
      finding({ message: `a on "X"`, severity: "low" }),
      finding({ message: `b on "Y1"`, severity: "low" }),
      finding({ message: `b on "Y2"`, severity: "low" }),
    ];

    const groups = groupFindings(findings);

    expect(groups[0].count).toBe(2);
    expect(groups[1].count).toBe(1);
  });
});
