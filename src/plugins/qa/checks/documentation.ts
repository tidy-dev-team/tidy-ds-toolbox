/**
 * #19 - documentation. A yes/no item, and deliberately one that cannot fail.
 *
 * Design's framing is that QA routinely runs *before* documentation exists
 * ("many times we do QA before documentation, because it's often only a later
 * stage" - docs/qa-source-interview.md#19-documentation), so an undocumented
 * component is the normal mid-process state, not a defect. Reporting it as
 * `fail`, or even `warn`, would put an amber row on most runs and teach the
 * designer to skip it, the same failure mode #16 avoids with its skip tally.
 *
 * So: links present → `pass`; none → `not_applicable` with a note saying what
 * was looked for. The row stops being a manual tick either way, which is the
 * whole ask.
 *
 * A `manualRemainder` rides along **only on `pass`**. The row's blurb claims
 * something about the documentation's *content*, which this check cannot see, so
 * a link needs a human to confirm it actually covers usage and properties. With
 * no documentation there is nothing to read, and asking for a content review
 * there would contradict the whole point of not treating absence as a defect.
 *
 * **The signal is Figma's own documentation-link field**, the only
 * machine-readable "this component is documented" marker the plugin API
 * exposes. Design described item 19 as a stage rather than a field, so if their
 * documentation lives somewhere else (a linked page, a Storybook URL in the
 * description, which is #12's business), this check is looking in the wrong
 * place and the note is what makes that visible rather than silently green.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult } from "../types";

const TITLE = "Documentation";

export function checkDocumentation(
  snapshot: ComponentSetSnapshot,
): CheckResult {
  const links = snapshot.documentationLinks ?? [];

  if (links.length === 0) {
    return {
      checkId: "documentation",
      title: TITLE,
      status: "not_applicable",
      findings: [],
      note:
        "No documentation link is set on this component. QA commonly runs " +
        "before documentation, so this is not reported as a defect. Only " +
        "Figma's documentation-link field is checked. Documentation held " +
        "elsewhere would not be seen here.",
    };
  }

  return {
    checkId: "documentation",
    title: TITLE,
    status: "pass",
    findings: [],
    note: `Documentation link set: ${links.join(", ")}.`,
    manualRemainder:
      "Read the documentation and confirm it covers usage, examples and " +
      "properties. Only the presence of a link is checked automatically.",
  };
}
