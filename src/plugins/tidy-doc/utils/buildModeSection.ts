/// <reference types="@figma/plugin-typings" />

// Mode Section (#55): automatic, crossed, capped theming showcases. The
// source component's bound-variable collections are derived in deriveFacts;
// this builder re-resolves the live VariableCollection objects so it can pin
// each showcase container with setExplicitVariableModeForCollection(collection,
// modeId) using the dynamic-page-safe overload.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText, FONT_BOLD, TOKENS } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";
import { buildModeCrossProduct, modeShowcaseLabel } from "./modes";

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
    buildModeCrossProduct(facts.modeCollections, MAX_MODE_SHOWCASES).showcases
      .length > 0
  );
}

export async function buildModeSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const { showcases, dropped } = buildModeCrossProduct(
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

  for (const showcase of showcases) {
    const block = buildAutoLayoutFrame("mode-showcase", "VERTICAL", 0, 0, 8);
    block.appendChild(
      await createText(modeShowcaseLabel(showcase), 13, FONT_BOLD),
    );

    const container = buildAutoLayoutFrame(
      `mode-showcase — ${modeShowcaseLabel(showcase)}`,
      "VERTICAL",
      16,
      16,
      8,
    );
    container.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
    container.cornerRadius = 8;

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
    }

    container.appendChild(
      createSpecimenInstance(source, {
        facts,
        familyValue: defaultFamilyValue(source, facts),
      }),
    );
    block.appendChild(container);
    section.appendChild(block);
  }

  return section;
}
