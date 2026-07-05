/// <reference types="@figma/plugin-typings" />

// Minimal Variants Section (CONTEXT.md "Variant Family"): one block per
// keyed family value, each with an authored description and a single live
// specimen instance pinned to that family value plus every other axis's
// pinned rest-state default. State-spanning rows are deferred to the
// Variants-complete slice (see issue #52 body).

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
): InstanceNode {
  const base =
    source.type === "COMPONENT_SET" ? source.defaultVariant : source;
  const instance = base.createInstance();

  if (source.type === "COMPONENT_SET" && facts.familyAxis.name) {
    setVariantProps(instance, facts.familyAxis.name, familyValue);
  }
  for (const [axisName, value] of Object.entries(facts.pinnedDefaults)) {
    setVariantProps(instance, axisName, value);
  }

  return instance;
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

    const specimen = createSpecimenInstance(source, familyValue, facts);
    block.appendChild(specimen);

    section.appendChild(block);
  }

  return section;
}
