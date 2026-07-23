/**
 * Pure ChecklistReport model (issue #91).
 * Merges engine CheckResult[] with the 19-item catalogue.
 */

import { CHECKLIST_CATALOGUE } from "./checklist-catalogue";
import type {
  CheckId,
  CheckResult,
  ChecklistItem,
  ChecklistReport,
  Finding,
  ItemStatus,
} from "./types";

export type { ChecklistItem, ChecklistReport, ItemStatus };

export interface BuildChecklistReportInput {
  target: { id: string; name: string };
  results: CheckResult[];
  notImplemented: CheckId[];
  generatedFor?: { instanceId?: string };
}

function emptyCounts(): ChecklistReport["counts"] {
  return { pass: 0, warn: 0, fail: 0, manual: 0, notImplemented: 0 };
}

/**
 * Build a 19-row ChecklistReport from engine output.
 *
 * Status resolution:
 * - no checkId → manual
 * - checkId in results → pass/warn/fail/not_applicable (1:1 from the engine)
 * - checkId in notImplemented → not_implemented
 * - checkId absent from both (filtered out) → not_run
 */
export function buildChecklistReport(
  input: BuildChecklistReportInput,
): ChecklistReport {
  const byId = new Map(input.results.map((r) => [r.checkId, r]));
  const notImplemented = new Set(input.notImplemented);
  const counts = emptyCounts();

  const items: ChecklistItem[] = CHECKLIST_CATALOGUE.map((entry) => {
    const automated = entry.checkId !== undefined;
    let status: ItemStatus;
    let findings: Finding[] = [];

    if (!entry.checkId) {
      status = "manual";
    } else {
      const engine = byId.get(entry.checkId);
      if (engine) {
        // Engine statuses map 1:1 onto the checklist. not_applicable stays
        // distinct (the check ran but had nothing to evaluate) rather than
        // folding into pass, which would inflate the pass count for checks
        // that never actually validated anything.
        status = engine.status;
        // Findings are only meaningful for warn/fail; pass/not_applicable carry none.
        findings = status === "warn" || status === "fail" ? engine.findings : [];
      } else if (notImplemented.has(entry.checkId)) {
        status = "not_implemented";
      } else {
        status = "not_run";
      }
    }

    switch (status) {
      case "pass":
        counts.pass += 1;
        break;
      case "warn":
        counts.warn += 1;
        break;
      case "fail":
        counts.fail += 1;
        break;
      case "manual":
        counts.manual += 1;
        break;
      case "not_implemented":
        counts.notImplemented += 1;
        break;
      // not_applicable and not_run carry no actionable state and are
      // intentionally omitted from counts (so counts.pass stays honest).
    }

    return {
      n: entry.n,
      title: entry.title,
      tier: entry.tier,
      checkId: entry.checkId,
      automated,
      status,
      findings,
    };
  });

  return {
    target: input.target,
    generatedFor: input.generatedFor ?? {},
    items,
    counts,
  };
}
