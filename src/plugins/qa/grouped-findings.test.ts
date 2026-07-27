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
      finding({
        nodeId: "1:1",
        nodeName: "Layer A",
        message: `width (14) on "Layer A" is off the 4px grid.`,
      }),
      finding({
        nodeId: "1:2",
        nodeName: "Layer B",
        message: `width (14) on "Layer B" is off the 4px grid.`,
      }),
      finding({
        nodeId: "1:3",
        nodeName: "Layer C",
        message: `width (14) on "Layer C" is off the 4px grid.`,
      }),
    ];

    const groups = groupFindings(findings);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      message: `width (14) on "…" is off the 4px grid.`,
      count: 3,
      severity: "low",
    });
  });

  it("blanks the node name but keeps other quoted literals in the message", () => {
    // Two names, so redaction is what merges them: only the node name goes, and
    // the fixed `"Also known as:"` literal has to survive it.
    const groups = groupFindings([
      finding({
        nodeId: "1:1",
        nodeName: "Nissim-V2",
        message: `Component set "Nissim-V2" description is missing an "Also known as:" line.`,
      }),
      finding({
        nodeId: "1:2",
        nodeName: "Nissim-V3",
        message: `Component set "Nissim-V3" description is missing an "Also known as:" line.`,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].message).toBe(
      `Component set "…" description is missing an "Also known as:" line.`,
    );
  });

  it("keeps the node name when nothing was merged away", () => {
    // A lone finding has no ambiguity to hide, and the name is the most useful
    // word on the row. Redacting it here only ever lost information.
    const groups = groupFindings([
      finding({
        nodeName: "Nissim-V2",
        message: `Component set "Nissim-V2" description is missing an "Also known as:" line.`,
      }),
    ]);

    expect(groups[0].message).toContain(`"Nissim-V2"`);
  });

  it("keeps a shared node name when several findings agree on it", () => {
    // The canvas must not describe a defect differently from the payload: a
    // shared layer name is kept in both.
    const groups = groupFindings([
      finding({
        nodeId: "1:1",
        nodeName: "Right Icon",
        message: `itemSpacing (10) on "Right Icon" is off the 4px grid.`,
      }),
      finding({
        nodeId: "1:2",
        nodeName: "Right Icon",
        message: `itemSpacing (10) on "Right Icon" is off the 4px grid.`,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].message).toContain(`"Right Icon"`);
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

    expect(groups.map((g) => g.severity)).toEqual([
      "critical",
      "medium",
      "low",
    ]);
  });

  it("escalates a group's severity to the highest seen among its members", () => {
    const findings = [
      finding({
        nodeName: "Layer A",
        message: `stroke on "Layer A"`,
        severity: "low",
      }),
      finding({
        nodeName: "Layer B",
        message: `stroke on "Layer B"`,
        severity: "high",
      }),
    ];

    const groups = groupFindings(findings);

    expect(groups).toHaveLength(1);
    expect(groups[0].severity).toBe("high");
    expect(groups[0].count).toBe(2);
  });

  it("breaks severity ties by larger count first", () => {
    const findings = [
      finding({ nodeName: "X", message: `a on "X"`, severity: "low" }),
      finding({ nodeName: "Y1", message: `b on "Y1"`, severity: "low" }),
      finding({ nodeName: "Y2", message: `b on "Y2"`, severity: "low" }),
    ];

    const groups = groupFindings(findings);

    expect(groups[0].count).toBe(2);
    expect(groups[1].count).toBe(1);
  });

  it("sums a pre-deduped finding's occurrence count instead of treating it as 1", () => {
    const findings = [
      finding({ nodeName: "X", message: `chain on "X"`, count: 18 }),
    ];

    const groups = groupFindings(findings);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(18);
  });

  it("adds occurrence counts across multiple pre-deduped findings in the same group", () => {
    const findings = [
      finding({ nodeName: "X", message: `chain on "X"`, count: 3 }),
      finding({ nodeName: "Y", message: `chain on "Y"`, count: 5 }),
    ];

    const groups = groupFindings(findings);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(8);
  });
});
