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
import { collectVariableUsage, colorStyleVariableIds } from "./variable-usage";
import { selectPrimaryCollection } from "../../shared/theme-collection";
import type { ModeCollectionFact } from "../../shared/theme-collection";
import type {
  ComponentSetSnapshot,
  ModeResolutionSnapshot,
  ThemeSnapshot,
  VariableResolutionSnapshot,
} from "./snapshot";

/**
 * Deliberately unlovely, because the sweep below matches on it: a designer's own
 * node called this would be removed.
 */
export const PROBE_NAME = "__tidy-qa-mode-probe";

/**
 * Whether a node is a probe an earlier run left behind.
 *
 * Pure and exported so the one judgement the sweep makes is testable rather than
 * hidden inside the figma env. The type test matters: the probe is always a
 * frame, so anything else carrying this name belongs to somebody else.
 */
export function isStrayProbe(node: { type: string; name: string }): boolean {
  return node.type === "FRAME" && node.name === PROBE_NAME;
}

/** The bit of a probe node this lifecycle needs; `FrameNode` satisfies it. */
interface Removable {
  remove(): void;
}

/**
 * The figma calls the probe lifecycle makes, injected so the lifecycle itself can
 * be tested without Figma (#131).
 *
 * Split into `create` and `prepare` on purpose: creation must be the last thing
 * before the `try`, while preparation belongs *inside* it, so a frame that fails
 * half-way through being configured is still removed.
 */
export interface ProbeEnv<N extends Removable> {
  /** Create the bare node. Nothing else - see above. */
  create(): N;
  /** Name, size, hide and parent the node. Called inside the try. */
  prepare(probe: N): void;
  /**
   * Probe nodes an earlier run left behind. See the sweep in `withProbeFrame`
   * for why they can exist at all.
   */
  strayProbes(): readonly N[];
}

/**
 * The real thing. Kept next to the lifecycle it feeds so the figma calls stay
 * visible in the file `CLAUDE.md` names as figma-touching, rather than migrating
 * into the pure layer behind an injected interface.
 *
 * `strayProbes` looks only at the current page's direct children, which is where a
 * probe is parented, so the sweep costs nothing like a document walk. The limit
 * of that: an orphan is left on whichever page was current when the sandbox died,
 * so a run started from a different page will not find it. Sweeping the whole
 * document on every run is not worth that, and the orphan is invisible and 1x1.
 */
const figmaProbeEnv: ProbeEnv<FrameNode> = {
  create: () => figma.createFrame(),
  prepare: (probe) => {
    probe.name = PROBE_NAME;
    probe.resize(1, 1);
    probe.fills = [];
    probe.visible = false;
    figma.currentPage.appendChild(probe);
  },
  strayProbes: () =>
    figma.currentPage.children.filter((node): node is FrameNode =>
      isStrayProbe(node),
    ),
};

/**
 * Run `use` against a temporary probe node, and remove that node afterwards on
 * every path.
 *
 * The whole point is that the guarantee is structural rather than a convention:
 * there is nowhere to put an early `return` between the creation and the `try`,
 * because the creation and the `try` are this function. Previously both lived in
 * `probeThemeResolution` with a comment asking the next reader not to separate
 * them.
 *
 * **Why it also sweeps.** `finally` covers returning and throwing, not dying:
 * cancelling a plugin may tear the sandbox down rather than unwind it, and then
 * no teardown runs at all and the probe is orphaned. That case is unprotectable
 * from inside the plugin - there is no hook to run on the way out - so the
 * remedy is the next run cleaning up after the last one. Sweeping *before*
 * creating also means a run never resolves against a page that still holds a
 * stale probe carrying pinned modes.
 */
