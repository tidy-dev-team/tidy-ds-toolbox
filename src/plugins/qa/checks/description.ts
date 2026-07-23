/**
 * #12 — component set description must document searchability aliases: an
 * `Also known as:` line and the misprint scrambled-keyword marker. Empty
 * description → `fail`. A missing alias line, a missing marker, or a marker
 * whose payload doesn't match the node's current name are reported as separate
 * findings (each → `warn`).
 *
 * Marker detection + payload validation come from `shared/misprint` (issue
 * #98) — the single source of truth shared with the writer, so the check stays
 * in lockstep with the format and catches stale/renamed misprints, not just
 * missing ones.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult } from "../types";
import { ALSO_KNOWN_AS_PREFIX } from "../qa-config";
import {
  MISPRINT_MARKER,
  parseMisprintMarker,
} from "../../../shared/misprint";

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
  const marker = parseMisprintMarker(description, snapshot.name);

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

  if (!marker.present) {
    findings.push({
      severity: "low",
      nodeId: snapshot.id,
      nodeName: snapshot.name,
      message: `Component set "${snapshot.name}" description is missing the misprint searchability marker.`,
      expected: `${MISPRINT_MARKER} <scrambled text>`,
      actual: description,
    });
  } else if (!marker.correct) {
    // Present but wrong — a stale/renamed/mis-applied misprint. Distinct from
    // "missing" so it surfaces as its own finding.
    findings.push({
      severity: "low",
      nodeId: snapshot.id,
      nodeName: snapshot.name,
      message: `Component set "${snapshot.name}" misprint marker does not match the current name (stale or mis-applied).`,
      expected: marker.expected,
      actual: marker.actual,
    });
  }

  return {
    checkId: "description",
    title: "Description (also-known-as + misprint keywords)",
    status: findings.length === 0 ? "pass" : "warn",
    findings,
  };
}
