/**
 * #2 - component set master name must be PascalCase (`Button`,
 * `NotificationTag`) or kebab-case (`notification-tag`). Applies to the
 * set/component master name only - never to property names or layer names
 * inside the tree (see #9 for those).
 *
 * Both forms are legal because design named both (2026-08-04, on the rendered
 * `button` checklist). The earlier PascalCase-only rule was never her
 * requirement: `docs/qa-source-interview.md` records `Button` with a capital B
 * as an *example of matching dev*, and this comment is the first time the rule
 * itself was stated. The forms live in `qa-config`; this check only reports.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult } from "../types";
import { isLegalSetName, SET_NAME_EXPECTED } from "../qa-config";

export function checkSetNameCasing(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const isLegal = isLegalSetName(snapshot.name);

  return {
    checkId: "set-name-casing",
    title: "Component set name casing",
    status: isLegal ? "pass" : "fail",
    findings: isLegal
      ? []
      : [
          {
            severity: "medium",
            nodeId: snapshot.id,
            nodeName: snapshot.name,
            message: `Component set name "${snapshot.name}" is neither PascalCase nor kebab-case.`,
            expected: SET_NAME_EXPECTED,
            actual: snapshot.name,
          },
        ],
  };
}
