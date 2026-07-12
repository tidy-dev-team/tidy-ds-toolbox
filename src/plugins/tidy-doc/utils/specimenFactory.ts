/// <reference types="@figma/plugin-typings" />

// Shared specimen-instance factory (CONTEXT.md "Specimen"): a live instance
// of the source component with family + (optionally) state pinned per the
// derived rest-state defaults. Extracted out of the Variants Section
// (#63 prefactor) so other layout builders (a future matrix/constraints
// cell) can reuse it via the optional per-cell `overrides` map, applied
// after the existing family/state/pinned-default logic — so a caller can
// pin its own column's axis values without touching that logic. Passing no
// overrides reproduces the original Variants-only behavior exactly.

import { setVariantProps } from "../../sticker-sheet-builder/utils/utilityFunctions";
import type { DerivedFacts } from "./facts";

export function createSpecimenInstance(
  source: ComponentNode | ComponentSetNode,
  familyValue: string,
  facts: DerivedFacts,
  stateValue?: string,
  overrides?: Record<string, string>,
): InstanceNode {
  const base = source.type === "COMPONENT_SET" ? source.defaultVariant : source;
  const instance = base.createInstance();

  if (source.type === "COMPONENT_SET" && facts.familyAxis.name) {
    setVariantProps(instance, facts.familyAxis.name, familyValue);
  }

  // Pin non-spanned axes to rest-state defaults — but exclude the state
  // axis when a per-cell stateValue is provided, so the state override
  // below sets the correct cell state rather than being reverted to the
  // rest-state default.
  const pinning: Record<string, string> = {};
  for (const [axisName, value] of Object.entries(facts.pinnedDefaults)) {
    if (
      facts.stateAxis?.name &&
      stateValue &&
      axisName === facts.stateAxis.name
    ) {
      continue;
    }
    pinning[axisName] = value;
  }
  for (const [axisName, value] of Object.entries(pinning)) {
    setVariantProps(instance, axisName, value);
  }

  // State override: match the exact property name rather than relying on
  // setVariantProps's substring matching, which can collide with other
  // axes (e.g. a "Loading State" axis would match a substring search for
  // "State").
  if (facts.stateAxis?.name && stateValue) {
    for (const property in instance.componentProperties) {
      if (
        instance.componentProperties[property].type === "VARIANT" &&
        property === facts.stateAxis.name
      ) {
        instance.setProperties({ [property]: stateValue });
        break;
      }
    }
  }

  if (overrides) {
    for (const [axisName, value] of Object.entries(overrides)) {
      setVariantProps(instance, axisName, value);
    }
  }

  return instance;
}
