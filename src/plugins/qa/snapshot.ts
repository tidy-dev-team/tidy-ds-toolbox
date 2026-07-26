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
     * Publish key — stable across files, so it is the dedupe key for "one
     * finding per offending main component" (#8).
     */
    key: string;
    name: string;
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
}

export interface VariantSnapshot {
  id: string;
  name: string;
  /** e.g. { Size: "Medium", State: "Default" } — empty for standalone components (#13). */
  variantProperties: Record<string, string>;
  tree: NodeSnapshot;
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
}
