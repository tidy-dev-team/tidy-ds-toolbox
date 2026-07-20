/**
 * Pure check registry. Each Tier 1 check is a pure function
 * `(snapshot) → CheckResult` living in its own file under checks/ and
 * registered here — implementing a check never touches the collector,
 * the operation, or this run helper.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckId, CheckResult } from "../types";
import { CHECKS, getCheck } from "../types";
import { checkSetNameCasing } from "./set-name-casing";
import { checkInteractionHoverOnly } from "./interaction-hover-only";

export type CheckFn = (snapshot: ComponentSetSnapshot) => CheckResult;

/**
 * Tier 1 (issue #76) fills this in, one entry per check:
 *   "set-name-casing": checkSetNameCasing,
 *   ...
 */
export const CHECK_REGISTRY: Partial<Record<CheckId, CheckFn>> = {
  "set-name-casing": checkSetNameCasing,
  "interaction-hover-only": checkInteractionHoverOnly,
};

export interface RunOutcome {
  results: CheckResult[];
  notImplemented: CheckId[];
}

/** Ids of checks that are unknown to the catalogue (caller sent a bad filter). */
export function unknownCheckIds(requested: string[]): string[] {
  return requested.filter((id) => !getCheck(id));
}

/**
 * Run the requested checks (default: whole catalogue, in PRD order) against
 * one snapshot. Pure — no Figma API, fully fixture-testable.
 */
export function runChecks(
  snapshot: ComponentSetSnapshot,
  requested?: CheckId[],
): RunOutcome {
  const ids = requested ?? CHECKS.map((c) => c.id);
  const results: CheckResult[] = [];
  const notImplemented: CheckId[] = [];

  for (const id of ids) {
    const fn = CHECK_REGISTRY[id];
    if (fn) {
      results.push(fn(snapshot));
    } else {
      notImplemented.push(id);
    }
  }
  return { results, notImplemented };
}
