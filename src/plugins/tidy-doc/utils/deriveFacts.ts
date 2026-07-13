/// <reference types="@figma/plugin-typings" />

// Figma-touching adapter: reads a component (set)'s live variant properties
// and feeds them into the pure categoriser. Not unit tested — the repo's
// convention is to test the pure core only (categorizeAxes.test.ts) and
// treat the Figma-API adapter as validated by manual/plugin verification.

import { categorizeAxes, type AxisDescriptor } from "./categorizeAxes";
import {
  deriveWidthFact,
  dedupeConstraintFacts,
  detectIconPlacement,
  findMatchingVariantIndex,
  type ConstraintCandidate,
  type ConstraintWidthFact,
  type PropertyDescriptor,
  type SizeMeasurement,
} from "./anatomy";
import { findRelatedCandidates } from "./findRelatedCandidates";
import { deriveMatrixModel } from "./matrixModel";
import type { DerivedFacts } from "./facts";
import type { ModeCollectionFact } from "./modes";

function collectVariableAliasIds(value: unknown, ids: Set<string>): void {
  if (value === null || typeof value !== "object") return;

  const maybeAlias = value as { type?: unknown; id?: unknown };
  if (
    maybeAlias.type === "VARIABLE_ALIAS" &&
    typeof maybeAlias.id === "string"
  ) {
    ids.add(maybeAlias.id);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectVariableAliasIds(item, ids);
    return;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    collectVariableAliasIds(child, ids);
  }
}

function collectNodeBoundVariableIds(node: SceneNode, ids: Set<string>): void {
  const candidate = node as unknown as {
    boundVariables?: unknown;
    fills?: unknown;
    strokes?: unknown;
    effects?: unknown;
    layoutGrids?: unknown;
    children?: readonly SceneNode[];
  };

  collectVariableAliasIds(candidate.boundVariables, ids);
  collectVariableAliasIds(candidate.fills, ids);
  collectVariableAliasIds(candidate.strokes, ids);
  collectVariableAliasIds(candidate.effects, ids);
  collectVariableAliasIds(candidate.layoutGrids, ids);

  for (const child of candidate.children ?? []) {
    collectNodeBoundVariableIds(child, ids);
  }
}

async function deriveModeCollections(
  node: ComponentNode | ComponentSetNode,
): Promise<ModeCollectionFact[]> {
  const aliasIds = new Set<string>();
  collectNodeBoundVariableIds(node, aliasIds);
  if (aliasIds.size === 0) return [];

  const localCollections =
    await figma.variables.getLocalVariableCollectionsAsync();
  const localById = new Map(
    localCollections.map((collection) => [collection.id, collection]),
  );

  // Fetch all bound variables in one parallel batch (was N sequential awaits).
  const variableIds = [...aliasIds];
  const variables = await Promise.all(
    variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
  );
  const collectionIds = new Set<string>();
  for (const variable of variables) {
    if (variable) collectionIds.add(variable.variableCollectionId);
  }

  // Fetch any non-local collections in parallel (was N sequential awaits).
  const remoteIds = [...collectionIds].filter((id) => !localById.has(id));
  const remoteCollections = await Promise.all(
    remoteIds.map((id) => figma.variables.getVariableCollectionByIdAsync(id)),
  );
  const allById = new Map(localCollections.map((c) => [c.id, c]));
  for (const c of remoteCollections) {
    if (c) allById.set(c.id, c);
  }

  const collections: ModeCollectionFact[] = [];
  for (const collectionId of collectionIds) {
    const collection = allById.get(collectionId);
    if (!collection || collection.modes.length <= 1) continue;
    collections.push({
      id: collection.id,
      name: collection.name,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((mode) => ({
        modeId: mode.modeId,
        name: mode.name,
      })),
    });
  }

  return collections;
}

function deriveHeights(
  node: ComponentSetNode,
  categorization: ReturnType<typeof categorizeAxes>,
  defaults: Record<string, string>,
): SizeMeasurement[] {
  if (!categorization.sizeAxis) return [];
  const sizeAxisName = categorization.sizeAxis.name!;

  const pinMap: Record<string, string> = { ...categorization.pinnedDefaults };
  if (categorization.familyAxis.name) {
    const familyDefault = defaults[categorization.familyAxis.name];
    if (familyDefault) pinMap[categorization.familyAxis.name] = familyDefault;
  }

  const childDescriptors = node.children.map((child) => ({
    variantProperties:
      child.type === "COMPONENT" ? child.variantProperties : null,
  }));

  const heights: SizeMeasurement[] = [];
  for (const value of categorization.sizeAxis.values) {
    const target = { ...pinMap, [sizeAxisName]: value };
    const index = findMatchingVariantIndex(childDescriptors, target);
    if (index === null) {
      console.warn(
        `tidy-doc: no variant of "${node.name}" matched size "${value}" under its pinned rest-state defaults; dropping from the Height sub-section`,
      );
      continue;
    }
    const child = node.children[index] as ComponentNode;
    heights.push({
      value,
      height: child.height,
      verticalSizing: child.layoutSizingVertical,
    });
  }
  return heights;
}

