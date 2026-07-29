/**
 * QA Engine result types — issue #76 (QA Engine, Tier 1 prep).
 *
 * Two-axis model: `status` per check (maps to the DS Component QA Checklist),
 * `severity` per individual finding. Severity reuses the audit module's enum.
 */

import type { SeverityLevel } from "../audit/types";
import type { ComponentSetSnapshot } from "./snapshot";

export type { SeverityLevel };

export type CheckStatus = "pass" | "warn" | "fail" | "not_applicable";

/**
 * The agent-facing check ids, derived from the checklist table and re-exported
 * here so the wire types can name them.
 *
 * Declared *by the table* rather than beside it: a hand-written union was a
 * second list to keep in step, and the compiler joined neither copy to the other
 * (#132). Extracting it from the rows means an id that no row claims cannot be
 * spelled at all.
 */
export type { CheckId } from "./checklist-catalogue";
import type { CheckId } from "./checklist-catalogue";

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
   * left for the caller to know. Any verdict may carry one:
   *
   * - On a verdict the check actually reached (`pass`, `warn`, `fail`), a
   *   caveat: the verdict rests on partial evidence (#8: the plugin API exposes
   *   no library identity for a component, so a remote instance cannot be
   *   traced to an approved library; #17 names the collection its heuristic
   *   picked, since a wrong pick means the whole row describes the wrong axis).
   *   Without it the checklist reads as a stronger statement than it is, and
   *   that is as true of a `fail` as of a `pass`.
   * - On a `not_applicable`, the reason the check had nothing to evaluate
   *   (#129) - not a qualification of a verdict but the whole content of one.
   *   A bare "n/a" chip with no reason is its own honesty problem, and it
   *   clusters worst on asset sets, where it can be the majority of the frame.
   *   Only the check knows the specific reason, so each writes its own rather
   *   than sharing a generic fallback.
   *
   * The renderer picks the on-canvas prefix from the status accordingly; see
   * `notePrefix` in render/status-style.ts.
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

/**
 * A check: pure `(snapshot) → CheckResult`, no Figma API, fixture-testable.
 *
 * Lives here rather than in `checks/index.ts` so the catalogue can carry the
 * function on its row without importing the run helper that reads the catalogue.
 */
export type CheckFn = (snapshot: ComponentSetSnapshot) => CheckResult;

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
   * Row tallies. `pass`/`warn`/`fail`/`manual`/`notImplemented`/`notApplicable`/
   * `notRun` are mutually exclusive statuses and sum to one per catalogue row
   * (`CHECKLIST_CATALOGUE.length`) - never a literal, so widening the checklist
   * cannot leave this comment claiming a stale total.
   *
   * `notApplicable` and `notRun` are reported rather than dropped even though
   * neither is actionable. `tidy_qa_build_checklist` returns only these counts
   * and no findings, so they are the caller's whole view of the run: without
   * them a set assembled from nested instances reports 15 of 19 and an agent
   * cannot tell four inapplicable rows from four rows that failed to run (#126).
   * They stay separate from `pass` so a check that validated nothing can never
   * inflate the pass count.
   *
   * `partial` is **not** a status: it is an overlay counting automated rows that
   * still carry a `manualRemainder`, and every such row is *also* counted by its
   * own status. Without it a report could read "0 manual" while rows 7 and 19
   * had unticked boxes on the canvas, so it is deliberately excluded from the
   * sum rather than folded into `manual`.
   */
  counts: Record<
    | "pass"
    | "warn"
    | "fail"
    | "manual"
    | "notImplemented"
    | "notApplicable"
    | "notRun"
    | "partial",
    number
  >;
}

export interface QaRunResult {
  target: { id: string; name: string };
  results: CheckResult[];
  /** Requested checks whose pure check function hasn't shipped yet. */
  notImplemented: CheckId[];
  /** Checklist model, one row per catalogue item, merging in engine results. */
  checklist: ChecklistReport;
  /**
   * The component rendered once per theme mode, side by side, as a PNG data URL
   * (#121 step 2) - present only when `includeModeImages` asked for it and the
   * set actually has a theme axis to show.
   *
   * Row 17's automatable half establishes that variables resolve and that text
   * meets contrast in every mode. What neither can see is a non-text element -
   * an icon, border or divider - vanishing into the surface in one mode. This is
   * that, and it is evidence rather than a verdict: the row's status is unchanged
   * by it.
   */
  modeImage?: string;
}
