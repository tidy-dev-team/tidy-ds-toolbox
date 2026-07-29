/**
 * Whether to show the component per theme mode, and against which modes - pure
 * decision, no Figma (issue #121).
 *
 * Extracted for the same reason `placement.ts` was: the rule is the part likely
 * to be wrong, and it is worth a test rather than a careful reading.
 *
 * **What this is for.** Row 17 asks that the component work *and look good* in
 * every mode. The automatable half shipped - `themes` establishes that every
 * bound variable resolves, and `high-contrast` measures text in every mode - so
 * what is left is genuinely visual and genuinely narrow: non-text elements. An
 * icon, border or divider that vanishes into the surface in dark mode is
 * invisible to every check in the engine. Nothing here judges that; it just puts
 * the two modes side by side so the person ticking the row can see it at a
 * glance instead of switching modes and remembering.
 *
 * **It cannot fail.** This is an aid, not a check: row 17's status comes from the
 * `themes` check alone, and the tick stays the only thing that closes the row.
 */

import type { ThemeModeSnapshot, ThemeSnapshot } from "../snapshot";
import type { CheckStatus } from "../types";

/**
 * What the showcase covers, stated so a tick against it is not mistaken for
 * approval of the whole set. Only the default variant is rendered - the same
 * scope the probe resolves against - which keeps the block small enough to sit
 * beside a checklist.
 */
export const COVERAGE_NOTE = "only the set's default variant is shown";

export type ModeShowcasePlan =
  | {
      show: true;
      modes: readonly ThemeModeSnapshot[];
      /**
       * The collection the modes belong to. Carried here so a caller that has
       * narrowed on `show` has everything it needs, rather than re-deriving a
       * fact this decision already established.
       */
      collectionId: string;
      /** Names the limit of what was rendered; see `COVERAGE_NOTE`. */
      coverageNote: string;
    }
  | { show: false; reason: string };

/**
 * Decide whether a per-mode showcase is worth drawing.
 *
 * Suppressed in every case where it would imply a comparison that did not
 * happen. #115 made row 17's manual remainder conditional for exactly this
 * reason: a set with no theme axis renders identically in every mode, so two
 * pictures of it are two identical pictures.
 */
export function planModeShowcase(
  theme: ThemeSnapshot | undefined,
  /**
   * What the `themes` check made of this set. The check owns the question of
   * whether the set has a theme axis at all, and its own documentation defines
   * `not_applicable` as "the component renders identically in every mode, so
   * there is nothing to compare by eye" - which is precisely when a side-by-side
   * comparison would be two identical pictures beside a row chipped "n/a".
   */
  themesStatus: CheckStatus | undefined,
): ModeShowcasePlan {
  if (themesStatus === "not_applicable") {
    return {
      show: false,
      reason: "the themes check reported not applicable for this set",
    };
  }

  if (!theme) {
    return {
      show: false,
      reason: "no theme was resolved for this run",
    };
  }

  if (!theme.collectionId) {
    // Every variable the set binds failed to load, so there is no axis at all -
    // which is a defect `themes` reports, not something to illustrate.
    return {
      show: false,
      reason: "no theme collection could be determined",
    };
  }

  if (theme.modes.length < 2) {
    return {
      show: false,
      reason:
        "the theme collection has only one mode, so every mode looks alike",
    };
  }

  return {
    show: true,
    collectionId: theme.collectionId,
    // The collection's own order, deliberately unsorted: designers read modes in
    // the order Figma lists them, and light-before-dark is a convention we would
    // be imposing rather than observing.
    modes: theme.modes,
    coverageNote: COVERAGE_NOTE,
  };
}
