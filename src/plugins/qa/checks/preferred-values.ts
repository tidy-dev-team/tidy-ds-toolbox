/**
 * #15 — every INSTANCE_SWAP component property should ship a populated
 * preferred-values list. Warns on an empty list; not_applicable when the set
 * exposes no INSTANCE_SWAP props at all.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";

export function checkPreferredValues(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const instanceSwapProps = snapshot.properties.filter(
    (prop) => prop.type === "INSTANCE_SWAP",
  );

  if (instanceSwapProps.length === 0) {
    return {
      checkId: "preferred-values",
      title: "Preferred values",
      status: "not_applicable",
      findings: [],
    };
  }

  const findings: Finding[] = instanceSwapProps
    .filter((prop) => !prop.preferredValuesCount)
    .map((prop) => ({
      severity: "medium",
      nodeId: snapshot.id,
      nodeName: prop.name,
      message: `Instance-swap property "${prop.name}" has no preferred values.`,
      expected: "At least one preferred value",
      actual: "0 preferred values",
    }));

  return {
    checkId: "preferred-values",
    title: "Preferred values",
    status: findings.length > 0 ? "warn" : "pass",
    findings,
  };
}
