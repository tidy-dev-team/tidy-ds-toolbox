/// <reference types="@figma/plugin-typings" />

// Mode Section (#55): automatic, capped theming showcases. Drives a single
// primary theme collection (the widest bound collection — see
// selectPrimaryCollection), one showcase per mode, leaving every other bound
// collection at its default mode. The source component's bound-variable
// collections are derived in deriveFacts; this builder re-resolves the live
// VariableCollection objects so it can pin each showcase container with
// setExplicitVariableModeForCollection(collection, modeId) using the
// dynamic-page-safe overload.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText, FONT_BOLD, TOKENS } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";
import { buildModeShowcases, modeShowcaseLabel } from "./modes";

const MAX_MODE_SHOWCASES = 8;

function defaultFamilyValue(
  source: ComponentNode | ComponentSetNode,
  facts: DerivedFacts,
): string | undefined {
  if (!facts.familyAxis.name) return undefined;
  return source.type === "COMPONENT_SET"
    ? (source.defaultVariant?.variantProperties?.[facts.familyAxis.name] ??
        facts.familyAxis.values[0])
    : facts.familyAxis.values[0];
}

// Preferred DS surface tokens for the theme card, in priority order. When one
// resolves to a COLOR variable in the component's bound collections, the card's
// fill is bound to it and — because the card also pins the theme mode — renders
// the theme's own surface color (e.g. Kido's bg/surface → #172127 under
// Industrial Dark), exactly as the hand-authored reference does.
const SURFACE_VARIABLE_NAMES = [
  "bg/surface",
  "background/surface",
  "surface",
  "bg/default",
  "background",
];

// Fallback when no DS surface token is available: a theme-appropriate neutral
// approximated from the mode name — any "…Dark" mode gets the dark surface.
function themedSurfaceFill(modeName: string): SolidPaint {
  const isDark = /dark/i.test(modeName);
  const color = isDark
    ? { r: 0.06, g: 0.07, b: 0.09 }
    : { r: 0.94, g: 0.95, b: 0.97 };
  return { type: "SOLID", color };
}

