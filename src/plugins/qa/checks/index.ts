/**
 * The run helper over the checklist catalogue.
 *
 * Each check is a pure function `(snapshot) → CheckResult` in its own file under
 * checks/. Which checks exist, and which checklist row each backs, is declared
 * once in `../checklist-catalogue.ts` - this module only *reads* that table, so
 * implementing a check never touches the collector, the operation, or this file.
 */

import {
  AUTOMATED_ITEMS,
  CHECK_IDS,
  itemForCheck,
} from "../checklist-catalogue";
import { dedupeFindings } from "../dedupe-findings";
import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckFn, CheckId, CheckResult } from "../types";

export type { CheckFn };

/**
 * Check id → check function, derived from the catalogue rather than declared.
 *
 * A second hand-written index of the table used to let a check be registered but
 * claimed by no row, in which case `buildChecklistReport` silently dropped its
 * result. Deriving makes that unrepresentable.
 *
 * Kept mutable, and read per run rather than captured, so a test can substitute
 * one check's function without rebuilding the catalogue.
 */
export const CHECK_REGISTRY: Partial<Record<CheckId, CheckFn>> =
  Object.fromEntries(AUTOMATED_ITEMS.map((item) => [item.checkId, item.run]));

export interface RunOutcome {
  results: CheckResult[];
  notImplemented: CheckId[];
}

/** Ids of checks that are unknown to the catalogue (caller sent a bad filter). */
export function unknownCheckIds(requested: string[]): string[] {
  return requested.filter((id) => !itemForCheck(id));
}

/**
 * Run the requested checks (default: the whole catalogue, in checklist order)
 * against one snapshot. Pure - no Figma API, fully fixture-testable.
 *
 * Findings are deduped here rather than inside each check (#118). Variants share
 * their layers, so one mistake in a shared layer is a separate node in every
 * variant, and a Tier 1 check emitting per node turns 6 real defects into 282
 * findings on a 64-variant set. Doing it at this boundary keeps every check a
 * plain per-node function with per-node fixtures, and gives all of them the fix
 * at once instead of asking each to invent its own aggregation key.
 */
export function runChecks(
  snapshot: ComponentSetSnapshot,
  requested?: CheckId[],
): RunOutcome {
  const ids = requested ?? CHECK_IDS;
  const results: CheckResult[] = [];
  const notImplemented: CheckId[] = [];

  for (const id of ids) {
    const fn = CHECK_REGISTRY[id];
    if (fn) {
      const result = fn(snapshot);
      results.push({ ...result, findings: dedupeFindings(result.findings) });
    } else {
      notImplemented.push(id);
    }
  }
  return { results, notImplemented };
}