// Constraints redline facts (#66): the vertical layout's width redlines.
// Reuses deriveMatrixModel — the same source of truth the matrix renderer
// uses — so the two agree on which size/column combinations exist. Unlike the
// matrix, Constraints varies the FAMILY axis too (not just size × columns) and
// then collapses variants that share the same measured geometry, so a redline
// appears once per distinct width — not once per variant (dedupeConstraintFacts).
function deriveConstraintWidths(
  node: ComponentSetNode,
  categorization: ReturnType<typeof categorizeAxes>,
): ConstraintWidthFact[] {
  const model = deriveMatrixModel({
    sizeAxis: categorization.sizeAxis,
    familyAxis: categorization.familyAxis,
    demotedAxisValues: categorization.demotedAxisValues,
    componentName: node.name,
  });

  // Pinned rest-state defaults (e.g. the state axis) hold steady; the family
  // and size axes are enumerated below so each variant gets measured.
  const pinMap: Record<string, string> = { ...categorization.pinnedDefaults };
  const familyName = categorization.familyAxis.name;
  const familyValues: Array<string | null> = familyName
    ? categorization.familyAxis.values
    : [null];

  const childDescriptors = node.children.map((child) => ({
    variantProperties:
      child.type === "COMPONENT" ? child.variantProperties : null,
  }));

  const candidates: ConstraintCandidate[] = [];
  for (const group of model.sizeGroups) {
    for (const familyValue of familyValues) {
      for (const column of model.columns) {
        const target = { ...pinMap, ...column.props };
        if (familyName && familyValue) target[familyName] = familyValue;
        if (categorization.sizeAxis?.name && group.sizeValue) {
          target[categorization.sizeAxis.name] = group.sizeValue;
        }

        const index = findMatchingVariantIndex(childDescriptors, target);
        if (index === null) {
          console.warn(
            `tidy-doc: no variant of "${node.name}" matched size "${group.label ?? "n/a"}" / family "${familyValue ?? "n/a"}" / column "${column.label || "n/a"}" under its pinned rest-state defaults; dropping from the Constraints section`,
          );
          continue;
        }
        const child = node.children[index] as ComponentNode;
        candidates.push({
          sizeLabel: group.label,
          familyValue,
          columnProps: column.props,
          width: child.width,
          horizontalSizing: child.layoutSizingHorizontal,
          minWidth: child.minWidth ?? null,
          maxWidth: child.maxWidth ?? null,
        });
      }
    }
  }
  return dedupeConstraintFacts(candidates);
}

export async function deriveFacts(
  node: ComponentNode | ComponentSetNode,
): Promise<DerivedFacts> {
  const descriptors: AxisDescriptor[] = [];
  const propertyDescriptors: PropertyDescriptor[] = [];
  let defaults: Record<string, string> = {};

  if (node.type === "COMPONENT_SET") {
    defaults = node.defaultVariant?.variantProperties ?? {};
    for (const [name, def] of Object.entries(
      node.componentPropertyDefinitions,
    )) {
      if (def.type === "VARIANT") {
        descriptors.push({
          name,
          values: def.variantOptions ?? [],
          defaultValue: defaults[name],
        });
        propertyDescriptors.push({
          name,
          type: "VARIANT",
          values: def.variantOptions ?? [],
        });
      } else {
        propertyDescriptors.push({ name, type: def.type });
      }
    }
  } else {
    for (const [name, def] of Object.entries(
      node.componentPropertyDefinitions,
    )) {
      propertyDescriptors.push({ name, type: def.type });
    }
  }

  const categorization = categorizeAxes(descriptors);
  const modeCollections = await deriveModeCollections(node);
  const relatedCandidates = await findRelatedCandidates(node);

  const widthSource =
    node.type === "COMPONENT_SET" ? (node.defaultVariant ?? node) : node;
  const width = deriveWidthFact(
    widthSource.minWidth ?? null,
    widthSource.maxWidth ?? null,
  );
  const iconPlacement = detectIconPlacement(propertyDescriptors);
  const heights =
    node.type === "COMPONENT_SET"
      ? deriveHeights(node, categorization, defaults)
      : [];
  const constraintWidths =
    node.type === "COMPONENT_SET"
      ? deriveConstraintWidths(node, categorization)
      : [];

  return {
    componentId: node.id,
    componentName: node.name,
    ...categorization,
    breakdown: { heights, width, iconPlacement, constraintWidths },
    modeCollections,
    relatedCandidates,
  };
}
