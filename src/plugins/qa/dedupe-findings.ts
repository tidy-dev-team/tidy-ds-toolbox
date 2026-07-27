/**
 * Collapses a check's per-node findings into one finding per *defect* (issue
 * #118), for the reported payload rather than for display.
 *
 * Variants of a component share their layers, so a single mistake in a shared
 * layer is a separate node in every variant. Measured on a real 64-variant
 * `Button`: row 5 reported **170** findings that were **4** defects, one layer
 * (`Right Icon`) accounting for 168 of them, and rows 9 and 10 added 56 each for
 * one defect apiece. 282 findings, 6 problems. A designer reading that cannot
 * tell how much work they have, and `tidy_qa_run` overflowed its result limit
 * twice while investigating it - 109,014 characters for `tokens` alone.
 *
 * **Why this is generic rather than per-check.** Tier 2 checks already aggregate
 * on the offending *thing* and carry `count`; Tier 1 predates that convention and
 * emits per node. Retrofitting fifteen checks individually would mean fifteen
 * keying decisions, when the Tier 1 problem is uniform: the same message,
 * expected and actual, on a different node. `findingKindKey` already encodes
 * exactly that identity for the canvas (#93), so this reuses it and every check
 * benefits at once. Checks stay simple and their fixtures stay per-node.
 *
 * `groupFindings` sums `count ?? 1`, so a deduped list groups on the canvas to
 * the same numbers as a raw one. Running both is safe, and this is idempotent.
 */

import {
  REDACTED_NODE_NAME,
  SEVERITY_RANK,
  findingKindKey,
  redactNodeName,
} from "./grouped-findings";
import type { Finding } from "./types";

/**
 * How many offending node ids a merged finding reports.
 *
 * Jump-to-node has to survive the merge, or the report becomes less actionable
 * than the noise it replaced. But the full list is unbounded, and `count`
 * already carries the true magnitude, so the ids are a working sample rather
 * than an inventory.
 */
export const MAX_REPORTED_NODE_IDS = 50;

interface Accumulator {
  representative: Finding;
  count: number;
  nodeIds: string[];
  /** Cleared once two findings in this group disagree on the node name. */
  sharedNodeName: string | undefined;
  severity: Finding["severity"];
}

/**
 * One finding per defect, highest severity first (ties broken by larger count,
 * then message, matching `groupFindings` so the payload and canvas agree).
 *
 * A merged finding keeps its representative's `nodeId` so existing callers still
 * have something to open, gains `nodeIds` for the rest, and gains `count`.
 * Singletons are returned untouched: adding `count: 1` and a one-element
 * `nodeIds` to every finding would bloat payloads to say nothing.
 */
export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const groups = new Map<string, Accumulator>();

  for (const finding of findings) {
    const key = findingKindKey(finding);
    const existing = groups.get(key);
    const count = finding.count ?? 1;

    if (!existing) {
      groups.set(key, {
        representative: finding,
        count,
        nodeIds: [...(finding.nodeIds ?? [finding.nodeId])],
        sharedNodeName: finding.nodeName,
        severity: finding.severity,
      });
      continue;
    }

    existing.count += count;
    if (existing.sharedNodeName !== finding.nodeName) {
      existing.sharedNodeName = undefined;
    }
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]) {
      existing.severity = finding.severity;
    }
    for (const id of finding.nodeIds ?? [finding.nodeId]) {
      if (existing.nodeIds.length >= MAX_REPORTED_NODE_IDS) break;
      if (!existing.nodeIds.includes(id)) existing.nodeIds.push(id);
    }
  }

  return Array.from(groups.values())
    .map(toFinding)
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (bySeverity !== 0) return bySeverity;
      const byCount = (b.count ?? 1) - (a.count ?? 1);
      if (byCount !== 0) return byCount;
      return a.message.localeCompare(b.message);
    });
}

function toFinding(group: Accumulator): Finding {
  const { representative, count, nodeIds, sharedNodeName, severity } = group;

  if (count === 1) return representative;

  // Every merged node shares the layer name, so keep it: on a shared layer it is
  // the most useful word in the finding, naming what to open. Redact only when
  // the name is what differed, where naming one of them would be a lie.
  const named = sharedNodeName !== undefined;

  return {
    ...representative,
    severity,
    nodeName: named ? representative.nodeName : REDACTED_NODE_NAME,
    message: named ? representative.message : redactNodeName(representative),
    count,
    nodeIds,
  };
}
