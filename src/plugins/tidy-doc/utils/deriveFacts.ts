/// <reference types="@figma/plugin-typings" />

// Figma-touching adapter: reads a component (set)'s live variant properties
// and feeds them into the pure categoriser. Not unit tested — the repo's
// convention is to test the pure core only (categorizeAxes.test.ts) and
// treat the Figma-API adapter as validated by manual/plugin verification.

import { categorizeAxes, type AxisDescriptor } from "./categorizeAxes";
import {
  deriveWidthFact,
  detectIconPlacement,
  findMatchingVariantIndex,
  type PropertyDescriptor,
  type SizeMeasurement,
} from "./anatomy";
import { findRelatedCandidates } from "./findRelatedCandidates";
import type { DerivedFacts } from "./facts";

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
    variantProperties: child.type === "COMPONENT" ? child.variantProperties : null,
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
  const relatedCandidates = await findRelatedCandidates(node);

  const widthSource = node.type === "COMPONENT_SET" ? node.defaultVariant ?? node : node;
  const width = deriveWidthFact(widthSource.minWidth ?? null, widthSource.maxWidth ?? null);
  const iconPlacement = detectIconPlacement(propertyDescriptors);
  const heights =
    node.type === "COMPONENT_SET" ? deriveHeights(node, categorization, defaults) : [];

  return {
    componentId: node.id,
    componentName: node.name,
    ...categorization,
    breakdown: { heights, width, iconPlacement },
    relatedCandidates,
  };
}
