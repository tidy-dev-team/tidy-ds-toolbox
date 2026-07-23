/**
 * QA Engine result types — issue #76 (QA Engine, Tier 1 prep).
 *
 * Two-axis model: `status` per check (maps to the DS Component QA Checklist),
 * `severity` per individual finding. Severity reuses the audit module's enum.
 */

import type { SeverityLevel } from "../audit/types";

export type { SeverityLevel };

export type CheckStatus = "pass" | "warn" | "fail" | "not_applicable";

/** Stable ids of the 9 static Tier 1 checks (PRD section in CHECKS). */
export type CheckId =
  | "set-name-casing"
  | "prop-order"
  | "tokens"
  | "layer-naming-structure"
  | "grid-4px"
  | "interaction-hover-only"
  | "description"
  | "no-conflicts"
  | "preferred-values";

export interface Finding {
  severity: SeverityLevel;
  /** Offender node — lets a caller (agent / future thin UI) jump to it. */
  nodeId: string;
  nodeName: string;
  message: string;
  expected?: string;
  actual?: string;
  suggestedFix?: string;
}

export interface CheckResult {
  checkId: CheckId;
  title: string;
  status: CheckStatus;
  findings: Finding[];
}

export interface CheckDefinition {
  id: CheckId;
  /** Section number in docs/prd-automated-qa.md. */
  prdSection: number;
  title: string;
}

/** Catalogue of the 9 Tier 1 checks, in PRD order. */
export const CHECKS: readonly CheckDefinition[] = [
  { id: "set-name-casing", prdSection: 2, title: "Component set name casing" },
  {
    id: "prop-order",
    prdSection: 4,
    title: "Prop order (consolidated catalogue)",
  },
  { id: "tokens", prdSection: 5, title: "Tokens (Styles & Variables)" },
  {
    id: "layer-naming-structure",
    prdSection: 9,
    title: "Layer naming + structure",
  },
  { id: "grid-4px", prdSection: 10, title: "4px grid alignment" },
  {
    id: "interaction-hover-only",
    prdSection: 11,
    title: "Interaction (hover-only)",
  },
  {
    id: "description",
    prdSection: 12,
    title: "Description (also-known-as + misprint keywords)",
  },
  { id: "no-conflicts", prdSection: 13, title: "No conflicts" },
  { id: "preferred-values", prdSection: 15, title: "Preferred values" },
];

export function getCheck(id: string): CheckDefinition | undefined {
  return CHECKS.find((c) => c.id === id);
}

export type ItemStatus =
  | "pass"
  | "warn"
  | "fail"
  | "manual"
  | "not_implemented"
  | "not_run";

export interface ChecklistItem {
  n: number;
  title: string;
  tier: 1 | 2 | null;
  checkId?: CheckId;
  automated: boolean;
  status: ItemStatus;
  /** Engine findings; empty for manual / pass / not_implemented / not_run. */
  findings: Finding[];
}

export interface ChecklistReport {
  target: { id: string; name: string };
  generatedFor: { instanceId?: string };
  items: ChecklistItem[];
  counts: Record<"pass" | "warn" | "fail" | "manual" | "notImplemented", number>;
}

export interface QaRunResult {
  target: { id: string; name: string };
  results: CheckResult[];
  /** Requested checks whose pure check function hasn't shipped yet. */
  notImplemented: CheckId[];
  /** 19-item checklist model merging engine results with the PRD catalogue. */
  checklist: ChecklistReport;
}
