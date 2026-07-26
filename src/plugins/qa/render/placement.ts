/**
 * Where a rebuilt QA checklist frame goes — pure decision, no Figma.
 *
 * Extracted from renderChecklist so the rule is unit-testable: it caused a real
 * bug (a checklist keyed on the component *set* but anchored to whatever node
 * each call happened to target, so an agent run passing the set's id silently
 * dragged the designer's frame off the instance's page).
 */

export type PlacementDecision =
  /** Place beside the anchor this call passed in. */
  | { kind: "anchor" }
  /** Place beside the node the frame was first built against. */
  | { kind: "remembered"; anchorId: string }
  /** Reuse the replaced frame's own parent and offset. */
  | { kind: "in-place" };

export interface PlacementInput {
  /**
   * Whether this call carried placement intent: an explicit anchorNodeId, or a
   * target that is a placed node rather than the component set itself.
   */
  relocate: boolean;
  /** Whether a prior checklist frame for this target was found. */
  hasPrior: boolean;
  /** Anchor recorded on the prior frame's stamp (absent on v1 stamps). */
  rememberedAnchorId?: string;
}

export function decidePlacement(input: PlacementInput): PlacementDecision {
  // Deliberate placement always wins — this is how a checklist gets moved.
  if (input.relocate) return { kind: "anchor" };

  // No intent expressed: keep tracking whatever the frame was first built
  // beside, so it follows the instance even if the instance moved.
  if (input.rememberedAnchorId) {
    return { kind: "remembered", anchorId: input.rememberedAnchorId };
  }

  // Pre-v2 stamp: no remembered anchor, but we still know where the frame sat.
  if (input.hasPrior) return { kind: "in-place" };

  // First build for this target.
  return { kind: "anchor" };
}
