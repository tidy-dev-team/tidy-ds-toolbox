/**
 * What to paint behind the component in each theme mode (issue #141).
 *
 * **Why a backdrop at all.** #121 pinned the component to each mode but left the
 * stages transparent, so both showed against the card's white. A dark-mode
 * component on white is not what dark mode looks like anywhere, and the gap row
 * 17's visual half exists to close is precisely a non-text element - icon,
 * border, divider - vanishing into the surface. That cannot be judged when the
 * surface is white in every column.
 *
 * **Why the mode's *name* decides it.** The obvious source is the theme itself,
 * and it does not work: `ThemeSnapshot.variables` holds the variables the
 * component *binds*, plus any reached through styles it applies, so every entry
 * is the component's own paint. The first attempt ranked names inside that pool
 * and picked `bg/brand` on the reference Button - the button's own fill - which
 * painted it into invisibility. `bg/default` was never in the pool to be
 * preferred, and any pick from it is the one colour guaranteed to hide what sits
 * on it. Resolving the collection's real page surface needs the probe to resolve
 * tokens the component does not bind, which is filed separately (#144).
 *
 * So the mode name is the only signal available, and it is used as exactly that:
 * a light-named mode gets a light backdrop, a dark-named one a dark backdrop, and
 * a name that says nothing gets the neutral dark. The block states that the
 * backdrops were inferred from names, so a wrong inference reads as a wrong
 * backdrop rather than as a broken component - the #127 pattern.
 *
 * **Why the neutral default is dark.** The card is already white, so a pale
 * element is the one white hides; a dark backdrop is what reveals it. One tone
 * cannot catch both directions of vanishing (#144 has the arithmetic), so the
 * default errs toward the failure that bites more often.
 */

import { contrastRatio } from "../contrast";
import type { ThemeModeSnapshot } from "../snapshot";
import { CARD } from "./primitives";

/** Backdrop for a mode that reads as light. */
export const LIGHT_STAGE = "#FFFFFF";

/**
 * Backdrop for a mode that reads as dark, and the neutral default. Dark enough to
 * expose a pale element, and not pure black, so it reads as a deliberate backdrop
 * rather than as a hole.
 */
export const DARK_STAGE = "#2E2E2E";

/**
 * Whole words only: a mode called "Highlight" is not a light mode, and matching
 * on a substring would say it was.
 */
const LIGHT_NAME = /\b(light|lite|day)\b/i;
const DARK_NAME = /\b(dark|night)\b/i;

/**
 * Below this, a backdrop is close enough to the card that its edge disappears.
 * Just above 1, since the only question is whether *any* boundary is visible.
 */
const MIN_EDGE_CONTRAST = 1.2;

export interface StageSurfacePlan {
  /** Mode id to backdrop hex. Every mode passed in is present. */
  byMode: Record<string, string>;
  /**
   * Whether every mode's backdrop came from reading its name. False when at least
   * one fell back to the neutral, which the caption then says.
   */
  allInferred: boolean;
}

/** The backdrop for each mode, inferred from its name. */
export function planStageSurfaces(
  modes: readonly ThemeModeSnapshot[],
): StageSurfacePlan {
  const byMode: Record<string, string> = {};
  let allInferred = true;

  for (const mode of modes) {
    if (LIGHT_NAME.test(mode.name)) {
      byMode[mode.modeId] = LIGHT_STAGE;
    } else if (DARK_NAME.test(mode.name)) {
      byMode[mode.modeId] = DARK_STAGE;
    } else {
      byMode[mode.modeId] = DARK_STAGE;
      allInferred = false;
    }
  }

  return { byMode, allInferred };
}

/**
 * Whether a backdrop needs a hairline outline to be visible as a stage.
 *
 * A white backdrop on the white card has no edge at all, so that column would
 * read as having no stage while its neighbour clearly does. Decided by contrast
 * against the card rather than by comparing to a list of pale colours, so it
 * keeps holding if either the card or the backdrops change.
 */
export function needsOutline(stage: string): boolean {
  return contrastRatio(stage, CARD) < MIN_EDGE_CONTRAST;
}

/** What the block says about the backdrops it painted. */
export function surfaceCaption(plan: StageSurfacePlan): string {
  return plan.allInferred
    ? "Backdrops are inferred from the mode names, not from your surface tokens - judge whether anything disappears, not how it looks against them."
    : "Backdrops are inferred from the mode names; any mode whose name did not say gets a neutral grey. They are not your surface tokens.";
}
