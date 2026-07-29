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

/** What the block says about the backdrop it painted. */
export function surfaceCaption(surfaceTokenName: string | undefined): string {
  return surfaceTokenName
    ? `Backdrops are the "${surfaceTokenName}" token resolved per mode. If that is not the surface these sit on, the backdrop is wrong even though the component may not be.`
    : "No surface token was found, so backdrops are a neutral approximated from each mode's name - judge whether anything disappears, not how it looks against them.";
}