export async function withProbeFrame<N extends Removable, T>(
  env: ProbeEnv<N>,
  use: (probe: N) => Promise<T> | T,
): Promise<T> {
  // Best effort, and deliberately not allowed to fail the call. A stray is the
  // *previous* run's mess, and a node orphaned by a killed sandbox may already be
  // gone - Figma throws on member access of a removed node. Letting that escape
  // would turn litter into a broken read-only query, and would abandon the
  // remaining strays on the way out.
  for (const stray of env.strayProbes()) {
    try {
      stray.remove();
    } catch {
      // Leaves the stray in place, which is the state we were already in.
    }
  }

  const probe = env.create();
  try {
    env.prepare(probe);
    return await use(probe);
  } finally {
    probe.remove();
  }
}

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
  const boundIds = [...collectVariableUsage(snapshot).keys()];
  // Variables reached only through a fill style the set applies. Resolved
  // alongside the rest because #16 needs their per-mode colour, but kept apart
  // below: a style's broken binding is not a defect of the component that
  // applied the style, so it must not become one of #17's findings.
  const styleIds = colorStyleVariableIds(snapshot).filter(
    (id) => !boundIds.includes(id),
  );
  if (boundIds.length === 0 && styleIds.length === 0) return undefined;

  // Memoized by id, so cost scales with unique ids rather than node count.
  const variables = new Map<string, Variable>();
  const unavailable: string[] = [];
  for (const id of [...boundIds, ...styleIds]) {
    if (variables.has(id)) continue;
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (variable) {
      variables.set(id, variable);
    } else if (!styleIds.includes(id)) {
      // A binding Figma cannot load: a deleted variable, or a remote one whose
      // library is unavailable. That is precisely the broken-chain case #17
      // exists to catch, so the id is kept for the check to fail on.
      unavailable.push(id);
    }
  }
  // No modes to evaluate against, but the dead bindings still have to reach the
  // check: dropping them let a set with one broken binding report `pass` on the
  // strength of its remaining healthy variables.
  const withoutModes = (): ThemeSnapshot | undefined =>
    unavailable.length > 0
      ? { modes: [], variables: {}, unavailableVariableIds: unavailable }
      : undefined;

  if (variables.size === 0) {
    // Nothing resolvable means no bound collection to call "the theme", so the
    // modes are unknown.
    return withoutModes();
  }

  // Which collection counts as "the theme" is decided from the set's *own*
  // bindings, never from variables reached through a style. Otherwise the answer
  // would depend on which checks were requested: a `checks: ["themes"]` run
  // resolves no style variables and could pick a different collection than a
  // full run, leaving the two disagreeing about the same component. Style
  // variables are only a fallback for a set that binds nothing directly, where
  // no themes-only run has an answer to disagree with.
  // Only ids that actually *resolved* can decide it. Filtering on the raw
  // `boundIds` instead would let a set whose every direct binding is broken pick
  // an empty collection list and bail out, throwing away both the dead bindings
  // #17 must fail on and the perfectly good style colours #16 could have used.
  const resolvedBound = boundIds.filter((id) => variables.has(id));
  const deciding = new Set(
    resolvedBound.length > 0
      ? resolvedBound
      : styleIds.filter((id) => variables.has(id)),
  );

  const collections = new Map<string, VariableCollection>();
  for (const [id, variable] of variables) {
    if (!deciding.has(id)) continue;
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
  if (!primary) return withoutModes();

  const themeCollection = collections.get(primary.id);
  if (!themeCollection) return withoutModes();

  const resolved: Record<string, VariableResolutionSnapshot> = {};
  for (const [id, variable] of variables) {
    resolved[id] = {
      name: variable.name,
      collectionId: variable.variableCollectionId,
      byMode: {},
    };
  }

  // Creation, preparation and removal all belong to withProbeFrame, which
  // guarantees the node goes away on every path it can reach (#131).
  await withProbeFrame(figmaProbeEnv, (probe) => {
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
  });

  return {
    collectionId: primary.id,
    collectionName: primary.name,
    modes: primary.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
    variables: resolved,
    ...(unavailable.length > 0 ? { unavailableVariableIds: unavailable } : {}),
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
