/// <reference types="@figma/plugin-typings" />

/**
 * Per-mode variable resolution for #17 (issue #102) - one of three figma-touching
 * pieces of the QA engine's checking half, beside the collector and the resize
 * probe (#111), which shares this module's probe marker and stray sweep.
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
 * The probe's name. Cosmetic only: it exists so a human who ever finds one of
 * these in a file can tell what left it there. Ownership is decided by
 * `isStrayProbe`, never by the name.
 */
export const PROBE_NAME = "__tidy-qa-mode-probe";

/**
 * Plugin data marking a node as this plugin's probe.
 *
 * Figma namespaces plugin data per plugin, so nothing outside the toolbox can
 * write this - which is the whole point. The sweep used to match on the name
 * alone, and a name cannot establish ownership: a designer's own frame called
 * `__tidy-qa-mode-probe` would have been deleted. ADR-0001's carve-out permits
 * removing *our* transient nodes, not arbitrary user content, so a marker only we
 * can set is what the carve-out actually licenses.
 */
const PROBE_MARKER_KEY = "tidy-qa-probe";
const PROBE_MARKER = "1";

/**
 * Release a node this plugin had claimed, so a later sweep leaves it alone.
 *
 * The pairing matters for #121: a frame is claimed the moment it is created, so
 * that a sandbox killed mid-build leaves something reclaimable, and released only
 * once the caller has committed to keeping it on the canvas. Failing in that
 * direction leaks nothing and deletes nothing of the designer's.
 */
export function unmarkProbe(node: {
  setPluginData(key: string, value: string): void;
}): void {
  node.setPluginData(PROBE_MARKER_KEY, "");
}

/** Claim a node as this plugin's probe. Paired with `isStrayProbe`. */
export function markProbe(node: {
  setPluginData(key: string, value: string): void;
}): void {
  node.setPluginData(PROBE_MARKER_KEY, PROBE_MARKER);
}

/**
 * Whether a node is a probe this plugin left behind.
 *
 * Pure and exported so the judgement the sweep makes is testable rather than
 * hidden inside the figma env. The type test is a cheap second condition: the
 * probe is always a frame.
 */
export function isStrayProbe(node: {
  type: string;
  getPluginData(key: string): string;
}): boolean {
  return (
    node.type === "FRAME" &&
    node.getPluginData(PROBE_MARKER_KEY) === PROBE_MARKER
  );
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
   * Probe nodes an earlier run left behind. See `sweepStrayProbes` for why they
   * can exist at all, and `isStrayProbe` for how one is identified.
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
    // First, so the window in which a probe exists unmarked - and would therefore
    // survive a later sweep - is as small as it can be. Erring that way is
    // deliberate: leaking an invisible 1x1 frame is better than deleting a node
    // we cannot prove is ours.
    markProbe(probe);
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
 * Sweep every stray QA probe on the current page, whatever created it.
 *
 * Exported so the *resize* probe (#111) shares one sweep with this one rather than
 * standing up a second. Both mark their scratch nodes with the same plugin-data
 * marker, so a single sweep reclaims either, and a run that probes only one of the
 * two still clears the other's residue.
 */
export function sweepQaProbes(): void {
  sweepStrayProbes(figmaProbeEnv);
}

/**
 * Remove probes an earlier run left behind.
 *
 * `finally` covers returning and throwing, not dying: cancelling a plugin may
 * tear the sandbox down rather than unwind it, and then no teardown runs at all
 * and the probe is orphaned carrying pinned modes. That is unprotectable from
 * inside the plugin - there is no hook to run on the way out - so the remedy is
 * the next run clearing the last one's residue.
 *
 * Separate from `withProbeFrame` on purpose. Sweeping is a per-*run* concern, not
 * a per-probe one, and burying it in the lifecycle meant every early return in
 * `probeThemeResolution` skipped the cleanup: a set with no bound variables never
 * reached the lifecycle, so it never tidied up either.
 *
 * Best effort, and deliberately never allowed to fail the call. A stray is the
 * *previous* run's mess, and an orphan may already be gone - Figma throws on
 * member access of a removed node. Letting that escape would turn litter into a
 * broken read-only query, and would abandon the remaining strays on the way out.
 */
export function sweepStrayProbes<N extends Removable>(
  env: Pick<ProbeEnv<N>, "strayProbes">,
): void {
  // Discovery is guarded separately from removal, and for the same reason:
  // reading the page's children, or plugin data off a node that has since gone,
  // can throw as readily as removing can. Guarding the two together would let one
  // unremovable stray abandon the rest.
  let strays: readonly N[];
  try {
    strays = env.strayProbes();
  } catch {
    return;
  }

  for (const stray of strays) {
    try {
      stray.remove();
    } catch {
      // Leaves the stray in place, which is the state we were already in.
    }
  }
}

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
 * Cleanup of an *earlier* run's residue is not here but in `sweepStrayProbes`,
 * which the operation calls once per run - see there for why.
 */
export async function withProbeFrame<N extends Removable, T>(
  env: ProbeEnv<N>,
  use: (probe: N) => Promise<T> | T,
): Promise<T> {
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
  /**
   * Injected only so the call below is covered by a test. Without it, the one
   * thing #131 exists to stop resting on a careful reading - that cleanup happens
   * on *every* run - would itself rest on a careful reading, since moving this
   * call under an early return breaks nothing else.
   */
  sweep: () => void = sweepQaProbes,
): Promise<ThemeSnapshot | undefined> {
  // Before anything else, including the early returns below: cleanup has to
  // happen on every run that gets here, not only the ones that go on to build a
  // probe of their own. A set with no bound variables returns early, and that run
  // is just as able to clear the last one's residue.
  sweep();

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
