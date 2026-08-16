/// <reference types="@figma/plugin-typings" />

/**
 * Drawing the per-mode showcase (issue #121).
 *
 * The figma-touching half; the decision of *whether* to draw and against which
 * modes is `mode-showcase.ts`, which stays pure and tested.
 */

import { markProbe, unmarkProbe } from "../theme-probe";
import { removeIfPresent, type PriorArtifactIndex } from "./prior-artifacts";
import type { ModeShowcasePlan } from "./mode-showcase";
import {
  isDarkModeName,
  polarityModeId,
  resolveSurfaceVariable,
} from "../../../shared/theme-surface";
import { fallbackStage, surfaceCaption } from "./stage-surface";
import {
  autoLayout,
  card,
  fill,
  FONT_BOLD,
  FONT_REGULAR,
  INK,
  loadRenderFonts,
  MUTED,
  text,
} from "./primitives";

/** Stamp so a rebuild replaces its own prior block instead of stacking copies. */
/** Exported so the one document pass (#179) knows to collect it. */
export const SHOWCASE_DATA_KEY = "tidy:qa-mode-showcase";

const GAP_FROM_ANCHOR = 32;

/**
 * Narrowest the prose may wrap to. The block's width should come from the
 * component it shows, not from the longest sentence explaining it - left to hug,
 * a single unwrapped caption made the card roughly twice as wide as two buttons
 * needed and stranded them in white space.
 */
const MIN_BODY_WIDTH = 240;

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
  /** Ids of every collection the set binds, from the resolved theme table. */
  boundCollectionIds: readonly string[],
): Promise<FrameNode | null> {
  const main = instantiable(subject);
  if (!main) return null;

  const collection =
    await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) return null;

  // Every bound collection, not only the theme one. A brand or vertical
  // collection can carry mode names that read as themes - "Industrial Dark" -
  // while the tokens that actually make a surface dark live in a *separate*
  // light/dark collection. Pinning only the widest collection left this component
  // looking identical in all four of its modes, which is what tidy-doc's Mode
  // Section had already solved.
  const others = (
    await Promise.all(
      boundCollectionIds
        .filter((id) => id !== collectionId)
        .map((id) => figma.variables.getVariableCollectionByIdAsync(id)),
    )
  ).filter((c): c is VariableCollection => c !== null);

  // Searched across the collections themselves, so it can see the page surface -
  // a token no component binds, because no component sits on one.
  const surfaceVariable = await resolveSurfaceVariable([collection, ...others]);
  const surfaceCollection = surfaceVariable
    ? [collection, ...others].find(
        (c) => c.id === surfaceVariable.variableCollectionId,
      )
    : undefined;

  await loadRenderFonts();

  // Every `createFrame` / `createInstance` parents to the current page the moment
  // it is called, so *each* one is a litter risk until it is attached under root -
  // removing root alone leaves any node that had not been appended yet. Tracking
  // them all is what makes the cleanup total, rather than covering only the first
  // one. #131 has been round this loop: the guarantee has to be structural.
  const created: SceneNode[] = [];
  try {
    return buildInto(
      plan,
      subject,
      main,
      { collection, others, surfaceVariable, surfaceCollection },
      (node) => {
        created.push(node);
        return node;
      },
    );
  } catch (error) {
    // Last created first, so a parent never takes its children with it and leaves
    // the loop removing an already-removed node.
    for (const node of created.reverse()) {
      if (!node.removed) node.remove();
    }
    throw error;
  }
}

/** Records every node created, so a failed build can remove all of them. */
type Track = <T extends SceneNode>(node: T) => T;

