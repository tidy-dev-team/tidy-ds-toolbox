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
 * expected and actual, on a different node. One pass at the `runChecks` boundary
 * fixes all of them, and checks stay simple with per-node fixtures.
 *
 * **This module owns what "the same defect" means**, for every consumer.
 * The canvas checklist had its own merge (#93); it now projects this one instead,
 * because two definitions let the canvas and the payload describe one defect
 * differently - a row read `"…" itemSpacing is 10` while the JSON read
 * `"Right Icon" itemSpacing is 10`. Deduping is idempotent, so applying it again
 * downstream is safe.
 */

import type { Finding, SeverityLevel } from "./types";

export const SEVERITY_RANK: Record<SeverityLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** Stand-in for a node name that differed across the findings being merged. */
export const REDACTED_NODE_NAME = "…";

/**
 * Blanks the finding's own quoted node name so per-node repeats collapse into
 * one kind, while leaving any other quoted text (fixed literals like the
 * `"Also known as:"` line name) untouched.
 */
export function redactNodeName(finding: Finding): string {
  if (!finding.nodeName) return finding.message;
  return finding.message
    .split(`"${finding.nodeName}"`)
    .join(`"${REDACTED_NODE_NAME}"`);
}

/**
 * Identity of a finding's *kind*, ignoring which node it landed on.
 *
 * **Keyed on the defect, not on the layer.** Issue #118 suggested "the shared
 * layer plus the property" as the key. Deliberately not that: keying on the layer
 * name would stop deduping the moment a set names its layers individually, which
 * is the volume problem all over again, and `renderChecklist` already warns about
 * sets with many genuinely distinct kinds. Keying on the defect alone always
 * collapses, and `toFinding` recovers what the layer key was wanted for by
 * keeping the layer name in the message whenever every merged node shares it.
 * The name leaves the message only when it genuinely differed, where no single
 * name was true anyway - and `nodeNames` then reports which, so nothing is lost
 * beyond the convenience of reading it inline.
 */
export function findingKindKey(finding: Finding): string {
  // JSON-encoded so the parts stay unambiguous even if a message contains
  // whatever plain separator we'd otherwise join on.
  return JSON.stringify([
    redactNodeName(finding),
    finding.expected ?? "",
    finding.actual ?? "",
  ]);
}

/**
 * Reporting precedence: highest severity first, then larger count, then message
 * for stable ordering. One definition, so the payload and the canvas cannot
 * disagree about which defect leads.
 */
export function compareFindingPrecedence(
  a: Pick<Finding, "severity" | "count" | "message">,
  b: Pick<Finding, "severity" | "count" | "message">,
): number {
  const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (bySeverity !== 0) return bySeverity;
  const byCount = (b.count ?? 1) - (a.count ?? 1);
  if (byCount !== 0) return byCount;
  return a.message.localeCompare(b.message);
}

/**
 * How many offending nodes a merged finding names or points at.
 *
 * Jump-to-node has to survive the merge, or the report becomes less actionable
 * than the noise it replaced. But `count` already carries the true magnitude, so
 * these are a working sample rather than an inventory: measured on the real
 * Button, a 50-id cap made the id lists the bulk of the very payload deduping was
 * meant to shrink, and nobody walks the 11th id by hand.
 */
export const MAX_REPORTED_NODES = 10;

interface Accumulator {
  representative: Finding;
  count: number;
  /**
   * How many findings folded in here - not `count`, which sums the occurrences
   * those findings already stood for. A single pre-deduped finding arrives with
   * `count: 18` and `absorbed: 1`, and only `absorbed` distinguishes it from
   * eighteen findings that merged.
   */
  absorbed: number;
  nodeIds: string[];
  /** Distinct names seen, in encounter order - only reported when they differ. */
  nodeNames: string[];
  /** Cleared once two findings in this group disagree on the node name. */
  sharedNodeName: string | undefined;
  severity: Finding["severity"];
}

/** Appends up to the cap, ignoring repeats. */
function collect(into: string[], value: string): void {
  if (into.length >= MAX_REPORTED_NODES) return;
  if (!into.includes(value)) into.push(value);
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
      const accumulator: Accumulator = {
        representative: finding,
        count,
        absorbed: 1,
        nodeIds: [],
        nodeNames: [],
        sharedNodeName: finding.nodeName,
        severity: finding.severity,
      };
      absorb(accumulator, finding);
      groups.set(key, accumulator);
      continue;
    }

    existing.count += count;
    existing.absorbed += 1;
    if (existing.sharedNodeName !== finding.nodeName) {
      existing.sharedNodeName = undefined;
    }
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]) {
      existing.severity = finding.severity;
    }
    absorb(existing, finding);
  }

  return Array.from(groups.values())
    .map(toFinding)
    .sort(compareFindingPrecedence);
}

/** Folds one finding's nodes into the group it belongs to. */
function absorb(group: Accumulator, finding: Finding): void {
  for (const id of finding.nodeIds ?? [finding.nodeId]) {
    collect(group.nodeIds, id);
  }
  for (const name of finding.nodeNames ?? [finding.nodeName]) {
    collect(group.nodeNames, name);
  }
}

function toFinding(group: Accumulator): Finding {
  const {
    representative,
    count,
    absorbed,
    nodeIds,
    nodeNames,
    sharedNodeName,
    severity,
  } = group;

  if (count === 1) return representative;

  // Affected variants are dropped the moment two findings actually merge (#171).
  // The representative's set speaks for the representative, and the union of the
  // group's sets is unknowable here: summing the counts double-counts variants two
  // findings share, while the union of the id lists is capped and would understate
  // it. A merged finding therefore shows no sample, which is the honest outcome -
  // no sample costs a reader nothing, a wrong denominator costs them trust.
  //
  // Neither producer can reach this today: both emit one finding per property or
  // per colour pair, each with its own message, so no two share a kind key.
  //
  // `modeId`/`modeName` are deliberately *not* dropped alongside them, and the
  // asymmetry is not an oversight. A merge groups findings by kind, and the kind
  // key is derived from the message, which for a mode-specific finding names the
  // mode - so two findings that merge already agree about it, and the
  // representative's mode speaks for the group. The variant set is the opposite:
  // nothing in the key constrains it, so each merged finding brought its own.
  //
  // Destructured away rather than set to undefined, so the keys are absent
  // entirely and a merged finding is indistinguishable from one that never
  // carried them.
  const {
    affectedVariantIds: _droppedIds,
    affectedVariantCount: _droppedCount,
    ...withoutVariants
  } = representative;
  const base = absorbed > 1 ? withoutVariants : representative;

  // Keep the layer name when every merged node shares it: on a shared layer it is
  // the most useful word in the finding, naming what to open. Redact only when
  // the name is what differed, where naming one of them would be a lie.
  const nodeNameIsShared = sharedNodeName !== undefined;

  return {
    ...base,
    severity,
    nodeName: nodeNameIsShared ? representative.nodeName : REDACTED_NODE_NAME,
    message: nodeNameIsShared
      ? representative.message
      : redactNodeName(representative),
    count,
    nodeIds,
    // Only when the message had to give the name up. Two variant roots with a
    // hardcoded fill merged to `"…"` on the real Button, and the finding then no
    // longer said *which* - the names carry that back without pretending one of
    // them speaks for all.
    ...(nodeNameIsShared ? {} : { nodeNames }),
  };
}
