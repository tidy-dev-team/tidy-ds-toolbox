import { describe, it, expect } from "vitest";
import { CHECKLIST_CATALOGUE } from "./checklist-catalogue";
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
  manualRemainder?: string,
): CheckResult {
  return {
    checkId,
    title: checkId,
    status,
    findings,
    ...(manualRemainder ? { manualRemainder } : {}),
  };
}

/** Stand-in for whatever copy a partially-automated check emits. */
const REMAINDER = "Confirm the half this check cannot see.";

describe("buildChecklistReport", () => {
  it("returns one row per catalogue item, in catalogue order", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [],
      notImplemented: [],
    });
    expect(report.items).toHaveLength(CHECKLIST_CATALOGUE.length);
    expect(report.items.map((item) => item.n)).toEqual(
      CHECKLIST_CATALOGUE.map((entry) => entry.n),
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

  it("keeps engine not_applicable distinct (not folded into pass) and carries no findings", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [result("preferred-values", "not_applicable")],
      notImplemented: [],
    });
    const preferred = report.items.find((i) => i.n === 15)!;
    expect(preferred.status).toBe("not_applicable");
    expect(preferred.findings).toEqual([]);
    // not_applicable must not inflate the pass count.
    expect(report.counts.pass).toBe(0);
    // ...but it is still reported, so the buckets account for the row (#126).
    // The stub from tidy_qa_build_checklist carries no findings, so a row that
    // appears in no bucket is invisible to its only caller.
    expect(report.counts.notApplicable).toBe(1);
    expect(report.counts).not.toHaveProperty("not_applicable");
  });

  it("tallies every row, so the status buckets sum to the catalogue", () => {
    // An asset-like set: several checks run and find nothing to judge, one is
    // filtered out, the rest never ran. Previously this summed to 2 of 19.
    const report = buildChecklistReport({
      target: TARGET,
      results: [
        result("set-name-casing", "fail", [finding()]),
        result("preferred-values", "not_applicable"),
        result("high-contrast", "not_applicable"),
        result("nesting-depth", "not_applicable"),
        result("asset-provenance", "not_applicable"),
      ],
      notImplemented: ["description"],
    });
    const { pass, warn, fail, manual, notImplemented, notApplicable, notRun } =
      report.counts;
    expect(notApplicable).toBe(4);
    expect(
      pass + warn + fail + manual + notImplemented + notApplicable + notRun,
    ).toBe(CHECKLIST_CATALOGUE.length);
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
    // Item 18 is manual-only in the PRD — no check will ever back it.
    const template = report.items.find((i) => i.n === 18)!;
    expect(template).toMatchObject({
      tier: null,
      automated: false,
      status: "manual",
    });
  });

  it("carries a check's caveat onto its row, even when the check passed", () => {
    const report = buildChecklistReport({
      target: TARGET,
      results: [
        {
          checkId: "asset-provenance",
          title: "Icons / illustrations / logos from Foundations",
          status: "pass",
          findings: [],
          note: "Library origin cannot be verified through the plugin API.",
        },
      ],
      notImplemented: [],
    });
    const icons = report.items.find((i) => i.n === 8)!;
    expect(icons.status).toBe("pass");
    // A pass carries no findings, so the note is the only place the partial
    // evidence can surface.
    expect(icons.findings).toEqual([]);
    expect(icons.note).toMatch(/cannot be verified/);
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
    const manualCount = report.items.filter(
      (i) => i.status === "manual",
    ).length;
    const notRunCount = report.items.filter(
      (i) => i.status === "not_run",
    ).length;
    expect(report.counts).toEqual({
      pass: 1,
      warn: 1,
      fail: 1,
      manual: manualCount,
      notImplemented: 1,
      notApplicable: 0,
      notRun: notRunCount,
      partial: 0,
    });
    expect(notRunCount).toBeGreaterThan(0);
    // Every status bucket is reported, so the tallies account for every row
    // without the caller having to infer a shortfall (#126).
    expect(
      report.counts.pass +
        report.counts.warn +
        report.counts.fail +
        report.counts.manual +
        report.counts.notImplemented +
        report.counts.notApplicable +
        report.counts.notRun,
    ).toBe(CHECKLIST_CATALOGUE.length);
    // partial is an overlay, not a status: excluded from the sum on purpose.
    expect(report.counts.partial).toBe(0);
  });

  describe("partially automated rows", () => {
    // A partial row would otherwise render a bare status chip while the half the
    // check cannot see had never been performed.
    it("forwards the check's remainder onto its row", () => {
      const report = buildChecklistReport({
        target: TARGET,
        results: [result("responsive-bounds", "pass", [], REMAINDER)],
        notImplemented: [],
      });
      const item = report.items.find((i) => i.n === 7);
      expect(item?.status).toBe("pass");
      expect(item?.automated).toBe(true);
      expect(item?.manualRemainder).toBe(REMAINDER);
      expect(report.counts.partial).toBe(1);
    });

    it("forwards it regardless of the engine status", () => {
      for (const status of ["warn", "fail", "not_applicable"] as const) {
        const report = buildChecklistReport({
          target: TARGET,
          results: [result("responsive-bounds", status, [], REMAINDER)],
          notImplemented: [],
        });
        expect(report.items.find((i) => i.n === 7)?.manualRemainder).toBe(
          REMAINDER,
        );
      }
    });

    it("leaves a row alone when its check reports no remainder", () => {
      const report = buildChecklistReport({
        target: TARGET,
        results: [result("no-conflicts", "pass")],
        notImplemented: [],
      });
      expect(
        report.items.find((i) => i.n === 13)?.manualRemainder,
      ).toBeUndefined();
      expect(report.counts.partial).toBe(0);
    });

    it("counts partial rows on top of their status, never instead of it", () => {
      const report = buildChecklistReport({
        target: TARGET,
        results: [
          result("responsive-bounds", "warn", [finding()], REMAINDER),
          result("documentation", "pass", [], REMAINDER),
          result("no-conflicts", "pass"),
        ],
        notImplemented: [],
      });
      // Both partial rows keep their own verdict...
      expect(report.counts.pass).toBe(2);
      expect(report.counts.warn).toBe(1);
      // ...and are additionally tallied as partly manual.
      expect(report.counts.partial).toBe(2);
    });

    it("records no remainder for a row whose check never ran", () => {
      // Nothing about the row was established, and its not_run /
      // not_implemented chip already says the whole row is open.
      const report = buildChecklistReport({
        target: TARGET,
        results: [result("tokens", "pass")],
        notImplemented: ["documentation"],
      });
      expect(report.items.find((i) => i.n === 7)?.status).toBe("not_run");
      expect(
        report.items.find((i) => i.n === 7)?.manualRemainder,
      ).toBeUndefined();
      expect(report.items.find((i) => i.n === 19)?.status).toBe(
        "not_implemented",
      );
      expect(
        report.items.find((i) => i.n === 19)?.manualRemainder,
      ).toBeUndefined();
      expect(report.counts.partial).toBe(0);
    });

    it("reports partial work even when nothing is fully manual", () => {
      // The regression this guards: a summary reading "0 manual" while a row
      // still has an unticked box.
      const report = buildChecklistReport({
        target: TARGET,
        results: [result("documentation", "pass", [], REMAINDER)],
        notImplemented: [],
      });
      expect(report.counts.partial).toBeGreaterThan(0);
    });
  });
});
