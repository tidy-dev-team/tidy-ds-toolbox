/// <reference types="@figma/plugin-typings" />

// Complete Variants Section (CONTEXT.md "Variant Family"): one block per
// keyed family value, each with an authored description, an authored
// "when to use" bullet list, and a Specimen Scene spanning the full state
// axis (one specimen cell per state value, in the component's own option
// order). Every non-spanned axis (size, a demoted type-like axis, any
// incidental axis) is pinned to its derived rest-state default in every
// cell — the scene never expands into a state×axis grid.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText, FONT_BOLD, TOKENS } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";

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
    return createSpecimenInstance(source, { familyValue, facts });
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

    const instance = createSpecimenInstance(source, {
      familyValue,
      facts,
      stateValue,
    });
    const label = await createText(stateValue, 10, undefined, TOKENS.muted);

    cell.appendChild(instance);
    cell.appendChild(label);
    row.appendChild(cell);
  }

  return row;
}

// Pure skip predicate (#72) — whether the Variants Section has anything to
// render. Operates on plain data so it's unit-testable without building a
// Figma node.
export function appliesVariantsSection(spec: DocSpec): boolean {
  const variants = spec.variants;
  return !!variants && Object.keys(variants).length > 0;
}

export async function buildVariantsSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const variants = spec.variants ?? {};

  const section = buildAutoLayoutFrame(
    "variants-section",
    "VERTICAL",
    0,
    0,
    24,
  );

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
    const title = await createText(displayTitle, 14, FONT_BOLD);
    const description = await createText(
      content.description,
      12,
      undefined,
      TOKENS.mutedDark,
    );

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
        const bullet = await createText(
          `• ${item}`,
          12,
          undefined,
          TOKENS.muted,
        );
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
