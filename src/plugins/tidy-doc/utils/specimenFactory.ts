/// <reference types="@figma/plugin-typings" />

// Shared specimen-instance factory (CONTEXT.md "Specimen"): the one seam
// every tidy-doc builder goes through to make a live instance of a
// component (set) with the right variant props pinned (#71 — this used to
// be reimplemented, incompletely, in four separate builders). `facts` is
// optional because one caller (buildRelatedSection) instantiates a sibling
// component that was never `deriveFacts`'d — in that case, family/state/
// rest-state-default pinning is skipped entirely and the caller pins
// everything itself via `overrides`.

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

export interface SpecimenInstanceOptions {
  /** Derived facts for `source` — pins the family axis, rest-state defaults,
   * and (with `stateValue`) the state axis. Omit when instantiating a
   * component that wasn't `deriveFacts`'d (e.g. a related sibling); pin
   * everything needed via `overrides` instead. */
  facts?: DerivedFacts;
  /** Family-axis value to pin (requires `facts.familyAxis.name`). */
  familyValue?: string;
  /** State-axis value to pin via exact match (requires `facts.stateAxis.name`). */
  stateValue?: string;
  /** Per-axis overrides applied via exact match, after family/rest-state/state
   * pinning — the same exact-match subtlety `stateValue` needs applies here
   * (e.g. "Size" vs "Icon Size"). */
  overrides?: Record<string, string>;
  /** BOOLEAN component-property overrides, applied by full property key
   * (with the #id suffix), guarding against a key the instance doesn't expose. */
  booleanOverrides?: Record<string, boolean>;
}

export function createSpecimenInstance(
  source: ComponentNode | ComponentSetNode,
  options: SpecimenInstanceOptions = {},
): InstanceNode {
  const { facts, familyValue, stateValue, overrides, booleanOverrides } =
    options;
  const base = source.type === "COMPONENT_SET" ? source.defaultVariant : source;
  const instance = base.createInstance();

  if (facts) {
    if (
      source.type === "COMPONENT_SET" &&
      facts.familyAxis.name &&
      familyValue !== undefined
    ) {
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
