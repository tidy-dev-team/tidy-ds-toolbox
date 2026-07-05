/// <reference types="@figma/plugin-typings" />

// Figma-touching adapter: reads a component (set)'s live variant properties
// and feeds them into the pure categoriser. Not unit tested — the repo's
// convention is to test the pure core only (categorizeAxes.test.ts) and
// treat the Figma-API adapter as validated by manual/plugin verification.

import { categorizeAxes, type AxisDescriptor } from "./categorizeAxes";
import type { DerivedFacts } from "./facts";

export function deriveFacts(
  node: ComponentNode | ComponentSetNode,
): DerivedFacts {
  const descriptors: AxisDescriptor[] = [];

  if (node.type === "COMPONENT_SET") {
    const defaults = node.defaultVariant?.variantProperties ?? {};
    for (const [name, def] of Object.entries(
      node.componentPropertyDefinitions,
    )) {
      if (def.type !== "VARIANT") continue;
      descriptors.push({
        name,
        values: def.variantOptions ?? [],
        defaultValue: defaults[name],
      });
    }
  }

  const categorization = categorizeAxes(descriptors);

  return {
    componentId: node.id,
    componentName: node.name,
    ...categorization,
  };
}
