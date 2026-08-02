/**
 * Serializable snapshot of a component set — the boundary between the
 * figma-touching collector and the pure Tier 1 check functions
 * `(snapshot) → CheckResult` (issue #76, two-layer testability).
 *
 * Everything here must stay plain JSON so check tests can use fixture
 * snapshots without the Figma API.
 */

import type { Anomaly } from "./resize/anomalies";

export interface PaintSnapshot {
  /** "SOLID" | "IMAGE" | "GRADIENT_LINEAR" | … */
  type: string;
  visible: boolean;
  opacity: number;
  /** Solid paints only, e.g. "#FF0000". */
  hex?: string;
  /** Color variable this paint is bound to, when any. */
  boundVariableId?: string;
}

/**
 * One styled run inside a TEXT layer whose fills vary across character ranges
 * (#16, issue #124) - a coloured link inside a paragraph, or one highlighted
 * word.
 *
 * Collected **only** when the layer's fills are mixed, which is the one case a
 * single layer-level answer cannot describe. A layer painted in one colour is
 * already fully described by `fills` / `fillStyleId` / `fontSize` / `bold`, and
 * splitting it into runs would add a second way to say the same thing.
 *
 * Each run carries its own size and weight rather than inheriting the layer's,
 * so the AA threshold is the one that actually applies to those glyphs: the
 * layer-level `fontSize` is the smallest size anywhere in the run, which is the
 * right conservative answer for one verdict but the wrong one for a 24px word
 * sitting beside a 12px one.
 *
 * The characters themselves are deliberately not carried. They would make each
 * run's finding unique, and #118 dedupes findings by their message, so a defect
 * shared by four variants would stop collapsing into one row.
 */
export interface TextSegmentSnapshot {
  /**
   * The run's own paints. Never mixed - a styled run is by definition the span
   * over which they do not change, which is why Figma types a run's `fills` as
   * `Paint[]` while a layer's can be `figma.mixed`. Empty means the run paints
   * nothing, and #16 reports it as unevaluated rather than assuming a colour.
   */
  fills?: PaintSnapshot[];
  /**
   * Paint style backing the run, "" when unstyled. Never the "MIXED" sentinel
   * a whole layer can carry: Figma types a run's `fillStyleId` as `string`.
   */
  fillStyleId?: string;
  /** The run's own size in px, not the layer's smallest. */
  fontSize?: number;
  /** Whether this run is bold, i.e. font weight >= 700. */
  bold?: boolean;
}

/**
 * One instance exposed anywhere beneath an INSTANCE node (#14 nesting depth).
 * `InstanceNode.exposedInstances` is already flattened by Figma — it lists
 * every exposed descendant at any depth, not just direct children — and
 * exposure is inherited downward, so each entry's own `exposedInstanceIds` is
 * a subset of the containing node's full list. That subset relation is what
 * lets the pure check reconstruct which entries are direct children of which
 * (an entry reachable through another entry's id list is a grandchild, not a
 * direct one) without the collector re-serializing the same descendants
 * under every ancestor — captured flat, this stays linear in descendant
 * count instead of blowing up per level.
 */
export interface ExposedInstanceSnapshot {
  id: string;
  name: string;
  /** Ids of this entry's own exposed descendants (already flattened by Figma). */
  exposedInstanceIds: string[];
}

export interface NodeSnapshot {
  id: string;
  name: string;
  /** Figma node type: "FRAME" | "TEXT" | "INSTANCE" | … */
  type: string;
  visible: boolean;
  width: number;
  height: number;
  /**
   * Node-level opacity, 0-1 (#16). Recorded only when it is not 1, so
   * fixtures stay terse; absent means fully opaque.
   *
   * Separate from `PaintSnapshot.opacity`, and both apply: a 50% fill on a
   * 50% frame is 25% of the surface behind it. #16 has to composite them to
   * measure contrast on a DS that uses opacity in place of absolute hex.
   */
  opacity?: number;

