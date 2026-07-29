/// <reference types="@figma/plugin-typings" />

/**
 * Drawing the per-mode showcase (issue #121).
 *
 * The figma-touching half; the decision of *whether* to draw and against which
 * modes is `mode-showcase.ts`, which stays pure and tested.
 */

import type { ModeShowcasePlan } from "./mode-showcase";
import {
  autoLayout,
  card,
  FONT_BOLD,
  FONT_REGULAR,
  INK,
  loadRenderFonts,
  MUTED,
  text,
} from "./primitives";

/** Stamp so a rebuild replaces its own prior block instead of stacking copies. */
const SHOWCASE_DATA_KEY = "tidy:qa-mode-showcase";

const GAP_FROM_ANCHOR = 32;

export type ShowcaseSubject = ComponentSetNode | ComponentNode;

/** The component this showcase illustrates: the set's default variant. */
function instantiable(subject: ShowcaseSubject): ComponentNode | null {
  return subject.type === "COMPONENT_SET" ? subject.defaultVariant : subject;
}

/**
 * Build the per-mode block: one column per mode, each holding an instance inside
 * a frame pinned to that mode, so Figma resolves the component's own variables
 * per column and the two sit side by side.
 *
 * The wrapper frames are transparent, so what you see is what the component
 * paints for itself. A component that relies on the page behind it for contrast
 * will therefore look thinner here than in place - stated on the block rather
 * than papered over by inventing a surface colour we have no way to identify.
 *
 * Returns null when the set has no instantiable component (an empty set).
 */
export async function buildModeShowcase(
  plan: Extract<ModeShowcasePlan, { show: true }>,
  subject: ShowcaseSubject,
  collectionId: string,
): Promise<FrameNode | null> {
  const main = instantiable(subject);
  if (!main) return null;

  const collection =
    await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) return null;

  await loadRenderFonts();

  // `createFrame` parents to the current page immediately, so from here on every
  // step is a litter risk: `createInstance`, a stale `modeId`, a font that failed
  // to load. Guarded at the point of creation rather than at each call site,
  // because #131 has already been round this loop - the guarantee has to be
  // structural, and both callers would otherwise have to remember.
  const root = autoLayout(`Themes - ${subject.name}`, "VERTICAL", 24, 24, 16);
  try {
    return buildInto(root, plan, main, collection);
  } catch (error) {
    root.remove();
    throw error;
  }
}

function buildInto(
  root: FrameNode,
  plan: Extract<ModeShowcasePlan, { show: true }>,
  main: ComponentNode,
  collection: VariableCollection,
): FrameNode {
  root.counterAxisSizingMode = "AUTO";
  card(root);

  root.appendChild(text(root.name, 16, FONT_BOLD, INK));
  root.appendChild(
    text(
      `${plan.modes.length} modes of "${collection.name}" - ${plan.coverageNote}`,
      11,
      FONT_REGULAR,
      MUTED,
    ),
  );

  const columns = autoLayout("modes", "HORIZONTAL", 0, 0, 16);
  columns.counterAxisAlignItems = "MIN";
  root.appendChild(columns);

  for (const mode of plan.modes) {
    const column = autoLayout(mode.name, "VERTICAL", 0, 0, 8);
    column.appendChild(text(mode.name, 12, FONT_BOLD, INK));

    // The pinned frame is what makes this work: Figma resolves the instance's
    // variables against the mode explicitly set here, so one canvas shows every
    // mode at once - which is the whole ask, since nothing in a file otherwise
    // ever shows two modes together.
    const stage = autoLayout(`${mode.name} - stage`, "VERTICAL", 12, 12, 0);
    stage.setExplicitVariableModeForCollection(collection, mode.modeId);
    stage.appendChild(main.createInstance());
    column.appendChild(stage);

    columns.appendChild(column);
  }

  root.appendChild(
    text(
      "Aid only: this row's status comes from the themes check, and the tick is still yours.",
      10,
      FONT_REGULAR,
      MUTED,
    ),
  );
  return root;
}

/**
 * Remove any prior showcase for this target, wherever it is.
 *
 * Scans every page at any depth, matching `renderChecklist`'s own lookup: a
 * designer may have moved the block into a frame or section, or onto another
 * page, and a lookup limited to the current page's direct children would miss it
 * and stack a second copy beside the first.
 *
 * Called even when this run draws nothing, so a re-run that suppresses the
 * showcase - a filtered `checks` run resolving no theme, say - clears last run's
 * block instead of leaving it beside a freshly rebuilt checklist as stale
 * evidence.
 */
export async function removePriorShowcase(targetId: string): Promise<void> {
  await figma.loadAllPagesAsync();
  for (const page of figma.root.children) {
    for (const node of page.findAll(
      (candidate) => candidate.getPluginData(SHOWCASE_DATA_KEY) === targetId,
    )) {
      node.remove();
    }
  }
}

/**
 * Place the block beside `anchor` (the checklist frame), replacing any prior
 * block for the same target.
 *
 * This is the one thing here that deliberately *survives*: canvas evidence is
 * the point, unlike the theme probe's frame, which is transient and swept. It is
 * a mode-pinned frame that outlives the call, so it is labelled and stamped -
 * an unlabelled one is exactly the confusing artifact ADR-0001 worries about.
 */
export function placeModeShowcase(
  showcase: FrameNode,
  anchor: SceneNode,
  targetId: string,
): void {
  showcase.setPluginData(SHOWCASE_DATA_KEY, targetId);
  // Into the anchor's own parent, not the current page: `x`/`y` are
  // parent-relative, so placing it anywhere else puts the offset in a different
  // coordinate space and the block lands nowhere near the checklist.
  const parent = anchor.parent ?? figma.currentPage;
  parent.appendChild(showcase);
  showcase.x = anchor.x + anchor.width + GAP_FROM_ANCHOR;
  showcase.y = anchor.y;
}
