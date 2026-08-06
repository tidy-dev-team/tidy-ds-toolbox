/**
 * The optional `Finding` fields that exist so the canvas can draw a picture of a
 * defect (#171, #173), and the rules for filling and reading them.
 *
 * Here rather than in `types.ts` because these are values, not types, and the cap
 * they need lives in `dedupe-findings.ts` - which imports `types.ts`, so putting
 * them there would close a cycle.
 *
 * Every function in this file exists because the same rule was otherwise written
 * out at each site that needed it, and the copies disagreed:
 *
 * - the "both or neither" rule for a mode was stated three times, and the three
 *   differed over an empty mode name, so one layer forwarded a mode the next
 *   refused to pin;
 * - the cap-and-count rule for affected variants was implemented once per
 *   producing check, with the cap and the reasoning copied alongside it.
 *
 * Both are claims the rendered frame makes to a reader about how much of a problem
 * it is showing. One implementation each is the point.
 */

import { MAX_REPORTED_NODES } from "./dedupe-findings";
import type { Finding } from "./types";

/** A variable mode a finding is about: an id to pin, and a name to print. */
export interface FindingMode {
  id: string;
  name: string;
}

/**
 * The mode a finding is about, or undefined when it is not about one.
 *
 * An empty id or name counts as absent. `evaluatedModes` in the contrast check
 * falls back to a single anonymous mode for a set painted in literal hex, and
 * pinning "" would be pinning nothing while claiming otherwise.
 */
export function findingMode(
  finding: Pick<Finding, "modeId" | "modeName">,
): FindingMode | undefined {
  if (!finding.modeId || !finding.modeName) return undefined;
  return { id: finding.modeId, name: finding.modeName };
}

/** The mode fields to spread onto a finding or its display projection. */
export function modeFields(
  finding: Pick<Finding, "modeId" | "modeName">,
): Pick<Finding, "modeId" | "modeName"> {
  const mode = findingMode(finding);
  return mode ? { modeId: mode.id, modeName: mode.name } : {};
}

/**
 * The affected-variant fields for a finding covering `variantIds`.
 *
 * Deduplicates and preserves order, so the first id is a deterministic choice
 * rather than whichever the caller happened to encounter first.
 *
 * The ids are capped and the count is not, and that asymmetry is the whole reason
 * both fields exist. The ids are a working sample for the canvas to draw one of;
 * the count is the number a caption prints, and a denominator read off a capped
 * list would report the cap and shrink as the defect grew.
 */
export function affectedVariants(
  variantIds: Iterable<string>,
): Pick<Finding, "affectedVariantIds" | "affectedVariantCount"> {
  const distinct: string[] = [];
  for (const id of variantIds) {
    if (!distinct.includes(id)) distinct.push(id);
  }
  return {
    affectedVariantIds: distinct.slice(0, MAX_REPORTED_NODES),
    affectedVariantCount: distinct.length,
  };
}