  /**
   * Child trees. Empty for INSTANCE nodes by design — nested instance
   * interiors are another component's problem (#8 handles provenance).
   */
  children: NodeSnapshot[];
  /**
   * INSTANCE nodes only: identity of the main component this instance points
   * at. Absent when Figma can't resolve one — and that absence is a real third
   * state (provenance unknown), distinct from a resolved `remote: false` (a
   * local component), which is why the fields travel as one object rather than
   * three separately-optional ones.
   *
   * Note there is deliberately no library *identity* here: the plugin API
   * exposes a component's `key` and `remote` flag but no file key or library
   * name (only variable collections carry `libraryName`), so "came from the
   * approved Foundations file" is not answerable in-plugin (#8).
   */
  mainComponent?: {
    id: string;
    /**
     * Publish key — stable across files. Identifies the *variant*, so it is
     * only the dedupe key for a component with no owning set (#8).
     */
    key: string;
    /**
     * The variant's own name, e.g. `State=Default`. Rarely what a reader
     * wants on its own — see `setName`.
     */
    name: string;
    /**
     * Owning component set, when the main component is a variant. An
     * instance's main component is the *variant*, so `name` alone reads as
     * `State=Default` and identifies nothing; the set is the thing a designer
     * recognises, and the thing findings dedupe on (#8). Absent for a
     * standalone component, where `name` is already the identity.
     */
    setId?: string;
    setName?: string;
    /** Whether the component lives in another (published) file. */
    remote: boolean;
  };
  /**
   * Which component property drives which of this node's own properties (#3),
   * straight from Figma's `componentPropertyReferences`. Keyed by the node
   * property being driven - `visible` for BOOLEAN, `mainComponent` for
   * INSTANCE_SWAP, `characters` for TEXT - with the **raw suffixed property
   * key** as the value, e.g. `"Show Left Icon#123:4"`.
   *
   * Absent when the node is driven by nothing, which is the normal case.
   *
   * This is the only record of a property's *binding*. Figma stores a boolean
   * property's definition on the component set, so its toggle appears in the
   * panel for every variant, but the binding lives on one layer inside one
   * variant and does not propagate when variants are added. Without this field
   * an unwired toggle is indistinguishable from a wired one.
   */
  propertyReferences?: Record<string, string>;
  /**
   * INSTANCE nodes only: whether this instance itself is exposed to its
   * containing component's panel (#14). When false, none of its exposed
   * descendants surface there either, however deep `exposedInstances` goes.
   */
  isExposedInstance?: boolean;
  /** INSTANCE nodes only: flattened exposed-instance list (#14). */
  exposedInstances?: ExposedInstanceSnapshot[];

  // --- paints & styles (#5 tokens) ---
  fills?: PaintSnapshot[];
  strokes?: PaintSnapshot[];
  fillStyleId?: string;
  strokeStyleId?: string;
  /** TEXT nodes: style id, "" when unstyled, "MIXED" for mixed ranges. */
  textStyleId?: string;
  /**
   * TEXT nodes: the fills differ per character range (#16). `fills` is absent
   * in that case, and absent-because-mixed has to be told apart from
   * absent-because-this-node-has-no-fills: picking "the first fill" of a mixed
   * run would be a confidently wrong contrast answer.
   *
   * `textSegments` carries the runs themselves, so #16 measures each one
   * against its own background rather than declining to measure the layer.
   * The flag stays because the two facts are not the same: a snapshot taken by
   * an older plugin build has `fillsMixed` with no segments, and that layer is
   * still honestly unevaluated rather than silently green.
   */
  fillsMixed?: boolean;
  /**
   * TEXT nodes with mixed fills: the styled runs, in document order (#124).
   * Absent on every other layer - see `TextSegmentSnapshot`.
   */
  textSegments?: TextSegmentSnapshot[];
  /**
   * TEXT nodes: font size in px (#16 threshold). When ranges differ this is
   * the **smallest** size used - the strictest applicable threshold, so a
   * mixed run is judged on its worst case rather than on its heading. Layers
   * carrying `textSegments` are judged per run instead, and never through this.
   */
  fontSize?: number;
  /**
   * TEXT nodes: whether the text is bold, i.e. font weight >= 700 (#16).
   * True only when *every* range is bold: the large-text threshold (3:1) is the
   * lenient one, so a partially-bold run must not qualify for it.
   */
  bold?: boolean;
  effectCount?: number;
  effectStyleId?: string;

