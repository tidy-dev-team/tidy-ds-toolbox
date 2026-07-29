/**
 * #17 - Themes (issue #102). Does every variable this set uses actually
 * resolve in every mode of the theme?
 *
 * **The visual half stays a human tick.** The source ask was that for every mode
 * the component has, it works and *looks good* in all of them. Resolution
 * integrity is a strictly weaker claim, so every reported outcome carries a
 * `manualRemainder` naming the modes to look at (#115).
 *
 * **Conditional, on #19's logic rather than #7's.** `not_applicable` here means
 * no theme collection, a single-mode collection, or nothing this set binds being
 * theme-aware - and in all three the component renders identically in every mode,
 * so there is nothing to compare by eye. #7's remainder is unconditional because
 * a set that cannot hold bounds can still break when resized; a set with no theme
 * axis genuinely has no modes to review.
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
import {
  bindsOwnThemeVariables,
  collectVariableUsage,
  nodesPinning,
} from "../variable-usage";

const TITLE = "Themes (per-mode variable resolution)";

export function checkThemes(snapshot: ComponentSetSnapshot): CheckResult {
  const theme = snapshot.theme;

  const unavailable = theme?.unavailableVariableIds ?? [];
  const usage = collectVariableUsage(snapshot);

  // No probe table (no bound variables), or a single-mode collection, which is
  // not a theme: comparing one mode against itself reports nothing meaningful.
  // Bindings Figma could not load are the exception, since those are broken
  // regardless of how many modes exist.
  //
  // The table can also exist while holding nothing this set binds: #16 has the
  // probe resolve variables reached only through a shared fill style. Those are
  // not this component's bindings, so a set whose colour comes entirely from
  // styles has nothing for *this* check to judge - reporting `pass` off the
  // back of them would claim a verification that never happened.
  const consumed = bindsOwnThemeVariables(snapshot, theme);
  // The three causes are reported separately rather than sharing one string.
  // "This component has no theme axis" and "we could not check" are materially
  // different statements to a designer, and the row is where that distinction
  // has to survive - the chip says only "n/a" (#129).
  const notApplicable = (note: string): CheckResult => ({
    checkId: "themes",
    title: TITLE,
    status: "not_applicable",
    note,
    findings: [],
  });

  // Split from the other two rather than folded into one expression so that
  // `theme` stays narrowed for everything below.
  if (!theme) {
    // Deliberately an umbrella: the probe returns no table when the set binds
    // nothing, when no collection qualifies as the theme, and when the
    // collection cannot be loaded (theme-probe.ts `withoutModes`). The
    // snapshot does not say which, so claiming "binds no variables" would
    // assert a fact this check cannot see - the exact failure the issue warns
    // about, since "no theme axis" and "could not check" are different claims.
    return notApplicable(
      "No theme collection could be determined from this set's own bindings, so there is nothing to resolve per mode.",
    );
  }
  // Ordered before the mode count on purpose. When the set binds nothing
  // directly, the probe picks the collection from style variables instead
  // (theme-probe.ts `deciding`), so "the collection this set binds" is a claim
  // about a binding that does not exist - it would be a wrong reason on any
  // style-only set whose collection happens to have one mode.
  if (!consumed && unavailable.length === 0) {
    return notApplicable(
      "This set binds nothing from the theme collection - its themed values come from shared styles rather than its own bindings - so there is nothing of this component's to resolve per mode.",
    );
  }
  if (theme.modes.length < 2 && unavailable.length === 0) {
    return notApplicable(
      "The collection this set binds has only one mode, so there is no second theme to compare against.",
    );
  }

  const findings: Finding[] = [];

  // Reported once per variable rather than once per mode: a binding that cannot
  // be loaded at all is broken in every mode, so multiplying it out would add
  // rows that differ only in a mode name and say nothing new. There is no name
  // to quote, so the id stands in.
  for (const variableId of unavailable) {
    const consumer = usage.get(variableId);
    findings.push({
      severity: "high",
      nodeId: consumer?.nodeId ?? snapshot.id,
      nodeName: consumer?.nodeName ?? snapshot.name,
      message: `Bound variable ${variableId} could not be loaded, so it resolves in no mode.`,
      expected: "a variable that still exists and whose library is available",
      actual: "the variable could not be loaded at all",
      suggestedFix:
        "Re-bind the layer to a live variable, or restore access to the library the deleted one came from.",
      count: consumer?.count ?? 1,
    });
  }

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
  const pinnedNodes = theme.collectionId
    ? nodesPinning(snapshot, theme.collectionId)
    : [];
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

  // Design's ask was visual - for every mode, see that it works and *looks good*.
  // This check proves only that every bound variable resolves, which is a
  // different claim: a set can resolve perfectly in both modes and still read
  // wrong in one. Without this the row overclaimed on every run (#115).
  //
  // Names the modes rather than saying "check the modes", so the tick is
  // actionable, and because the collection pick is a heuristic the reviewer
  // should see which axis they are being asked to look at.
  const visualRemainder =
    theme.modes.length > 0
      ? `Look at the component in every theme mode (${modeList}) and confirm ` +
        `it reads correctly in each. Only that every bound variable resolves ` +
        `is checked automatically.`
      : `Look at the component in every theme mode and confirm it reads ` +
        `correctly. The modes could not be determined here, so they are not ` +
        `named; only variable resolution is checked automatically.`;
  const note = theme.collectionName
    ? `Evaluated collection "${theme.collectionName}" across ${theme.modes.length} modes: ${modeList}. The theme collection is picked as the bound collection with the most modes; if that is the wrong collection here, these results describe the wrong axis.`
    : "No theme collection could be determined: none of the variables this set binds could be loaded, so there were no modes to evaluate against.";

  findings.sort((a, b) => a.message.localeCompare(b.message));

  const status: CheckStatus =
    resolutionFailures > 0 ? "fail" : pinnedNodes.length > 0 ? "warn" : "pass";

  return {
    checkId: "themes",
    title: TITLE,
    status,
    findings,
    note,
    manualRemainder: visualRemainder,
  };
}
