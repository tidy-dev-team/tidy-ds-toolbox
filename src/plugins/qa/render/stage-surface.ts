/**
 * What to paint behind the component in each theme mode - pure decision, no
 * Figma (issue #141).
 *
 * **Why this exists.** #121 put the component in a frame pinned to each mode, but
 * left those frames transparent, so both showed against the card's white. A
 * dark-mode component on white is not what dark mode looks like anywhere, and the
 * gap row 17's visual half exists to close is precisely a non-text element - an
 * icon, border, divider - vanishing into the surface. That cannot be judged when
 * the surface is white in every column. The colours differing was visible; the
 * thing being asked about was not.
 *
 * **Two answers, and it says which one it gave.** When the theme collection holds
 * something that looks like a page surface, each stage is painted with that
 * token's value for its own mode, and the block names the token - so a wrong pick
 * is visible rather than quietly misleading, which is the lesson #127 already
 * learned about picking the collection.
 *
 * Otherwise one neutral dark surface, for every mode, captioned as neutral. That
 * fallback is not a detail: the toolbox gets pointed at elements that are not
 * from a well-formed DS, where there is no token to find and no themed surface to
 * reproduce - and those are exactly the cases where "does this disappear" matters
 * most. Dark rather than light because the card is already white, so a pale
 * element that white hides is what a neutral surface should reveal.
 */

import type { ThemeSnapshot } from "../snapshot";

/**
 * The neutral stage, used when no page surface can be identified. Dark enough to
 * expose a pale element, and not pure black, so it reads as a deliberate backdrop
 * rather than as a hole.
 */
export const FALLBACK_SURFACE = "#2E2E2E";

/**
 * Names that look like a page surface. `bg`, `background` or `surface` as a whole
 * path segment, so `text/on-surface` does not qualify on a substring.
 */
const SURFACE_NAME = /(^|[/\-_.])(bg|background|surface)([/\-_.]|$)/i;

/**
 * Surfaces that belong to a *state* or a component rather than to the page.
 * Painting a hover background behind the component would show it against a
 * colour it never actually sits on.
 */
const NOT_A_PAGE_SURFACE =
  /(hover|press|active|focus|disabled|selected|error|warning|success|danger|inverse)/i;

/** Ranked hints that a surface is *the* default one. Lower scores win. */
const DEFAULT_HINTS = [
  /(^|[/\-_.])(default)([/\-_.]|$)/i,
  /(^|[/\-_.])(page|canvas|body)([/\-_.]|$)/i,
  /(^|[/\-_.])(base|primary)([/\-_.]|$)/i,
];

export interface StageSurfacePlan {
  /** Whether the fill came from a token or from the neutral fallback. */
  source: "token" | "fallback";
  /** The token painted, when one was found. Named on the block either way. */
  tokenName?: string;
  /** Mode id to hex. Every mode of the theme collection is present. */
  byMode: Record<string, string>;
}

function hintRank(name: string): number {
  const index = DEFAULT_HINTS.findIndex((hint) => hint.test(name));
  return index === -1 ? DEFAULT_HINTS.length : index;
}

/** Segment count, so `bg/default` beats `bg/default/subtle` on a tie. */
function depth(name: string): number {
  return name.split("/").length;
}

/**
 * The surface to paint per mode.
 *
 * A candidate has to resolve to a colour in *every* mode: half the point is that
 * both stages show a real surface, and a token that resolves in light but not
 * dark cannot be compared against.
 */
export function planStageSurface(theme: ThemeSnapshot): StageSurfacePlan {
  const modeIds = theme.modes.map((mode) => mode.modeId);

  const candidates = Object.values(theme.variables)
    .filter(
      (variable) =>
        // Variables reached through a shared style are resolved too (#16 needs
        // their per-mode colour) but belong to another collection and say nothing
        // about this theme axis.
        variable.collectionId === theme.collectionId &&
        SURFACE_NAME.test(variable.name) &&
        !NOT_A_PAGE_SURFACE.test(variable.name),
    )
    .map((variable) => {
      const byMode: Record<string, string> = {};
      for (const modeId of modeIds) {
        const resolved = variable.byMode[modeId];
        if (resolved?.ok && resolved.type === "COLOR" && resolved.hex) {
          byMode[modeId] = resolved.hex;
        }
      }
      return { name: variable.name, byMode };
    })
    .filter(
      (candidate) => Object.keys(candidate.byMode).length === modeIds.length,
    )
    // Deterministic: hint rank, then the shallower name, then alphabetical - so
    // the same file always produces the same pick and the caption never changes
    // between runs for no reason.
    .sort(
      (a, b) =>
        hintRank(a.name) - hintRank(b.name) ||
        depth(a.name) - depth(b.name) ||
        a.name.localeCompare(b.name),
    );

  const picked = candidates[0];
  if (picked) {
    return { source: "token", tokenName: picked.name, byMode: picked.byMode };
  }

  return {
    source: "fallback",
    byMode: Object.fromEntries(modeIds.map((id) => [id, FALLBACK_SURFACE])),
  };
}

/** What the block should say about the surface it painted. */
export function surfaceCaption(plan: StageSurfacePlan): string {
  return plan.source === "token"
    ? `Stages painted with "${plan.tokenName}" per mode. If that is not the surface these sit on, the backdrop is wrong even though the component is not.`
    : "No page-surface token was found, so stages use a neutral grey - a test backdrop, not the surface of either mode.";
}
