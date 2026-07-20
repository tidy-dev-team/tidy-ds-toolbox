/**
 * #2 — component set master name must be PascalCase (`Button`,
 * `NotificationTag`). Applies to the set/component master name only — never
 * to property names or layer names inside the tree (see #9 for those).
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult } from "../types";
import { SET_NAME_PATTERN } from "../qa-config";

export function checkSetNameCasing(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const isPascalCase = SET_NAME_PATTERN.test(snapshot.name);

  return {
    checkId: "set-name-casing",
    title: "Component set name casing",
    status: isPascalCase ? "pass" : "fail",
    findings: isPascalCase
      ? []
      : [
          {
            severity: "medium",
            nodeId: snapshot.id,
            nodeName: snapshot.name,
            message: `Component set name "${snapshot.name}" is not PascalCase.`,
            expected: "PascalCase, e.g. Button, NotificationTag",
            actual: snapshot.name,
          },
        ],
  };
}
