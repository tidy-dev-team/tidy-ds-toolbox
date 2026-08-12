/**
 * #13 — no two COMPONENT children of a set may share the exact same
 * variant-property combination (e.g. two children both `Size=Medium,
 * Variant=Primary, State=Default`). Standalone components (no variants)
 * pass trivially — there is nothing to compare.
 *
 * Two ways to fail, and the row reports both at once. The arithmetic below
 * finds a duplicate the snapshot can see. Figma itself can also refuse to
 * report a combination at all, which it does only once it has already decided
 * the set holds a conflict - a refusal is therefore a finding in its own right,
 * and it names how many variants it covers so a partial answer cannot read as a
 * complete one.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";
import {
  readableVariants,
  refusalReason,
  unreadableVariants,
} from "../variant-properties";

function comboKey(variantProperties: Record<string, string>): string {
  return Object.keys(variantProperties)
    .sort()
    .map((key) => `${key}=${variantProperties[key]}`)
    .join(", ");
}

/**
 * The finding for variants Figma would not report a combination for.
 *
 * Raised whenever any read was refused, and raised alongside whatever the
 * arithmetic found rather than instead of it. Figma only refuses once it has
 * decided the set holds a conflict, so the refusal is itself the defect this
 * row reports - but it names how many variants it covers, so a reader can tell
 * a complete answer from a partial one.
 */
function unreadableFinding(
  snapshot: ComponentSetSnapshot,
): Finding | undefined {
  const unreadable = unreadableVariants(snapshot);
  if (unreadable.length === 0) return undefined;

  const reason = refusalReason(snapshot) ?? "Figma gave no reason.";
  const scope =
    unreadable.length === snapshot.variants.length
      ? `all ${unreadable.length} variant(s)`
      : `${unreadable.length} of ${snapshot.variants.length} variant(s)`;

  return {
    severity: "high",
    nodeId: snapshot.id,
    nodeName: snapshot.name,
    message: `Figma flags this set as having a conflicting variant combination and refused to report the combination of ${scope} (${reason}). Open the Variants panel in Figma to find the duplicate.`,
    expected: "Unique variant-property combination per component",
    actual: "unreadable - Figma-flagged conflict",
  };
}

export function checkNoConflicts(snapshot: ComponentSetSnapshot): CheckResult {
  if (snapshot.variants.length <= 1) {
    return {
      checkId: "no-conflicts",
      title: "No conflicts",
      status: "not_applicable",
      note: "This has fewer than two variants, so there is no second property combination it could collide with.",
      findings: [],
    };
  }

  // Only the variants whose combination is actually known. An unreadable one
  // carries `{}`, and letting those through would group them all under the
  // empty key and report a duplicate that no one can find in the panel.
  const byCombo = new Map<string, typeof snapshot.variants>();
  for (const variant of readableVariants(snapshot)) {
    const key = comboKey(variant.variantProperties);
    const group = byCombo.get(key);
    if (group) {
      group.push(variant);
    } else {
      byCombo.set(key, [variant]);
    }
  }

  const refused = unreadableFinding(snapshot);
  const findings: Finding[] = refused ? [refused] : [];
  for (const [key, group] of byCombo) {
    if (group.length > 1) {
      for (const variant of group) {
        findings.push({
          severity: "high",
          nodeId: variant.id,
          nodeName: variant.name,
          message: `Duplicate variant-property combination "${key}" — shared with ${group.length - 1} other variant(s).`,
          expected: "Unique variant-property combination per component",
          actual: key,
        });
      }
    }
  }

  return {
    checkId: "no-conflicts",
    title: "No conflicts",
    status: findings.length > 0 ? "fail" : "pass",
    findings,
  };
}
