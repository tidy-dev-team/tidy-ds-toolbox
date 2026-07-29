/// <reference types="@figma/plugin-typings" />

/**
 * Resolving a design system's surface token, and pinning the collection that
 * carries light/dark polarity.
 *
 * Extracted from tidy-doc's Mode Section (#55), which had already solved this,
 * when the QA per-mode showcase (#121) got it wrong: sharing it is how the two
 * stop disagreeing about what "this component in dark mode" means. The sibling
 * `theme-collection.ts` shares the *primary collection* pick for the same reason.
 *
 * **The thing that is easy to miss.** A brand or vertical collection can carry
 * mode names that read as themes - "Industrial Dark", "Healthcare Light" - while
 * the tokens that actually make a surface dark live in a *separate* light/dark
 * collection. Pinning only the collection with the most modes therefore leaves
 * the component looking identical in every mode, because the collection its
 * colours resolve through was never pinned at all. `polarityModeId` is what
 * closes that, and `#121`'s showcase failed exactly this way before it did.
 */

/**
 * Surface tokens worth binding a backdrop to, in preference order. Matched on the
 * variable's full name, lowercased.
 */
export const SURFACE_VARIABLE_NAMES = [
  "bg/surface",
  "background/surface",
  "surface",
  "bg/default",
  "background",
];

/**
 * The DS surface variable to bind a themed backdrop to, searched across the
 * component's bound collections - which is where the theme collection lives.
 *
 * Reads each collection's own `variableIds`, so it sees tokens the component does
 * not bind. That matters: a component never binds the page background, because it
 * does not sit on one, so a search restricted to the component's own bindings can
 * only ever find its own paint.
 *
 * Returns null when the DS exposes no recognisable surface token, so the caller
 * falls back to a neutral.
 */
export async function resolveSurfaceVariable(
  collections: VariableCollection[],
): Promise<Variable | null> {
  const ids = collections.flatMap((collection) => collection.variableIds);
  const fetched = await Promise.all(
    ids.map((id) => figma.variables.getVariableByIdAsync(id)),
  );
  const byName = new Map<string, Variable>();
  for (const variable of fetched) {
    if (variable && variable.resolvedType === "COLOR") {
      byName.set(variable.name.toLowerCase(), variable);
    }
  }
  for (const name of SURFACE_VARIABLE_NAMES) {
    const variable = byName.get(name);
    if (variable) return variable;
  }
  return null;
}

/** Just the shape `polarityModeId` reads, so it can be tested without Figma. */
export interface ModeNamesOnly {
  modes: readonly { modeId: string; name: string }[];
}

/**
 * The light/dark mode of a collection matching a theme's polarity.
 *
 * The surface token (e.g. `bg/surface`) often lives in a separate light/dark
 * collection from the brand theme collection, so a "…Dark" brand theme still
 * needs that collection pinned to its dark mode before anything actually goes
 * dark.
 */
export function polarityModeId(
  collection: ModeNamesOnly,
  wantDark: boolean,
): string | null {
  const needle = wantDark ? "dark" : "light";
  const mode = collection.modes.find((m) =>
    m.name.toLowerCase().includes(needle),
  );
  return mode?.modeId ?? null;
}

/** Whether a mode name reads as a dark theme. */
export function isDarkModeName(modeName: string): boolean {
  return /dark/i.test(modeName);
}

/**
 * Fallback backdrop when the DS exposes no surface token: a theme-appropriate
 * neutral approximated from the mode name.
 */
export function neutralSurfaceFill(modeName: string): SolidPaint {
  const color = isDarkModeName(modeName)
    ? { r: 0.06, g: 0.07, b: 0.09 }
    : { r: 0.94, g: 0.95, b: 0.97 };
  return { type: "SOLID", color };
}
