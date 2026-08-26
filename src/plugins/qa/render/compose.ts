/**
 * The decisions a checklist build makes about the block of artifacts it draws -
 * pure, no Figma.
 *
 * `tidy_qa_build_checklist` draws up to four things beside the target: the
 * checklist itself, the per-mode showcase (#121), the resize evidence (#111) and
 * the property contact sheet (#112). Which of them exist depends on the
 * component, so composing them is not a fixed layout but a series of small
 * judgements - whether an existing checklist should be moved, where the next
 * block starts given what is already standing, what the run made of row 17.
 *
 * Those judgements used to live in the Operation, where nothing could reach them
 * without a live document, and they are exactly the half most likely to be
 * wrong. Extracted here for the same reason `placement.ts` and `mode-showcase.ts`
 * were: the drawing is not the risky part.
 */

import type { ThemeSnapshot } from "../snapshot";
import type { CheckResult, CheckStatus } from "../types";

/** Vertical breathing room between two stacked blocks beside the checklist. */
export const BLOCK_GAP = 32;

/** What the relocation decision needs, as one value rather than three positionals. */
export interface RelocateInput {
  /** Whether the call named an `anchorNodeId`. */
  anchorRequested: boolean;
  /** The node the run started from, or null on the name/glob path. */
  originId: string | null;
  /** The component set the checklist is keyed on. */
  targetId: string;
}

/**
 * Whether this call should *move* an existing checklist.
 *
 * Pointing at a placed node - a selected instance, an explicit `anchorNodeId` -
 * is a deliberate "put it here". Targeting the component set itself (an agent
 * passing the set's id, or the set being selected) is not: it resolves to the
 * same node the checklist is keyed on, carries no placement intent, and must not
 * drag the designer's frame off the instance's page.
 */
export function decideRelocate(input: RelocateInput): boolean {
  return (
    input.anchorRequested ||
    (input.originId !== null && input.originId !== input.targetId)
  );
}

/**
 * Where the next block starts, given the heights of the blocks already standing.
 *
 * The blocks beside the checklist stack downward, each below whatever was placed
 * above it. A block that was not drawn is simply absent from `placed`, which is
 * what stops the common case - a healthy component draws no evidence - from
 * leaving a gap where nothing stands.
 */
export function stackTop(placed: readonly number[], gap: number): number {
  return placed.reduce((top, height) => top + height + gap, 0);
}

/**
 * What the `themes` check made of this set, or undefined when the run did not
 * evaluate it.
 *
 * The absence is meaningful and is not a refusal: a filtered run can resolve a
 * theme without evaluating row 17, and an agent that asked to see the modes has
 * still asked. `planModeShowcase` is where that is honoured.
 */
export function themesStatusOf(
  results: readonly CheckResult[],
): CheckStatus | undefined {
  return results.find((r) => r.checkId === "themes")?.status;
}

/**
 * Every collection the set binds a variable from, each named once.
 *
 * The showcase pins these as well as the theme collection itself, so that the
 * collection actually carrying light/dark polarity is pinned even when it is not
 * the one the probe resolved against.
 */
export function boundCollectionIds(theme: ThemeSnapshot | undefined): string[] {
  return [
    ...new Set(
      Object.values(theme?.variables ?? {}).map((v) => v.collectionId),
    ),
  ];
}
