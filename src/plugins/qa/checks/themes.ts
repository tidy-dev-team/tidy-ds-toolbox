/**
 * #17 - Themes (issue #102). Does every variable this set uses actually
 * resolve in every mode of the theme?
 *
 * **Scope: resolution integrity only.** Legibility is #16's, and invisible
 * text is just contrast 1.0 - reporting it here as well would describe one
 * defect twice in two rows. So there is no contrast maths in this check at all.
 * Raw unbound values belong to `tokens`, and flagging colours bound to a
 * single-mode collection as "not theme-aware" is deliberately out of scope: a
 * real concern, but a false-positive factory until it is narrowed much harder.
 *
 * Two `fail` classes, kept apart because they have different fixes:
 *
 * 1. **No value for a mode** - the variable has no entry for that mode, the
 *    classic missing override on an extended collection.
 * 2. **Unresolvable alias chain** - Figma could not follow the aliases to a
 *    concrete value in that mode (dangling target, broken remote variable).
 *
 * Both come from the resolution probe (see theme-probe.ts): Figma performs the
 * resolution against a temporary frame with explicit modes set, so this check
 * reads observations rather than reimplementing mode inheritance.
 *
 * **The probe's blind spot is reported, not hidden.** It resolves against a
 * frame carrying no explicit modes of its own, so where nodes in the set pin
 * their own mode the probe's answer may not be what renders. Those nodes
 * produce a `warn` rather than a confidently wrong value.
 *
 * **Which collection is "the theme"** comes from the shared selection helper
 * (most modes), so QA and the generated documentation pages cannot disagree.
 * Because that is a heuristic, the result states which collection and modes it
 * evaluated in `note` - a wrong pick has to be visible on the row instead of
 * silently producing green.
 *
 * Findings are one per **variable × mode** with an occurrence count of the
 * consuming usages (#100), never one row per consuming node.
 */

import type { ComponentSetSnapshot } from "../snapshot";
import type { CheckResult, CheckStatus, Finding } from "../types";
import { collectVariableUsage, nodesPinning } from "../variable-usage";

const TITLE = "Themes (per-mode variable resolution)";

export function checkThemes(snapshot: ComponentSetSnapshot): CheckResult {
  const theme = snapshot.theme;

  // No probe table (no bound variables, or no collection with modes), or a
  // single-mode collection - which is not a theme, and comparing one mode
  // against itself would report nothing meaningful.
  if (!theme || theme.modes.length < 2) {
    return {
      checkId: "themes",
      title: TITLE,
      status: "not_applicable",
      findings: [],
    };
  }

  const usage = collectVariableUsage(snapshot);
  const findings: Finding[] = [];

  for (const [variableId, variable] of Object.entries(theme.variables)) {
    // A variable the probe resolved but this set never consumes (a style may
    // reference it) has nothing to report against here.
    const consumer = usage.get(variableId);
    if (!consumer) continue;
    const { count, nodeId, nodeName } = consumer;

    for (const mode of theme.modes) {
      const resolution = variable.byMode[mode.modeId];
      if (!resolution || resolution.ok) continue;

      const where = `variable "${variable.name}" in mode "${mode.name}"`;
      findings.push(
        resolution.reason === "unresolved-alias"
          ? {
              severity: "high",
              // A representative consuming layer, matching the convention the
              // other Tier 2 checks set: the finding keys on the variable, but
              // "jump to offender" still has to land somewhere real.
              nodeId,
              nodeName,
              message: `The alias chain for ${where} cannot be resolved to a concrete value.`,
              expected: `a resolvable value in every mode of "${theme.collectionName}"`,
              actual: "alias chain does not resolve",
              suggestedFix:
                "Re-point the alias at a live variable, or restore the missing target in the source collection.",
              count,
            }
          : {
              severity: "high",
              nodeId,
              nodeName,
              message: `There is no value for ${where}.`,
              expected: `a value in every mode of "${theme.collectionName}"`,
              actual: "no value for this mode",
              suggestedFix:
                "Give the variable a value for this mode (an extended collection needs the override set explicitly).",
              count,
            },
      );
    }
  }

  const resolutionFailures = findings.length;

  // Only nodes pinning a mode of *this* collection: a node pinning a density
  // or unit mode says nothing about whether the theme resolved, so counting it
  // would raise the caveat on components that are perfectly verifiable.
  //
  // Reported alongside any real failures rather than instead of them: the
  // caveat narrows what the *rest* of the row is worth, so dropping it when
  // something else failed would overstate the remaining green.
  const pinnedNodes = nodesPinning(snapshot, theme.collectionId);
  for (const pinned of pinnedNodes) {
    findings.push({
      severity: "medium",
      nodeId: pinned.id,
      nodeName: pinned.name,
      message: `Layer "${pinned.name}" pins its own explicit mode, so per-mode results for it are unverified.`,
      expected:
        "modes inherited from the page/frame, so every mode can be evaluated",
      actual: "an explicit mode pinned on the layer",
      suggestedFix:
        "Clear the explicit mode unless it is deliberate; otherwise verify this layer by eye in each theme.",
      count: 1,
    });
  }

  const modeList = theme.modes.map((m) => m.name).join(", ");
  const note = `Evaluated collection "${theme.collectionName}" across ${theme.modes.length} modes: ${modeList}. The theme collection is picked as the bound collection with the most modes; if that is the wrong collection here, these results describe the wrong axis.`;

  findings.sort((a, b) => a.message.localeCompare(b.message));

  const status: CheckStatus =
    resolutionFailures > 0 ? "fail" : pinnedNodes.length > 0 ? "warn" : "pass";

  return {
    checkId: "themes",
    title: TITLE,
    status,
    findings,
    note,
  };
}
