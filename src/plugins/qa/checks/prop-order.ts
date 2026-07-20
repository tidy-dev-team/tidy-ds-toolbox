/**
 * #4 — variant properties must be declared in the canonical relative order
 * `Size → Variant → State → [booleans]` (`CANONICAL_PROP_ORDER` in
 * qa-config.ts). Only the relative order of the props actually present is
 * enforced — a partial subset (e.g. just Size + State) passes if Size
 * precedes State. Unknown/custom props may trail the known ones without
 * failing.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult } from "../types";
import { CANONICAL_PROP_ORDER } from "../qa-config";

export function checkPropOrder(snapshot: ComponentSetSnapshot): CheckResult {
  // Indices (within CANONICAL_PROP_ORDER) of the known props actually
  // present, in declaration order.
  const knownIndices = snapshot.propertyNames
    .map((name) => CANONICAL_PROP_ORDER.indexOf(name))
    .filter((index) => index >= 0);

  const isOrdered = knownIndices.every(
    (index, i) => i === 0 || index >= knownIndices[i - 1],
  );

  return {
    checkId: "prop-order",
    title: "Prop order (consolidated catalogue)",
    status: isOrdered ? "pass" : "fail",
    findings: isOrdered
      ? []
      : [
          {
            severity: "medium",
            nodeId: snapshot.id,
            nodeName: snapshot.name,
            message: `Component set "${snapshot.name}" declares variant properties out of the canonical order.`,
            expected: `Relative order: ${CANONICAL_PROP_ORDER.join(" → ")}`,
            actual: snapshot.propertyNames.join(", "),
          },
        ],
  };
}
