// Pure fact-derivation helpers for the Component Breakdown Section
// (CONTEXT.md "Component Breakdown"): a fixed, ordered catalogue of derived
// anatomy sub-sections (v1: Height, Width, Icon placement), each rendered
// only when the component exposes the relevant fact. Kept Figma-independent
// — deriveFacts.ts (Figma-touching) supplies the plain descriptors these
// operate on, so the matching/detection logic can be unit tested without a
// Figma runtime (mirrors categorizeAxes.ts).

export interface SizeMeasurement {
  value: string;
  height: number;
  verticalSizing: "FIXED" | "HUG" | "FILL";
}

export interface WidthFact {
  minWidth: number | null;
  maxWidth: number | null;
}

export type IconPropertyType = "VARIANT" | "BOOLEAN" | "INSTANCE_SWAP";

export interface IconPlacementFact {
  propertyName: string;
  propertyType: IconPropertyType;
  values: string[];
}

export interface PropertyDescriptor {
  name: string;
  type: "VARIANT" | "BOOLEAN" | "INSTANCE_SWAP" | "TEXT";
  values?: string[];
}

export type HorizontalSizingMode = "FIXED" | "HUG" | "FILL";

/**
 * Constraints redline fact (#66): the matching variant's width + horizontal
 * sizing mode for one (size × column-combination) cell of the vertical
 * layout's Component Variants matrix (matrixModel.ts). Component-set only.
 */
export interface ConstraintWidthFact {
  sizeLabel: string | null;
  columnLabel: string;
  familyValue: string | null;
  width: number;
  horizontalSizing: HorizontalSizingMode;
  minWidth: number | null;
  maxWidth: number | null;
}

export interface VariantChildDescriptor {
  variantProperties: Record<string, string> | null;
}

/**
 * Width sub-section fact: present only when the component declares at least
 * one of minWidth/maxWidth (an auto-layout size constraint) — never both
 * required, per the presence-only rule (ADR-0007).
 */
export function deriveWidthFact(
  minWidth: number | null,
  maxWidth: number | null,
): WidthFact | null {
  if (minWidth === null && maxWidth === null) return null;
  return { minWidth, maxWidth };
}

/**
 * Detect an icon-placement property among a component's declared
 * properties (icon-variant detection, CONTEXT.md "Component Breakdown").
 * Precedence: an explicit VARIANT axis naming icon positions (e.g.
 * "Icon Position": Leading/Trailing/None) beats a BOOLEAN presence toggle,
 * which beats a bare INSTANCE_SWAP slot with no placement values of its own.
 */
export function detectIconPlacement(
  descriptors: PropertyDescriptor[],
): IconPlacementFact | null {
  const iconLike = descriptors.filter((d) => /icon/i.test(d.name));
  if (iconLike.length === 0) return null;

  const variant = iconLike.find((d) => d.type === "VARIANT");
  if (variant) {
    return {
      propertyName: variant.name,
      propertyType: "VARIANT",
      values: variant.values ?? [],
    };
  }

  const bool = iconLike.find((d) => d.type === "BOOLEAN");
  if (bool) {
    return {
      propertyName: bool.name,
      propertyType: "BOOLEAN",
      values: ["True", "False"],
    };
  }

  const swap = iconLike.find((d) => d.type === "INSTANCE_SWAP");
  if (swap) {
    return {
      propertyName: swap.name,
      propertyType: "INSTANCE_SWAP",
      values: [],
    };
  }

  return null;
}

/**
 * Find the child variant whose variantProperties match every key in
 * `target` (a size value plus every other axis pinned to its rest-state
 * default). Returns null when no exact match exists rather than guessing —
 * the Height sub-section drops that size value and logs it (skip-when-empty,
 * one level down).
 */
/**
 * Width-label rule (#66, pure, unit-tested): a fixed-width variant is
 * labeled `Fixed <rounded width>`; a hugging or filling variant is labeled
 * `Hug`/`Fill` and is never prefixed "Fixed", so a content-driven width is
 * never presented as a hard constraint to the engineer reading the page.
 */
export function widthConstraintLabel(
  horizontalSizing: HorizontalSizingMode,
  width: number,
  minWidth: number | null = null,
  maxWidth: number | null = null,
): string {
  if (horizontalSizing === "FIXED") return `fixed ${Math.round(width)}`;
  // A HUG/FILL variant clamped to minWidth === maxWidth cannot actually
  // resize — its width is fixed by the constraint, so label it as such.
  if (minWidth !== null && maxWidth !== null && minWidth === maxWidth) {
    return `fixed ${Math.round(minWidth)}`;
  }
  return horizontalSizing === "HUG" ? "hug" : "fill";
}

export function findMatchingVariantIndex(
  children: VariantChildDescriptor[],
  target: Record<string, string>,
): number | null {
  const index = children.findIndex((child) => {
    if (!child.variantProperties) return false;
    return Object.entries(target).every(
      ([key, value]) => child.variantProperties![key] === value,
    );
  });
  return index === -1 ? null : index;
}