function buildInto(
  plan: Extract<ModeShowcasePlan, { show: true }>,
  subject: ShowcaseSubject,
  main: ComponentNode,
  theme: {
    collection: VariableCollection;
    others: VariableCollection[];
    surfaceVariable: Variable | null;
    surfaceCollection: VariableCollection | undefined;
  },
  track: Track,
): FrameNode {
  const { collection, others, surfaceVariable, surfaceCollection } = theme;
  const root = track(
    autoLayout(`Themes - ${subject.name}`, "VERTICAL", 24, 24, 16),
  );
  // Claimed immediately, before anything that can fail. `track` covers a *thrown*
  // error; being killed mid-build unwinds nothing at all, and then the marker is
  // the only thing that lets the next run reclaim what is left (#131). Released in
  // `placeModeShowcase` once the block is deliberately kept.
  markProbe(root);
  root.counterAxisSizingMode = "AUTO";
  card(root);

  root.appendChild(track(text(root.name, 16, FONT_BOLD, INK)));

  const caption = track(
    text(
      `${plan.modes.length} modes of "${collection.name}" - ${plan.coverageNote}`,
      11,
      FONT_REGULAR,
      MUTED,
    ),
  );
  root.appendChild(caption);

  const columns = track(autoLayout("modes", "HORIZONTAL", 0, 0, 16));
  columns.counterAxisAlignItems = "MIN";
  root.appendChild(columns);

  for (const mode of plan.modes) {
    // Attached as soon as it exists, so the window in which it is an orphan on the
    // page is as short as it can be; `track` covers the window that remains.
    const column = track(autoLayout(mode.name, "VERTICAL", 0, 0, 8));
    columns.appendChild(column);
    column.appendChild(track(text(mode.name, 12, FONT_BOLD, INK)));

    // The pinned frame is what makes this work: Figma resolves the instance's
    // variables against the mode explicitly set here, so one canvas shows every
    // mode at once - which is the whole ask, since nothing in a file otherwise
    // ever shows two modes together.
    const stage = track(
      autoLayout(`${mode.name} - stage`, "VERTICAL", 16, 16, 0),
    );
    column.appendChild(stage);
    stage.cornerRadius = 6;

    // The theme mode itself.
    stage.setExplicitVariableModeForCollection(collection, mode.modeId);

    // Then the polarity of every *other* bound collection, matched to this mode's
    // name. Without this the component's own colours resolve through a collection
    // still sitting at its default mode, and every column renders light.
    const wantDark = isDarkModeName(mode.name);
    for (const other of others) {
      const otherMode = polarityModeId(other, wantDark);
      if (otherMode) {
        stage.setExplicitVariableModeForCollection(other, otherMode);
      }
    }

    // The backdrop: bound to the DS surface token so Figma resolves it against
    // the modes just pinned, which is what makes it the theme's real surface
    // rather than a guess from the mode's name (#141).
    if (surfaceVariable) {
      if (surfaceCollection && surfaceCollection.id !== collection.id) {
        const surfaceMode = polarityModeId(surfaceCollection, wantDark);
        if (surfaceMode) {
          stage.setExplicitVariableModeForCollection(
            surfaceCollection,
            surfaceMode,
          );
        }
      }
      stage.fills = [
        figma.variables.setBoundVariableForPaint(
          { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
          "color",
          surfaceVariable,
        ),
      ];
    } else {
      // No surface token, so the mode's name is the only signal left - and the
      // honest answer for most modes is to add nothing. A pale box behind a
      // light-mode component is a surface the component does not have, and it
      // reads as part of the component. Only a dark-named mode needs a backdrop,
      // because judging one against the white card misrepresents it just as much.
      const backdrop = fallbackStage(mode.name);
      if (backdrop) fill(stage, backdrop);
    }
    stage.appendChild(track(main.createInstance()));
  }

  // One note rather than two: at 10px, a pair of grey disclaimers under two
  // buttons is more chrome than substance. Both facts still get said - what the
  // block is for, and what it cannot show.
  const note = track(
    text(
      `Aid only: this row's status comes from the themes check, and the tick is still yours. ${surfaceCaption(surfaceVariable?.name)}`,
      10,
      FONT_REGULAR,
      MUTED,
    ),
  );
  root.appendChild(note);

  // Sized after everything is in place, because the width to wrap to is the width
  // the modes ended up needing. The root keeps hugging, so the card ends up as
  // wide as its content rather than as wide as its prose.
  const bodyWidth = Math.max(MIN_BODY_WIDTH, columns.width);
  for (const node of [caption, note]) {
    node.textAutoResize = "HEIGHT";
    node.resize(bodyWidth, node.height);
  }

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
export function removePriorShowcase(
  index: PriorArtifactIndex<FrameNode>,
): void {
  for (const frame of index.matching(SHOWCASE_DATA_KEY)) {
    removeIfPresent(frame);
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

  // Last, once the block is where it belongs: until this point it is still a
  // transient node the next run may reclaim, and after it the sweep will leave it
  // alone. Anything that throws above therefore leaves something recoverable
  // rather than a permanent orphan.
  unmarkProbe(showcase);
}
