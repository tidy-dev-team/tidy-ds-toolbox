/**
 * Serializable snapshot of a component set — the boundary between the
 * figma-touching collector and the pure Tier 1 check functions
 * `(snapshot) → CheckResult` (issue #76, two-layer testability).
 *
 * Everything here must stay plain JSON so check tests can use fixture
 * snapshots without the Figma API.
 */

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
   * absent-because-this-node-has-no-fills: picking "the first fill" of a
   * mixed run would be a confidently wrong contrast answer, so #16 declines to
   * evaluate the layer and counts it in the skipped tally instead.
   */
  fillsMixed?: boolean;
  /**
   * TEXT nodes: font size in px (#16 threshold). When ranges differ this is
   * the **smallest** size used - the strictest applicable threshold, so a
   * mixed run is judged on its worst case rather than on its heading.
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
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  /** "MIXED" when per-corner radii differ. */
  cornerRadius?: number | "MIXED";
  strokeWeight?: number | "MIXED";

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

export interface ComponentSetSnapshot {
  id: string;
  name: string;
  /** Standalone components (no variants) are valid QA subjects too. */
  type: "COMPONENT_SET" | "COMPONENT";
  description: string;
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
  /**
   * Fill styles referenced anywhere in the set, keyed by style id (#16).
   * Memoized by the collector, so cost scales with distinct styles rather than
   * with layers. Absent when the set references no fill styles.
   */
  colorStyles?: Record<string, ColorStyleSnapshot>;
}
