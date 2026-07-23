/**
 * Pure ChecklistReport model (issue #91).
 * Merges engine CheckResult[] with the 19-item catalogue.
 */

import { CHECKLIST_CATALOGUE } from "./checklist-catalogue";
import type {
  CheckId,
  CheckResult,
  CheckStatus,
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

function mapEngineStatus(status: CheckStatus): ItemStatus {
  // Engine not_applicable means the check has nothing to say — treat as pass
  // on the designer-facing checklist (PRD ItemStatus has no not_applicable).
  if (status === "not_applicable") return "pass";
  return status;
}

function emptyCounts(): ChecklistReport["counts"] {
  return { pass: 0, warn: 0, fail: 0, manual: 0, notImplemented: 0 };
}

/**
 * Build a 19-row ChecklistReport from engine output.
 *
 * Status resolution:
 * - no checkId → manual
 * - checkId in results → pass/warn/fail (not_applicable → pass)
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
        status = mapEngineStatus(engine.status);
        // PRD §6: findings empty for manual/pass; keep them for warn/fail.
        findings = status === "pass" ? [] : engine.findings;
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
      // not_run is intentionally omitted from counts (PRD §6).
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
