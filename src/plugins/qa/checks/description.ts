/**
 * #12 — component set description must document searchability aliases: an
 * `Also known as:` line and the misprint scrambled-keyword marker. Empty
 * description → `fail`. Missing alias line or missing misprint marker are
 * reported as separate findings (each → `warn`).
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult } from "../types";
import { ALSO_KNOWN_AS_PREFIX } from "../qa-config";

/**
 * Prefix of the line `addMisprintToDescription` writes
 * (src/plugins/utilities/utils/misprint.ts: `createMisprintText`). Kept as a
 * literal here — this file may only import from ../snapshot, ../types, and
 * ../qa-config — so update both in lockstep if the misprint format changes.
 */
const MISPRINT_MARKER_PREFIX =
  "---------------------------------------------------- misprint:";

export function checkDescription(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const description = snapshot.description ?? "";

  if (description.trim().length === 0) {
    return {
      checkId: "description",
      title: "Description (also-known-as + misprint keywords)",
      status: "fail",
      findings: [
        {
          severity: "medium",
          nodeId: snapshot.id,
          nodeName: snapshot.name,
          message: `Component set "${snapshot.name}" has an empty description.`,
          expected: `An "${ALSO_KNOWN_AS_PREFIX}" line and a misprint searchability marker.`,
          actual: "",
        },
      ],
    };
  }

  const lines = description.split("\n");
  const hasAliasLine = lines.some((line) =>
    line.startsWith(ALSO_KNOWN_AS_PREFIX),
  );
  const hasMisprintMarker = lines.some((line) =>
    line.startsWith(MISPRINT_MARKER_PREFIX),
  );

  const findings: CheckResult["findings"] = [];

  if (!hasAliasLine) {
    findings.push({
      severity: "low",
      nodeId: snapshot.id,
      nodeName: snapshot.name,
      message: `Component set "${snapshot.name}" description is missing an "${ALSO_KNOWN_AS_PREFIX}" line.`,
      expected: `${ALSO_KNOWN_AS_PREFIX} <alias 1>, <alias 2>`,
      actual: description,
    });
  }

  if (!hasMisprintMarker) {
    findings.push({
      severity: "low",
      nodeId: snapshot.id,
      nodeName: snapshot.name,
      message: `Component set "${snapshot.name}" description is missing the misprint searchability marker.`,
      expected: `${MISPRINT_MARKER_PREFIX} <scrambled text>`,
      actual: description,
    });
  }

  return {
    checkId: "description",
    title: "Description (also-known-as + misprint keywords)",
    status: findings.length === 0 ? "pass" : "warn",
    findings,
  };
}
