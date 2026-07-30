/**
 * The structural pre-scan for #7's resize half (#111): every container in the set
 * that will spread its content apart if it is ever stretched.
 *
 * **Why this exists next to a probe that measures.** The probe resizes exactly one
 * variant - `defaultVariant` - because instancing and measuring every variant is
 * the kind of combinatorial cost #112 was re-scoped to avoid. But responsiveness
 * bugs genuinely are variant-specific: an icon-only variant can spread while the
 * label variant is fine. This scan costs nothing, reads the whole set, and so
 * recovers most of the coverage the probe's one-variant scope gives up.
 *
 * **Why a structural scan can see it at all.** The canonical
 * "looks fine at rest, breaks when stretched" defect is
 * `primaryAxisAlignItems: "SPACE_BETWEEN"` on a container that can grow. At its
 * default width it looks perfect; widen it and the icon flies to the far left, the
 * label to the far right, and there is a 280px hole in the middle. Both halves of
 * that trigger are plain snapshot fields, which continues the pattern #110 found:
 * the frightening failure turns out to be readable without rendering anything.
 *
 * **Always a candidate, never a verdict.** `SPACE_BETWEEN` with a stretching width
 * is exactly correct for a select, a dropdown, a list row or a nav item. The
 * combination is suspicious; it is never wrong on its own. What upgrades it to a
 * stated fact is the probe *measuring* the gap - see `anomalies.ts` - and even then
 * the measurement is reported rather than ruled on.
 */

import type { ComponentSetSnapshot, NodeSnapshot } from "../snapshot";

/** One container that will spread its content if stretched. */
export interface StretchRisk {
  nodeId: string;
  nodeName: string;
  /** The variant it was found in - the scan covers all of them. */
  variantId: string;
  variantName: string;
  /** Visible children it would spread apart. */
  childCount: number;
}

/**
 * Whether stretching this container distributes free space between its children.
 *
 * Three conditions, and each excludes a case that would otherwise be a false
 * positive:
 *
 * - The primary axis must be **horizontal**, because the probe drives width. A
 *   vertical stack with `SPACE_BETWEEN` distributes vertically, and widening it
 *   spreads nothing.
 * - The container must not **HUG**. Hugging means the frame is exactly as wide as
 *   its content, so `SPACE_BETWEEN` has no free space to distribute and nothing
 *   can spread. `FILL` and `FIXED` both can: `FILL` stretches with its parent, and
 *   a `FIXED` component is stretched by a designer dragging its edge, which
 *   produces exactly the same hole.
 * - There must be at least **two visible children**. With one child
 *   `SPACE_BETWEEN` behaves as `MIN`, so there is no gap to grow.
 */
function spreadsWhenStretched(node: NodeSnapshot): boolean {
  return (
    node.layoutMode === "HORIZONTAL" &&
    node.primaryAxisAlignItems === "SPACE_BETWEEN" &&
    node.layoutSizingHorizontal !== "HUG" &&
    node.layoutSizingHorizontal !== undefined &&
    node.children.filter((child) => child.visible).length >= 2
  );
}

/**
 * Every stretch risk in the set, one entry per node per variant it appears in.
 *
 * Left un-deduped on purpose: variants share their layers, so a single container
 * is a separate node in every variant, and merging that back into one finding is
 * `dedupeFindings`' job at the run boundary (#118). Doing it here would give this
 * scan its own aggregation key to keep in step with everything else's.
 */
export function stretchRisks(snapshot: ComponentSetSnapshot): StretchRisk[] {
  const risks: StretchRisk[] = [];

  for (const variant of snapshot.variants) {
    const visit = (node: NodeSnapshot) => {
      // A hidden container spreads nothing anyone can see, and neither does
      // anything inside it.
      if (!node.visible) return;
      if (spreadsWhenStretched(node)) {
        risks.push({
          nodeId: node.id,
          nodeName: node.name,
          variantId: variant.id,
          variantName: variant.name,
          childCount: node.children.filter((child) => child.visible).length,
        });
      }
      for (const child of node.children) visit(child);
    };
    visit(variant.tree);
  }

  return risks;
}