  // --- auto-layout & geometry (#5 spacing, #9 structure, #10 grid) ---
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
  /**
   * How children are distributed along the auto-layout primary axis (#7's
   * resize half).
   *
   * Recorded because `SPACE_BETWEEN` on a container that can stretch is the
   * canonical "looks fine at rest, breaks when stretched" defect: at its default
   * width the component looks perfect, and widening it sends the icon to the far
   * left and the label to the far right with a hole in between. That the trigger
   * is *structural* - two snapshot fields - is what lets the whole set be
   * pre-scanned for it without resizing anything, which is how the probe's
   * one-variant coverage limit is mostly recovered (see `resize/stretch-risk.ts`).
   */
  primaryAxisAlignItems?: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  /** "MIXED" when per-corner radii differ. */
  cornerRadius?: number | "MIXED";
  strokeWeight?: number | "MIXED";

  /**
   * Auto-layout size bounds (#7). Figma reports `null` for "no bound", and
   * these are recorded only when actually set, so absent here means unset in
   * the file, which is precisely what the check reports on.
   */
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  /**
   * Whether Figma would accept a size bound on this node at all (#7).
   * Bounds are settable on auto-layout frames **and on their direct
   * children**, so this cannot be inferred from the node's own `layoutMode`:
   * a `layoutMode: "NONE"` variant inside an auto-layout component set can
   * carry bounds perfectly well. The collector owns the answer because only it
   * can see the parent; absent means bounds are not settable here, and #7
   * reports `not_applicable` rather than asking for something the file cannot
   * express.
   */
  boundsApplicable?: boolean;

  /** Fields on this node bound to variables, e.g. ["paddingLeft", "itemSpacing"]. */
  boundVariableKeys?: string[];
  /**
   * Ids of the variables bound on this node's fields, deduped (#17). Kept
   * separate from `boundVariableKeys`, which records only *which* fields are
   * bound: counting how many usages a variable has needs the ids.
   */
  boundVariableIds?: string[];
  /**
   * Explicit variable modes pinned on this node itself, collection id → mode
   * id (#17). Present only when non-empty. A node that pins its own mode
   * renders in that mode whatever its ancestors say, which is what makes the
   * probe's answer unverifiable for it.
   */
  explicitVariableModes?: Record<string, string>;

  /** Prototype trigger types on this node, e.g. ["ON_HOVER"] (#11). */
  reactionTriggers?: string[];
}

export interface ComponentPropertySnapshot {
  /** Property name without the Figma "#id" suffix. */
  name: string;
  /**
   * The raw Figma key including the "#id" suffix, e.g. `"Show Left Icon#123:4"`
   * (#3). Kept alongside the display name because `NodeSnapshot.propertyReferences`
   * holds this exact string: joining a binding to its definition is an exact
   * match on the key, not a comparison of stripped display names.
   */
  key: string;
  /** "VARIANT" | "BOOLEAN" | "TEXT" | "INSTANCE_SWAP" */
  type: string;
  /** INSTANCE_SWAP properties only (#15). */
  preferredValuesCount?: number;
  /**
   * Variables bound to the property itself (#17).
   * These bindings live on the component property definition, not on any
   * layer, so a set whose only variable use is a bound property would
   * otherwise look like it uses no variables at all.
   */
  boundVariableIds?: string[];
}

