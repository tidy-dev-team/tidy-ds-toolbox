/**
 * QA Engine result types — issue #76 (QA Engine, Tier 1 prep).
 *
 * Two-axis model: `status` per check (maps to the DS Component QA Checklist),
 * `severity` per individual finding. Severity reuses the audit module's enum.
 */

import type { SeverityLevel } from "../audit/types";

export type { SeverityLevel };

export type CheckStatus = "pass" | "warn" | "fail" | "not_applicable";

/** Stable ids of the static checks (PRD section in CHECKS): 10 Tier 1 plus Tier 2's 6. */
export type CheckId =
  | "set-name-casing"
  | "prop-order"
  | "tokens"
  | "layer-naming-structure"
  | "grid-4px"
  | "interaction-hover-only"
  | "description"
  | "no-conflicts"
  | "preferred-values"
  | "nesting-depth"
  | "asset-provenance"
  | "themes"
  | "high-contrast"
  | "responsive-bounds"
  | "documentation"
  | "variant-property-bindings";

export interface Finding {
  severity: SeverityLevel;
  /** Offender node — lets a caller (agent / future thin UI) jump to it. */
  nodeId: string;
  nodeName: string;
  message: string;
  expected?: string;
  actual?: string;
  suggestedFix?: string;
  /**
   * Occurrences this finding already represents (Tier 2 checks pre-dedupe
   * across a whole set instead of emitting per-node like Tier 1). Absent
   * behaves as 1.
   */
  count?: number;
  /**
   * Every node this finding covers, when it stands for more than one (#118).
   * `nodeId` remains the representative, so callers that only ever opened one
   * offender keep working; this is what makes jump-to-node survive deduping.
   *
   * Capped (see `MAX_REPORTED_NODES`) - `count` carries the true magnitude, so
   * these are a working sample, not an inventory. Absent when the finding covers
   * a single node.
   */
  nodeIds?: string[];
  /**
   * Distinct names of the nodes this finding covers, present only when they
   * differed and `message` therefore had to redact the name to `"…"` (#118).
   *
   * Without this, merging two variant roots that both hardcode a fill produced a
   * finding that no longer said *which* variants. Omitted when every merged node
   * shares its name, since `nodeName` already carries it. Capped like `nodeIds`.
   */
  nodeNames?: string[];
}

export interface CheckResult {
  checkId: CheckId;
  title: string;
  status: CheckStatus;
  findings: Finding[];
  /**
   * What this check could *not* establish, stated in the result rather than
   * left for the caller to know. A `pass` that rests on partial evidence
   * (#8: the plugin API exposes no library identity for a component, so a
   * remote instance can't be traced to an approved library) has to say so, or
   * the checklist reads as a stronger guarantee than it is.
   */
  note?: string;
  /**
   * Human work this check leaves behind, when it covers only part of its
   * checklist item. The checklist row then carries a status chip **and** keeps a
   * tickable box, so a green chip cannot stand for the half nobody performed.
   *
   * The check owns this rather than the catalogue because whether work remains
   * can depend on what the check found: #19 asks for a content review only when
   * a documentation link actually exists, and has nothing to review when it
   * reports `not_applicable`. A static per-item string got that case wrong.
   */
  manualRemainder?: string;
}

export interface CheckDefinition {
  id: CheckId;
  /** Section number in docs/prd-automated-qa.md. */
  prdSection: number;
  title: string;
}

/** Catalogue of all 16 automated checks (10 Tier 1 plus 6 Tier 2), in shipping order. */
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
  {
    id: "nesting-depth",
    prdSection: 14,
    title: "Nested instance depth",
  },
  {
    id: "asset-provenance",
    prdSection: 8,
    title: "Icons / illustrations / logos from Foundations",
  },
  {
    id: "themes",
    prdSection: 17,
    title: "Themes (per-mode variable resolution)",
  },
  {
    id: "high-contrast",
    prdSection: 16,
    title: "High contrast (WCAG AA)",
  },
  {
    id: "responsive-bounds",
    prdSection: 7,
    title: "Responsiveness (size bounds)",
  },
  {
    id: "documentation",
    prdSection: 19,
    title: "Documentation",
  },
  {
    id: "variant-property-bindings",
    prdSection: 3,
    title: "Property bindings across variants",
  },
];

export function getCheck(id: string): CheckDefinition | undefined {
  return CHECKS.find((c) => c.id === id);
}

export type ItemStatus =
  | "pass"
  | "warn"
  | "fail"
  | "not_applicable"
  | "manual"
  | "not_implemented"
  | "not_run";

export interface ChecklistItem {
  n: number;
  title: string;
  /** One-line plain-language description of what the item checks. */
  blurb: string;
  tier: 1 | 2 | null;
  checkId?: CheckId;
  automated: boolean;
  /**
   * What a human must still check on this row, forwarded from the backing
   * check's `manualRemainder`. Present means the row is *partially* automated:
   * it carries a status chip AND keeps a tickable box, because a green chip that
   * silently stood for the unchecked half would be a false pass.
   */
  manualRemainder?: string;
  status: ItemStatus;
  /**
   * Engine findings; empty for everything except warn / fail (manual, pass,
   * not_applicable, not_implemented, and not_run carry no findings).
   */
  findings: Finding[];
  /** Engine caveat for this row, when the backing check declared one. */
  note?: string;
}

export interface ChecklistReport {
  target: { id: string; name: string };
  generatedFor: { instanceId?: string };
  items: ChecklistItem[];
  /**
   * Row tallies. `pass`/`warn`/`fail`/`manual`/`notImplemented` are mutually
   * exclusive statuses and sum (with `not_applicable` and `not_run`) to 19.
   *
   * `partial` is **not** a status: it is an overlay counting automated rows that
   * still carry a `manualRemainder`, and every such row is *also* counted by its
   * own status. Without it a report could read "0 manual" while rows 7 and 19
   * had unticked boxes on the canvas, so it is deliberately excluded from the
   * sum rather than folded into `manual`.
   */
  counts: Record<
    "pass" | "warn" | "fail" | "manual" | "notImplemented" | "partial",
    number
  >;
}

export interface QaRunResult {
  target: { id: string; name: string };
  results: CheckResult[];
  /** Requested checks whose pure check function hasn't shipped yet. */
  notImplemented: CheckId[];
  /** 19-item checklist model merging engine results with the PRD catalogue. */
  checklist: ChecklistReport;
}
