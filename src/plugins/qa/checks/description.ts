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
 *
 * It also *recommends* a Storybook link when it finds none (design, 2026-08-04:
 * _"also check if there is a link for story book and recommend to add it"_).
 * Recommend is the operative word: the finding is `low` and never moves the row
 * to `fail`, because a component with no Storybook entry yet is a normal state
 * and not a defect in the Figma component. This stays distinct from #1
 * (Storybook alignment), which compares the implementations and is manual by
 * design, and from #19, which reviews documentation content.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult, Finding } from "../types";
import {
  ALSO_KNOWN_AS_PREFIX,
  STORYBOOK_HINT,
  STORYBOOK_URL_PATTERN,
} from "../qa-config";
import { MISPRINT_MARKER, parseMisprintMarker } from "../../../shared/misprint";

/**
 * The Storybook recommendation, or nothing when a link is already present.
 *
 * Looks in both places a link legitimately lives: the description prose, and
 * Figma's own documentation-link field. Checking only the description — where
 * design's comment was pinned — would report a link recorded in the proper
 * field as missing, which would train reviewers to ignore the row.
 */
function storybookFinding(
  snapshot: ComponentSetSnapshot,
  description: string,
): Finding | undefined {
  const inDescription = STORYBOOK_URL_PATTERN.test(description);
  const inLinks = (snapshot.documentationLinks ?? []).some((uri) =>
    STORYBOOK_HINT.test(uri),
  );
  if (inDescription || inLinks) return undefined;

  return {
    severity: "low",
    nodeId: snapshot.id,
    nodeName: snapshot.name,
    message: `Component set "${snapshot.name}" has no Storybook link. Consider adding one.`,
    expected:
      "A Storybook URL in the description or in Figma's documentation link field.",
    actual: "no Storybook link found",
  };
}

export function checkDescription(snapshot: ComponentSetSnapshot): CheckResult {
  const description = snapshot.description ?? "";
  const storybook = storybookFinding(snapshot, description);

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
        // Still reported here: an empty description does not mean the set has
        // no documentation link, and the recommendation is about the link
        // rather than about the prose.
        ...(storybook ? [storybook] : []),
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

  if (storybook) findings.push(storybook);

  return {
    checkId: "description",
    title: "Description (also-known-as + misprint keywords)",
    status: findings.length === 0 ? "pass" : "warn",
    findings,
  };
}