/**
 * An ancestor (or the subject itself) pinning explicit variable modes (#17).
 * A pin here sets the mode context for everything below it, including every
 * variant, so the probe cannot speak for the set's real rendering.
 * The snapshot's node trees begin at the variants, which is below any of this,
 * so the ancestry has to be captured separately.
 */
export interface PinnedAncestorSnapshot {
  id: string;
  name: string;
  explicitVariableModes: Record<string, string>;
}

export interface VariantSnapshot {
  id: string;
  name: string;
  /** e.g. { Size: "Medium", State: "Default" } — empty for standalone components (#13). */
  variantProperties: Record<string, string>;
  tree: NodeSnapshot;
}

/** One mode of the evaluated theme collection (#17). */
export interface ThemeModeSnapshot {
  modeId: string;
  name: string;
}

/**
 * How one variable resolved in one mode of the theme collection, as observed
 * through the resolution probe (#17).
 *
 * `ok: false` is split by reason because the two are different defects with
 * different fixes: `no-value` means the variable itself has no entry for that
 * mode (a missing override, typically on an extended collection), while
 * `unresolved-alias` means Figma could not follow the alias chain to a concrete
 * value (dangling target, or a broken remote variable).
 */
export interface ModeResolutionSnapshot {
  ok: boolean;
  reason?: "no-value" | "unresolved-alias";
  /** Resolved type Figma reported, e.g. "COLOR" | "FLOAT" (present when ok). */
  type?: string;
  /** COLOR variables only: the resolved colour, for #16 to build contrast on. */
  hex?: string;
  /** COLOR variables only: resolved alpha, 0-1. */
  alpha?: number;
}

/** A variable used by the set, resolved once per theme mode (#17). */
export interface VariableResolutionSnapshot {
  name: string;
  /** Collection the variable itself belongs to - not necessarily the theme. */
  collectionId: string;
  /** Keyed by mode id of the theme collection. */
  byMode: Record<string, ModeResolutionSnapshot>;
}

/**
 * Per-mode resolution table for the theme collection (#17), produced by the
 * resolution probe: one temporary frame, explicit modes set on it, each
 * variable resolved against it once per mode, frame removed in a `finally`.
 * Figma does the resolving, so these values are faithful by construction
 * rather than a reimplementation of mode inheritance.
 *
 * Absent when the set binds no variables, or when no bound collection has
 * modes to evaluate - the check reports `not_applicable` rather than inventing
 * a theme.
 */
export interface ThemeSnapshot {
  /**
   * Which collection was treated as "the theme" (most modes, see
   * shared/theme-collection).
   * Absent when no bound collection could be determined at all, which happens
   * when every variable the set binds fails to load.
   */
  collectionId?: string;
  collectionName?: string;
  modes: ThemeModeSnapshot[];
  /** Variable id to per-mode resolution. */
  variables: Record<string, VariableResolutionSnapshot>;
  /**
   * Ids the set binds that Figma could not load at all (#17).
   * `getVariableByIdAsync` returning null is itself the "broken remote
   * variable" case the check has to fail on, so these are kept rather than
   * dropped: discarding them let a set with one dead binding report `pass` on
   * the strength of its remaining healthy variables.
   * There is no name to report, so the check falls back to the id.
   */
  unavailableVariableIds?: string[];
}

/**
 * A paint style the set references, resolved once (#16).
 *
 * The `tokens` check accepts either a bound variable **or** a style, so both
 * are live colour sources in real files. Resolving variables only would leave
 * most contrast rows "not evaluated" for an implementation-detail reason, and
 * an unevaluated contrast check is worse than none because the row still looks
 * checked.
 *
 * A style's paint can itself be variable-bound, in which case its
 * `boundVariableId` points into the per-mode table above - which is why the
 * style table is resolved *before* the probe runs, so those variables are
 * resolved per mode too.
 */
export interface ColorStyleSnapshot {
  /** Style name, e.g. "Surface/Default" - preferred over hex in findings. */
  name: string;
  paints: PaintSnapshot[];
}

