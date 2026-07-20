/**
 * #13 — no two COMPONENT children of a set may share the exact same
 * variant-property combination (e.g. two children both `Size=Medium,
 * Variant=Primary, State=Default`). Standalone components (no variants)
 * pass trivially — there is nothing to compare.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";

function comboKey(variantProperties: Record<string, string>): string {
  return Object.keys(variantProperties)
    .sort()
    .map((key) => `${key}=${variantProperties[key]}`)
    .join(", ");
}

export function checkNoConflicts(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  if (snapshot.variants.length <= 1) {
    return {
      checkId: "no-conflicts",
      title: "No conflicts",
      status: "not_applicable",
      findings: [],
    };
  }

  const byCombo = new Map<string, typeof snapshot.variants>();
  for (const variant of snapshot.variants) {
    const key = comboKey(variant.variantProperties);
    const group = byCombo.get(key);
    if (group) {
      group.push(variant);
    } else {
      byCombo.set(key, [variant]);
    }
  }

  const findings: Finding[] = [];
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
