/**
 * What to paint behind the component in each theme mode (issue #141).
 *
 * **Why a surface at all.** #121 pinned the component to each mode but left the
 * stages transparent, so both showed against the card's white. A dark-mode
 * component on white is not what dark mode looks like anywhere, and the gap row
 * 17's visual half exists to close is precisely a non-text element - icon,
 * border, divider - vanishing into the surface. That cannot be judged when the
 * surface is white in every column.
 *
 * **Why it is a neutral grey and not the theme's real surface.** The first
 * attempt looked for a page-surface token among the resolved theme variables and
 * painted it per mode. On the reference `Button` it picked `bg/brand` and painted
 * the stage the button's own purple, so the button vanished into its own backdrop
 * - strictly worse than transparent.
 *
 * That was not a bad heuristic but a wrong premise. `ThemeSnapshot.variables`
 * holds the variables *this component binds*, plus any reached through styles it
 * applies. Every entry is therefore the component's own paint. A button binds
 * `bg/brand` because that is its fill; it never binds the page background,
 * because it does not sit on one. Ranking names inside that pool cannot help -
 * `bg/default` was never in it - and any pick from it is a colour the component
 * paints itself, which is the one colour guaranteed to hide it.
 *
 * So there is deliberately no detection here. Resolving the collection's *actual*
 * page surface means asking Figma for every variable in the collection and
 * resolving the candidate per mode through the probe - tokens the component does
 * not bind - which is a real change to what the snapshot collects and belongs in
 * its own issue rather than bolted onto this one.
 *
 * **Why dark.** The card is already white, so a pale element is what white hides;
 * a dark backdrop is what reveals it. One tone for every mode, not a guess per
 * mode: claiming to know each mode's surface is exactly what this cannot do, and
 * the caption says so rather than implying otherwise.
 */

/**
 * The neutral stage. Dark enough to expose a pale element, and not pure black, so
 * it reads as a deliberate backdrop rather than as a hole.
 */
export const NEUTRAL_STAGE = "#2E2E2E";

/**
 * What the block says about the surface it painted.
 *
 * States plainly that this is a test backdrop rather than either mode's real
 * surface, because a reader who assumed otherwise would draw conclusions about
 * contrast that the picture does not support.
 */
export const STAGE_CAPTION =
  "Stages use a neutral grey - a test backdrop, not the real surface of either mode, so judge whether anything disappears rather than how it looks against it.";
