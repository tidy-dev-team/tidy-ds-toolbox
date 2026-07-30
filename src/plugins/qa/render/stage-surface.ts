import { isDarkModeName } from "../../../shared/theme-surface";

/**
 * What the per-mode block says about the backdrop behind each instance (#141).
 *
 * **The history matters, because two attempts were wrong.** #121 left the stages
 * transparent, so both columns showed against the card's white and a dark mode did
 * not look dark. The first fix ranked surface-looking names among the *resolved
 * theme variables* and picked `bg/brand` - the button's own fill - painting it
 * invisible. The second inferred a backdrop from the mode's name, which looked
 * right on a two-mode file and still left a four-mode component rendering
 * identically in every column.
 *
 * **What actually works** was already in the repo: tidy-doc's Mode Section binds
 * the backdrop to the DS surface token and, crucially, pins the *separate*
 * light/dark collection that token resolves through. A brand or vertical
 * collection can carry mode names that read as themes - "Industrial Dark" - while
 * the tokens that make a surface dark live elsewhere, so pinning only the widest
 * collection changes nothing visible. That logic is now shared in
 * `shared/theme-surface.ts` rather than reimplemented here.
 *
 * All that is left in this file is the caption, because what the block *claims*
 * is the part that has to stay honest: naming the token is how a wrong backdrop
 * reads as a wrong backdrop instead of as a broken component (#127's lesson).
 */

/**
 * The fallback backdrop when the DS exposes no surface token.
 *
 * **A dark mode gets one; nothing else does.** Painting a pale box behind a
 * light-mode component adds a surface the component does not have - the card is
 * already the surface it sits on - and that box then reads as part of the
 * component. A collection whose modes are brands rather than polarities
 * ("Isracard", "Amex") has no dark theme at all, so none of its columns should
 * gain a backdrop.
 *
 * A dark-named mode is the one case where doing nothing is wrong: showing a
 * dark-mode component against the white card misrepresents it just as badly.
 *
 * Achromatic on purpose. It sits behind arbitrary components, so any colour cast
 * reads as belonging to the component - borrowing tidy-doc's cool grey (#F0F2F7)
 * made a blue-accented slider look like it had a lavender background of its own.
 */
export const NEUTRAL_DARK = "#2E2E2E";

/** The backdrop for a mode, or null to leave the stage transparent. */
export function fallbackStage(modeName: string): string | null {
  return isDarkModeName(modeName) ? NEUTRAL_DARK : null;
}

/** What the block says about the backdrop it painted. */
export function surfaceCaption(surfaceTokenName: string | undefined): string {
  return surfaceTokenName
    ? `Backdrops are the "${surfaceTokenName}" token resolved per mode. If that is not the surface these sit on, the backdrop is wrong even though the component may not be.`
    : "No surface token was found. A mode whose name says dark gets a neutral dark backdrop so it is not judged against white; every other mode is shown as it is, with nothing added behind it.";
}