// The DS surface variable to bind the theme card to, searched across the
// component's bound collections (which is where the theme collection lives).
// Returns null when the DS exposes no recognizable surface token, so the caller
// falls back to a hardcoded neutral.
async function resolveSurfaceVariable(
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

// The light/dark mode id of a collection matching a theme's polarity. The
// surface token (e.g. bg/surface) lives in a separate light/dark collection
// from the brand theme collection, so a "…Dark" brand theme still needs that
// collection pinned to its dark mode for the card surface to actually go dark.
function polarityModeId(
  collection: VariableCollection,
  wantDark: boolean,
): string | null {
  const needle = wantDark ? "dark" : "light";
  const mode = collection.modes.find((m) =>
    m.name.toLowerCase().includes(needle),
  );
  return mode?.modeId ?? null;
}

// The component's representative specimens for a theme card: one per state-axis
// value (default, empty, …) laid out in a row — or a single default specimen
// when the component has no state axis. Mirrors the Variants Section's scene so
// the theming of every state is visible, but without per-cell labels (the card
// heading already names the theme).
function buildModeSpecimens(
  source: ComponentNode | ComponentSetNode,
  facts: DerivedFacts,
): InstanceNode[] {
  const familyValue = defaultFamilyValue(source, facts);
  if (!facts.stateAxis) {
    return [createSpecimenInstance(source, { facts, familyValue })];
  }
  return facts.stateAxis.values.map((stateValue) =>
    createSpecimenInstance(source, { facts, familyValue, stateValue }),
  );
}

async function resolveCollections(
  collectionIds: string[],
): Promise<Map<string, VariableCollection>> {
  const result = new Map<string, VariableCollection>();
  const fetched = await Promise.all(
    collectionIds.map((id) =>
      figma.variables.getVariableCollectionByIdAsync(id),
    ),
  );
  for (const collection of fetched) {
    if (collection) result.set(collection.id, collection);
  }
  return result;
}

// Pure skip predicate (#72) — whether the Mode Section has anything to
// render: an authored `mode` key, at least one bound-variable collection,
// and at least one showcase surviving the cross-product cap.
export function appliesModeSection(
  facts: DerivedFacts,
  spec: DocSpec,
): boolean {
  if (!spec.mode) return false;
  if (facts.modeCollections.length === 0) return false;
  return (
    buildModeShowcases(facts.modeCollections, MAX_MODE_SHOWCASES).showcases
      .length > 0
  );
}

export async function buildModeSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const { showcases, dropped } = buildModeShowcases(
    facts.modeCollections,
    MAX_MODE_SHOWCASES,
  );
  if (dropped > 0) {
    console.warn(
      `tidy-doc: Mode Section capped at ${MAX_MODE_SHOWCASES} showcases; dropped ${dropped} additional mode combination(s)`,
    );
  }

  const section = buildAutoLayoutFrame("mode-section", "VERTICAL", 0, 0, 16);

  if (spec.mode?.caption) {
    section.appendChild(
      await createText(spec.mode.caption, 12, undefined, TOKENS.mutedDark),
    );
  }

  const collectionIds = facts.modeCollections.map(
    (collection) => collection.id,
  );
  const collectionsById = await resolveCollections(collectionIds);

  // Bind the card surface to the DS surface token when one exists, so it renders
  // the theme's real surface color. Its (separate) light/dark collection is then
  // pinned per showcase to match the theme's polarity — see polarityModeId.
  const surfaceVariable = await resolveSurfaceVariable([
    ...collectionsById.values(),
  ]);
  const surfaceCollection = surfaceVariable
    ? collectionsById.get(surfaceVariable.variableCollectionId)
    : undefined;

  for (const showcase of showcases) {
    // One selection per showcase now (single primary collection); the mode
    // name alone is the card heading — the collection prefix would just repeat.
    const heading =
      showcase.selections[0]?.modeName ?? modeShowcaseLabel(showcase);

    const block = buildAutoLayoutFrame("mode-showcase", "VERTICAL", 0, 0, 8);
    block.appendChild(await createText(heading, 14, FONT_BOLD));

    const container = buildAutoLayoutFrame(
      `mode-showcase — ${modeShowcaseLabel(showcase)}`,
      "HORIZONTAL",
      16,
      16,
      16,
    );
    container.counterAxisAlignItems = "MIN";
    container.cornerRadius = 12;

    // Pin the brand theme mode (the primary collection's selection).
    const pinnedCollectionIds = new Set<string>();
    for (const selection of showcase.selections) {
      const collection = collectionsById.get(selection.collectionId);
      if (!collection) {
        console.warn(
          `tidy-doc: mode collection ${selection.collectionId} no longer resolved; skipping explicit mode pin for ${selection.modeId}`,
        );
        continue;
      }
      container.setExplicitVariableModeForCollection(
        collection,
        selection.modeId,
      );
      pinnedCollectionIds.add(collection.id);
    }

    // Pin the surface token's own light/dark collection to match the theme
    // polarity (unless it's the same collection already pinned above), then bind
    // the fill to the token. Falls back to a hardcoded neutral when no token.
    if (surfaceVariable && surfaceCollection) {
      if (!pinnedCollectionIds.has(surfaceCollection.id)) {
        const modeId = polarityModeId(surfaceCollection, /dark/i.test(heading));
        if (modeId) {
          container.setExplicitVariableModeForCollection(
            surfaceCollection,
            modeId,
          );
        }
      }
      const base: SolidPaint = { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
      container.fills = [
        figma.variables.setBoundVariableForPaint(
          base,
          "color",
          surfaceVariable,
        ),
      ];
    } else {
      container.fills = [themedSurfaceFill(heading)];
    }

    for (const specimen of buildModeSpecimens(source, facts)) {
      container.appendChild(specimen);
    }
    block.appendChild(container);
    section.appendChild(block);
  }

  return section;
}
