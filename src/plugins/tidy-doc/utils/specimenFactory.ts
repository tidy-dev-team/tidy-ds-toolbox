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

// Exact property-name match, unlike setVariantProps's substring matching —
// used wherever a caller pins a specific axis and a substring collision
// (e.g. "State" matching "Loading State") would pin the wrong property.
function setVariantPropExact(
  instance: InstanceNode,
  axisName: string,
  value: string,
): void {
  for (const property in instance.componentProperties) {
    if (
      instance.componentProperties[property].type === "VARIANT" &&
      property === axisName
    ) {
      instance.setProperties({ [property]: value });
      break;
    }
  }
}

export function createSpecimenInstance(
  source: ComponentNode | ComponentSetNode,
  familyValue: string,
  facts: DerivedFacts,
  stateValue?: string,
  overrides?: Record<string, string>,
  booleanOverrides?: Record<string, boolean>,
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

  if (facts.stateAxis?.name && stateValue) {
    setVariantPropExact(instance, facts.stateAxis.name, stateValue);
  }

  // Per-cell overrides must match exactly too — deriveConstraintWidths
  // measures the variant it found via exact-match lookup, so the specimen
  // rendered here has to pin the same axis, not whatever substring-collides
  // with it (e.g. "Size" vs "Icon Size").
  if (overrides) {
    for (const [axisName, value] of Object.entries(overrides)) {
      setVariantPropExact(instance, axisName, value);
    }
  }

  // BOOLEAN component properties are not variant axes — set them by their full
  // property key (with the #id suffix) via setProperties, guarding against a
  // key the instance doesn't expose.
  if (booleanOverrides) {
    for (const [key, value] of Object.entries(booleanOverrides)) {
      if (key in instance.componentProperties) {
        instance.setProperties({ [key]: value });
      }
    }
  }

  return instance;
}