/**
 * What the resize probe measured (#7's resize half, issue #111).
 *
 * Produced by `resize-probe.ts`, which instances one variant into a scratch frame,
 * drives its width, records boxes, and removes everything in a `finally` - the same
 * ADR-0001 carve-out the theme probe documents. Every judgement made from it is
 * pure (`resize/anomalies.ts`), so what lands here is observation only.
 *
 * Absent when the probe did not run at all. Present-with-`skipped` is different and
 * says more: the probe ran and declined, for a reason the row then prints, rather
 * than a row going quietly green on a test that never happened.
 */
export interface ResizeProbeSnapshot {
  /**
   * Why nothing was measured, when nothing was. A hugging component has no
   * resize behaviour to test; a set with no default variant has nothing to
   * instance.
   */
  skipped?: string;
  /**
   * The variant that was probed. One variant, deliberately: instancing every
   * variant is the combinatorial cost #112 was re-scoped away from. The coverage
   * limit is stated on the row rather than implied away, and the structural
   * pre-scan (`resize/stretch-risk.ts`) covers the whole set to make up for it.
   */
  variantId?: string;
  variantName?: string;
  /** Width the component sat at when instanced - what everything is compared to. */
  baselineWidth?: number;
  /** Labels of the states actually measured, e.g. "widened to 300px". */
  states?: string[];
  /** What drifted. Empty means measured and clean; absent means not measured. */
  anomalies?: Anomaly[];
  /**
   * The probe drove the width and the component did not move at all.
   *
   * Recorded because the two explanations are indistinguishable from in here - the
   * component is pinned by bounds Figma is enforcing, or the probe could not drive
   * it - and both make a clean measurement worthless. The row reports the resize
   * half as not established rather than as a pass: this is the one outcome where a
   * green chip would be actively misleading.
   */
  unmoved?: boolean;
  /** The declared size bounds on the probed variant. */
  bounds?: {
    minWidth?: number;
    maxWidth?: number;
  };
  /** The widths the probe actually drove to, in order. */
  requestedWidths?: number[];
  /**
   * The long-text stress pass (#112's text half): every TEXT property set to a
   * long string at once, then measured.
   *
   * All properties at once rather than one pass each: it is one measurement
   * instead of N, and it is also the harsher and more realistic test, since real
   * content is long in more than one slot at a time.
   */
  textStress?: {
    /** Why there was no stress pass - usually that the set defines no text properties. */
    skipped?: string;
    /** What drifted under long text. */
    anomalies?: Anomaly[];
  };
}

export interface ComponentSetSnapshot {
  id: string;
  name: string;
  /** Standalone components (no variants) are valid QA subjects too. */
  type: "COMPONENT_SET" | "COMPONENT";
  description: string;
  /**
   * URIs from the component's Figma documentation-link field (#19). Absent
   * when there are none, the common case, since QA routinely runs before
   * documentation exists.
   */
  documentationLinks?: string[];
  /** Component property names in declaration order (#4). */
  propertyNames: string[];
  properties: ComponentPropertySnapshot[];
  variants: VariantSnapshot[];
  /**
   * The subject and any ancestor pinning explicit variable modes (#17).
   * Absent when nothing in the ancestry pins a mode.
   */
  pinnedAncestors?: PinnedAncestorSnapshot[];
  /** Per-mode variable resolution (#17). Absent when the probe didn't run. */
  theme?: ThemeSnapshot;
  /** Measured resize behaviour (#7's resize half). Absent when the probe didn't run. */
  resizeProbe?: ResizeProbeSnapshot;
  /**
   * Fill styles referenced anywhere in the set, keyed by style id (#16).
   * Memoized by the collector, so cost scales with distinct styles rather than
   * with layers. Absent when the set references no fill styles.
   */
  colorStyles?: Record<string, ColorStyleSnapshot>;
}
