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
  /** INSTANCE nodes only: the main component this instance points to. */
  mainComponentId?: string;

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
