/**
 * Pure check registry. Each Tier 1 check is a pure function
 * `(snapshot) → CheckResult` living in its own file under checks/ and
 * registered here — implementing a check never touches the collector,
 * the operation, or this run helper.
 */

import { dedupeFindings } from "../dedupe-findings";
import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckId, CheckResult } from "../types";
import { CHECKS, getCheck } from "../types";
import { checkSetNameCasing } from "./set-name-casing";
import { checkPropOrder } from "./prop-order";
import { checkInteractionHoverOnly } from "./interaction-hover-only";
import { checkNoConflicts } from "./no-conflicts";
import { checkDescription } from "./description";
import { checkPreferredValues } from "./preferred-values";
import { checkTokens } from "./tokens";
import { checkGrid4px } from "./grid-4px";
import { checkLayerNamingStructure } from "./layer-naming-structure";
import { checkNestingDepth } from "./nesting-depth";
import { checkAssetProvenance } from "./asset-provenance";
import { checkThemes } from "./themes";
import { checkHighContrast } from "./high-contrast";
import { checkResponsiveBounds } from "./responsive-bounds";
import { checkDocumentation } from "./documentation";
import { checkVariantPropertyBindings } from "./variant-property-bindings";

export type CheckFn = (snapshot: ComponentSetSnapshot) => CheckResult;

/**
 * Tier 1 (issue #76) fills this in, one entry per check:
 *   "set-name-casing": checkSetNameCasing,
 *   ...
 */
export const CHECK_REGISTRY: Partial<Record<CheckId, CheckFn>> = {
  "set-name-casing": checkSetNameCasing,
  "prop-order": checkPropOrder,
  "interaction-hover-only": checkInteractionHoverOnly,
  "no-conflicts": checkNoConflicts,
  description: checkDescription,
  "preferred-values": checkPreferredValues,
  tokens: checkTokens,
  "grid-4px": checkGrid4px,
  "layer-naming-structure": checkLayerNamingStructure,
  "nesting-depth": checkNestingDepth,
  "asset-provenance": checkAssetProvenance,
  themes: checkThemes,
  "high-contrast": checkHighContrast,
  "responsive-bounds": checkResponsiveBounds,
  documentation: checkDocumentation,
  "variant-property-bindings": checkVariantPropertyBindings,
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
 *
 * Findings are deduped here rather than inside each check (#118). Variants share
 * their layers, so one mistake in a shared layer is a separate node in every
 * variant, and a Tier 1 check emitting per node turns 6 real defects into 282
 * findings on a 64-variant set. Doing it at this boundary keeps every check a
 * plain per-node function with per-node fixtures, and gives all fifteen the fix
 * at once instead of asking each to invent its own aggregation key.
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
      const result = fn(snapshot);
      results.push({ ...result, findings: dedupeFindings(result.findings) });
    } else {
      notImplemented.push(id);
    }
  }
  return { results, notImplemented };
}
