/**
 * Groups a check's raw per-node Finding[] into deduped summary lines for the
 * canvas checklist (issue #93). A 64-variant set can produce hundreds of
 * findings that differ only by which node they hit ("width (14) on 'X' is
 * off grid" repeated per offending layer) — grouping collapses those into one
 * line with a count, ordered by severity, so the rendered row stays legible.
 *
 * Findings are grouped by their message with the finding's own node name
 * blanked out, plus expected/actual — a generic key that works across all
 * checks without each check having to declare its own grouping kind.
 *
 * Only the node name is redacted (not every quoted span), so fixed literals a
 * message quotes — e.g. the `"Also known as:"` line name in the description
 * check — stay visible instead of collapsing to `"…"`.
 */

import type { Finding, SeverityLevel } from "./types";

export interface GroupedFinding {
  /** Representative message with node-specific quoted text redacted. */
  message: string;
  severity: SeverityLevel;
  count: number;
}

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// Blanks the finding's own quoted node name so per-node repeats collapse into
// one line, while leaving any other quoted text (fixed literals like the
// `"Also known as:"` line name) untouched.
function redactNodeName(finding: Finding): string {
  if (!finding.nodeName) return finding.message;
  return finding.message.split(`"${finding.nodeName}"`).join('"…"');
}

function groupKey(finding: Finding): string {
  // JSON-encoded so the parts stay unambiguous even if a message contains
  // whatever plain separator we'd otherwise join on.
  return JSON.stringify([
    redactNodeName(finding),
    finding.expected ?? "",
    finding.actual ?? "",
  ]);
}

/**
 * Dedupe/group findings by kind, highest severity first (ties broken by
 * larger count first, then by message for stable ordering).
 */
export function groupFindings(findings: readonly Finding[]): GroupedFinding[] {
  const groups = new Map<string, GroupedFinding>();

  for (const finding of findings) {
    const key = groupKey(finding);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]) {
        existing.severity = finding.severity;
      }
    } else {
      groups.set(key, {
        message: redactNodeName(finding),
        severity: finding.severity,
        count: 1,
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byCount = b.count - a.count;
    if (byCount !== 0) return byCount;
    return a.message.localeCompare(b.message);
  });
}
