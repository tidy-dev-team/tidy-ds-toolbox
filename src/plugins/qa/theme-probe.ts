/// <reference types="@figma/plugin-typings" />

/**
 * Per-mode variable resolution for #17 (issue #102) - the second and only other
 * figma-touching piece of the QA engine besides the collector.
 *
 * **Why a probe at all.** Getting a variable's value *per mode* is awkward:
 * `valuesByMode` does not resolve aliases, and `resolveForConsumer` resolves
 * fully but only in the consumer's *current* mode context. Per-mode truth
 * therefore needs either a reimplementation of Figma's resolution - mode
 * inheritance, extended collections, workspace/team default modes that are
 * explicitly absent from a node's explicit modes - or something to resolve
 * against. Reimplementing was rejected: a wrong walk yields silently wrong
 * numbers, and #16's contrast maths would inherit them.
 *
 * **What it does instead.** Create one empty temporary frame, pin an explicit
 * mode on it, resolve each variable the set uses against it, repeat per mode,
 * and remove the frame in a `finally`. Figma performs the resolution, so the
 * table is faithful by construction, and cost scales with *variables used*
 * (dozens) rather than variants × modes × nodes (thousands). Tier 2 needs no
 * scratch-clone page; that stays a Tier 3 concern for checks that must mutate
 * to observe.
 *
 * **Read-only carve-out.** `tidy_qa_run` is a Query operation, which ADR-0001
 * defines as read-only. This creates and removes a node, so it is a documented
 * exception (see docs/adr/0001) rather than an accident. The alternative -
 * probing only in the execute operation - would leave the two QA surfaces
 * silently disagreeing about what was checked, which is worse. The component
 * set itself is never touched.
 */

import { toHex } from "./color";
import { collectVariableUsage } from "./variable-usage";
import { selectPrimaryCollection } from "../../shared/theme-collection";
import type { ModeCollectionFact } from "../../shared/theme-collection";
import type {
  ComponentSetSnapshot,
  ModeResolutionSnapshot,
  ThemeSnapshot,
  VariableResolutionSnapshot,
} from "./snapshot";

const PROBE_NAME = "__tidy-qa-mode-probe";

function isAlias(value: VariableValue): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as VariableAlias).type === "VARIABLE_ALIAS"
  );
}

/**
 * Resolve every variable the set uses, once per mode of the theme collection.
 *
 * Returns `undefined` when there is nothing to evaluate - no bound variables,
 * or no bound collection with modes - so the check can report
 * `not_applicable` rather than inventing a theme. In that case no probe node is
 * created at all.
 */
export async function probeThemeResolution(
  snapshot: ComponentSetSnapshot,
): Promise<ThemeSnapshot | undefined> {
  // Same traversal the check uses, so the two cannot disagree about which
  // variables the set consumes.
  const variableIds = [...collectVariableUsage(snapshot).keys()];
  if (variableIds.length === 0) return undefined;

  // Memoized by id, so cost scales with unique ids rather than node count.
  const variables = new Map<string, Variable>();
  for (const id of variableIds) {
    if (variables.has(id)) continue;
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (variable) variables.set(id, variable);
  }
  if (variables.size === 0) return undefined;

  const collections = new Map<string, VariableCollection>();
  for (const variable of variables.values()) {
    const collectionId = variable.variableCollectionId;
    if (collections.has(collectionId)) continue;
    const collection =
      await figma.variables.getVariableCollectionByIdAsync(collectionId);
    if (collection) collections.set(collectionId, collection);
  }

  const facts: ModeCollectionFact[] = [...collections.values()].map((c) => ({
    id: c.id,
    name: c.name,
    defaultModeId: c.defaultModeId,
    modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
  }));
  // Same helper the generated documentation pages use, so QA and the docs
  // cannot disagree about what "the theme" is.
  const primary = selectPrimaryCollection(facts);
  if (!primary) return undefined;

  const themeCollection = collections.get(primary.id);
  if (!themeCollection) return undefined;

  const resolved: Record<string, VariableResolutionSnapshot> = {};
  for (const [id, variable] of variables) {
    resolved[id] = {
      name: variable.name,
      collectionId: variable.variableCollectionId,
      byMode: {},
    };
  }

  const probe = figma.createFrame();
  try {
    probe.name = PROBE_NAME;
    probe.resize(1, 1);
    probe.fills = [];
    probe.visible = false;
    figma.currentPage.appendChild(probe);

    for (const mode of primary.modes) {
      probe.setExplicitVariableModeForCollection(themeCollection, mode.modeId);

      for (const [id, variable] of variables) {
        resolved[id].byMode[mode.modeId] = resolveOne(
          variable,
          mode.modeId,
          primary.id,
          probe,
        );
      }
    }
  } finally {
    // Removed on the error path too - a probe left behind would be a stray
    // node in the user's file, and worse, one carrying pinned modes.
    probe.remove();
  }

  return {
    collectionId: primary.id,
    collectionName: primary.name,
    modes: primary.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: resolved,
  };
}

/**
 * One variable in one mode. A variable belonging to the theme collection with
 * no entry of its own for the mode is a *missing override* - reported as
 * `no-value` even if Figma still resolves it by falling back, because the
 * un-themed token is the defect. Anything else is judged purely on what the
 * probe observes.
 */
function resolveOne(
  variable: Variable,
  modeId: string,
  themeCollectionId: string,
  probe: SceneNode,
): ModeResolutionSnapshot {
  if (
    variable.variableCollectionId === themeCollectionId &&
    variable.valuesByMode[modeId] === undefined
  ) {
    return { ok: false, reason: "no-value" };
  }

  try {
    const { value, resolvedType } = variable.resolveForConsumer(probe);
    if (value === undefined || value === null || isAlias(value)) {
      return { ok: false, reason: "unresolved-alias" };
    }
    const snapshot: ModeResolutionSnapshot = { ok: true, type: resolvedType };
    if (resolvedType === "COLOR" && typeof value === "object") {
      const color = value as RGBA;
      snapshot.hex = toHex(color);
      snapshot.alpha = color.a ?? 1;
    }
    return snapshot;
  } catch {
    // resolveForConsumer throws on a chain it cannot follow - a dangling
    // target, or a remote variable whose library is unavailable.
    return { ok: false, reason: "unresolved-alias" };
  }
}
