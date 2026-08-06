/**
 * Projects findings into the display shape the canvas checklist renders (issue
 * #93): one line per defect, with a count, in reporting order.
 *
 * The merging itself lives in `dedupeFindings` (#118), which `runChecks` already
 * applies to every check's output. This function only reshapes, and re-merges
 * only because doing so is idempotent and cheap - so a caller holding raw
 * per-node findings still gets a legible list.
 *
 * Keeping the merge in one place matters for more than duplication: it is what
 * stops the canvas and the reported payload describing the same defect
 * differently. Merging here as well used to redact a layer name that
 * `dedupeFindings` had deliberately kept, so a row read `"…" itemSpacing is 10`
 * while the JSON read `"Right Icon" itemSpacing is 10`.
 */

import { compareFindingPrecedence, dedupeFindings } from "./dedupe-findings";
import type { Finding, SeverityLevel } from "./types";

export interface GroupedFinding {
  /** Message as the merge left it: node-specific only where that is true. */
  message: string;
  severity: SeverityLevel;
  count: number;
  /**
   * The representative offender, carried through from the merge.
   *
   * Present so a consumer of the display shape can still reach the node the line
   * is about - the canvas checklist needs it to find the variant a finding sits
   * in, so it can show one. Taken from the representative `dedupeFindings`
   * already elects rather than re-derived: a second merge in the consumer is how
   * the canvas and the reported JSON start describing one defect two ways, which
   * has happened here before.
   *
   * It is a representative, not the only offender. `count` carries the true
   * magnitude.
   */
  nodeId: string;
  /**
   * The variants exhibiting this defect, and how many there are, when the
   * producing check declared them (#171). Absent for every check that does not,
   * and absent on a finding that merged - see `dedupeFindings`.
   */
  affectedVariantIds?: string[];
  affectedVariantCount?: number;
  /**
   * The variable mode this defect is about, when the producing check declared one
   * (#173). A sample of it has to be drawn with this mode pinned.
   */
  modeId?: string;
  modeName?: string;
}

/** One entry per defect, highest severity first (see `compareFindingPrecedence`). */
export function groupFindings(findings: readonly Finding[]): GroupedFinding[] {
  return dedupeFindings(findings)
    .map((finding) => ({
      message: finding.message,
      severity: finding.severity,
      count: finding.count ?? 1,
      nodeId: finding.nodeId,
      ...(finding.affectedVariantIds
        ? { affectedVariantIds: finding.affectedVariantIds }
        : {}),
      ...(finding.affectedVariantCount !== undefined
        ? { affectedVariantCount: finding.affectedVariantCount }
        : {}),
      // Both or neither: a mode id with no name would leave a caption unable to
      // say what it pinned, and a name with no id would claim a pin that never
      // happened.
      ...(finding.modeId && finding.modeName !== undefined
        ? { modeId: finding.modeId, modeName: finding.modeName }
        : {}),
    }))
    .sort(compareFindingPrecedence);
}
