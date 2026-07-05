/// <reference types="@figma/plugin-typings" />

// Complete Variants Section (CONTEXT.md "Variant Family"): one block per
// keyed family value, each with an authored description, an authored
// "when to use" bullet list, and a Specimen Scene spanning the full state
// axis (one specimen cell per state value, in the component's own option
// order). Every non-spanned axis (size, a demoted type-like axis, any
// incidental axis) is pinned to its derived rest-state default in every
// cell — the scene never expands into a state×axis grid.

import {
  buildAutoLayoutFrame,
  setVariantProps,
} from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText } from "./buildChrome";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";

function createSpecimenInstance(
  source: ComponentNode | ComponentSetNode,
  familyValue: string,
  facts: DerivedFacts,
  stateValue?: string,
): InstanceNode {
  const base =
    source.type === "COMPONENT_SET" ? source.defaultVariant : source;
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
    if (facts.stateAxis?.name && stateValue && axisName === facts.stateAxis.name) {
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

  return instance;
}

/**
 * A family's Specimen Scene: one cell per state-axis value when the
 * component exposes a state axis, else a single pinned-default specimen.
 */
async function createSpecimenScene(
  source: ComponentNode | ComponentSetNode,
  familyValue: string,
  facts: DerivedFacts,
): Promise<FrameNode | InstanceNode> {
  if (!facts.stateAxis) {
    return createSpecimenInstance(source, familyValue, facts);
  }

  const row = buildAutoLayoutFrame(
    `variant — ${familyValue} — states`,
    "HORIZONTAL",
    0,
    0,
    24,
  );

  for (const stateValue of facts.stateAxis.values) {
    const cell = buildAutoLayoutFrame(
      `variant — ${familyValue} — state — ${stateValue}`,
      "VERTICAL",
      0,
      0,
      8,
    );
    cell.counterAxisAlignItems = "CENTER";

    const instance = createSpecimenInstance(source, familyValue, facts, stateValue);
    const label = await createText(stateValue, 10, undefined, "#6B7280");

    cell.appendChild(instance);
    cell.appendChild(label);
    row.appendChild(cell);
  }

  return row;
}

export async function buildVariantsSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode | null> {
  const variants = spec.variants;
  if (!variants || Object.keys(variants).length === 0) return null;

  const section = buildAutoLayoutFrame("variants-section", "VERTICAL", 0, 0, 24);

  for (const [familyValue, content] of Object.entries(variants)) {
    const block = buildAutoLayoutFrame(
      `variant — ${familyValue}`,
      "VERTICAL",
      0,
      0,
      8,
    );

    // The reserved key "default" (single-unnamed-family fallback, per
    // CONTEXT.md) is a DocSpec/reference-resolution implementation detail —
    // shown to the author as the source component's own name instead of the
    // literal word "default".
    const displayTitle =
      facts.familyAxis.name === null ? source.name : familyValue;
    const title = await createText(displayTitle, 14, { family: "Inter", style: "Bold" });
    const description = await createText(content.description, 12, undefined, "#4B5563");

    block.appendChild(title);
    block.appendChild(description);

    if (content.whenToUse?.length) {
      const list = buildAutoLayoutFrame(
        `variant — ${familyValue} — when to use`,
        "VERTICAL",
        0,
        0,
        4,
      );
      for (const item of content.whenToUse) {
        const bullet = await createText(`• ${item}`, 12, undefined, "#6B7280");
        list.appendChild(bullet);
      }
      block.appendChild(list);
    }

    const specimen = await createSpecimenScene(source, familyValue, facts);
    block.appendChild(specimen);

    section.appendChild(block);
  }

  return section;
}
