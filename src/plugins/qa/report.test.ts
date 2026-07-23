import { describe, it, expect } from "vitest";
import { buildChecklistReport } from "./report";
import type { CheckResult, Finding } from "./types";

const TARGET = { id: "1:1", name: "Button" };

function finding(message = "issue"): Finding {
  return {
    severity: "high",
    nodeId: "1:2",
    nodeName: "Button",
    message,
  };
}

function result(
  checkId: CheckResult["checkId"],
  status: CheckResult["status"],
  findings: Finding[] = [],
): CheckResult {
  return { checkId, title: checkId, status, findings };
}

describe("buildChecklistReport", () => {
  it("returns exactly 19 rows in PRD order", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [],
      notImplemented: [],
    });
    expect(report.items).toHaveLength(19);
    expect(report.items.map((item) => item.n)).toEqual(
      Array.from({ length: 19 }, (_, i) => i + 1),
    );
    expect(report.target).toEqual(TARGET);
  });

  it("resolves automated pass/warn/fail from engine results", () => {
    const findings = [finding("token unbound")];
    const report = buildChecklistReport({
      target: TARGET,
      results: [
        result("set-name-casing", "pass"),
        result("tokens", "warn", findings),
        result("grid-4px", "fail", [finding("off grid")]),
      ],
      notImplemented: [],
    });

    const naming = report.items.find((i) => i.n === 2)!;
    expect(naming).toMatchObject({
      checkId: "set-name-casing",
      automated: true,
      status: "pass",
      findings: [],
    });

    const tokens = report.items.find((i) => i.n === 5)!;
    expect(tokens).toMatchObject({
      checkId: "tokens",
      automated: true,
      status: "warn",
      findings,
    });

    const grid = report.items.find((i) => i.n === 10)!;
    expect(grid).toMatchObject({
      checkId: "grid-4px",
      automated: true,
      status: "fail",
    });
    expect(grid.findings).toHaveLength(1);
  });

  it("maps engine not_applicable to pass", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [result("preferred-values", "not_applicable")],
      notImplemented: [],
    });
    const preferred = report.items.find((i) => i.n === 15)!;
    expect(preferred.status).toBe("pass");
    expect(preferred.findings).toEqual([]);
  });

  it("strips findings on pass even if the engine attached any", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [result("set-name-casing", "pass", [finding("noise")])],
      notImplemented: [],
    });
    expect(report.items.find((i) => i.n === 2)).toMatchObject({
      status: "pass",
      findings: [],
    });
  });

  it("resolves un-automated items to manual", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [],
      notImplemented: [],
    });
    const manual = report.items.filter((i) => !i.checkId);
    expect(manual.length).toBeGreaterThan(0);
    for (const item of manual) {
      expect(item.automated).toBe(false);
      expect(item.status).toBe("manual");
      expect(item.findings).toEqual([]);
    }
    // Item 8 is Tier 2 planned — still manual until a check ships.
    const icons = report.items.find((i) => i.n === 8)!;
    expect(icons).toMatchObject({
      tier: 2,
      automated: false,
      status: "manual",
    });
  });

  it("resolves catalogued-but-unbuilt automated items to not_implemented", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [],
      notImplemented: ["tokens", "description"],
    });
    expect(report.items.find((i) => i.n === 5)).toMatchObject({
      checkId: "tokens",
      automated: true,
      status: "not_implemented",
      findings: [],
    });
    expect(report.items.find((i) => i.n === 12)).toMatchObject({
      checkId: "description",
      status: "not_implemented",
    });
  });

  it("resolves filtered-out automated items to not_run", () => {
    // Only tokens ran; other automated catalogue items were excluded by filter.
    const report = buildChecklistReport({
      target: TARGET,
      results: [result("tokens", "pass")],
      notImplemented: [],
    });
    expect(report.items.find((i) => i.n === 5)?.status).toBe("pass");
    expect(report.items.find((i) => i.n === 2)?.status).toBe("not_run");
    expect(report.items.find((i) => i.n === 10)?.status).toBe("not_run");
    // Manual items stay manual even when a filter is in play.
    expect(report.items.find((i) => i.n === 1)?.status).toBe("manual");
  });

  it("attaches generatedFor when provided", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [],
      notImplemented: [],
      generatedFor: { instanceId: "9:9" },
    });
    expect(report.generatedFor).toEqual({ instanceId: "9:9" });
  });

  it("counts pass/warn/fail/manual/notImplemented (not not_run)", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [
        result("set-name-casing", "pass"),
        result("tokens", "warn", [finding()]),
        result("grid-4px", "fail", [finding()]),
      ],
      notImplemented: ["description"],
    });
    // 3 automated resolved + 1 not_implemented + remaining automated = not_run
    // + all manual items
    const manualCount = report.items.filter((i) => i.status === "manual").length;
    const notRunCount = report.items.filter((i) => i.status === "not_run").length;
    expect(report.counts).toEqual({
      pass: 1,
      warn: 1,
      fail: 1,
      manual: manualCount,
      notImplemented: 1,
    });
    expect(notRunCount).toBeGreaterThan(0);
    // not_run is intentionally absent from counts (PRD §6).
    expect(report.counts).not.toHaveProperty("not_run");
    expect(
      report.counts.pass +
        report.counts.warn +
        report.counts.fail +
        report.counts.manual +
        report.counts.notImplemented +
        notRunCount,
    ).toBe(19);
  });
});
