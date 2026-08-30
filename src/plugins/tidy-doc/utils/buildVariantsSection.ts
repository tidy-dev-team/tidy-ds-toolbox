/// <reference types="@figma/plugin-typings" />

// Complete Variants Section (CONTEXT.md "Variant Family"): one block per
// keyed family value, each with an authored description, an authored
// "when to use" bullet list, and a Specimen Scene spanning the full state
// axis (one specimen cell per state value, in the component's own option
// order). Every non-spanned axis (size, a demoted type-like axis, any
// incidental axis) is pinned to its derived rest-state default in every
// cell — the scene never expands into a state×axis grid.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import {
  buildBulletList,
  buildTitleBlock,
  createText,
  DOC_SCALE,
  DOC_SPACING,
  TOKENS,
} from "./buildChrome";
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
    DOC_SPACING.block,
  );

  for (const stateValue of facts.stateAxis.values) {
    const cell = buildAutoLayoutFrame(
      `variant — ${familyValue} — state — ${stateValue}`,
      "VERTICAL",
      0,
      0,
      DOC_SPACING.title,
    );
    cell.counterAxisAlignItems = "CENTER";

    const instance = createSpecimenInstance(source, {
      familyValue,
      facts,
      stateValue,
    });
    const label = await createText(
      stateValue,
      DOC_SCALE.caption,
      undefined,
      TOKENS.muted,
    );

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
    DOC_SPACING.section,
  );

  for (const [familyValue, content] of Object.entries(variants)) {
    const block = buildAutoLayoutFrame(
      `variant — ${familyValue}`,
      "VERTICAL",
      0,
      0,
      DOC_SPACING.block,
    );

    // The reserved key "default" (single-unnamed-family fallback, per
    // CONTEXT.md) is a DocSpec/reference-resolution implementation detail —
    // shown to the author as the source component's own name instead of the
    // literal word "default".
    const displayTitle =
      facts.familyAxis.name === null ? source.name : familyValue;

    // Name, description and the "when to use" bullets are one introduction
    // and sit together in the block's `title` group; the specimens below
    // stand a `block` gap away from the whole of it.
    const title = await buildTitleBlock("title", displayTitle, [
      content.description,
    ]);
    if (content.whenToUse?.length) {
      title.appendChild(
        await buildBulletList(
          `variant — ${familyValue} — when to use`,
          content.whenToUse,
        ),
      );
    }
    block.appendChild(title);

    const specimen = await createSpecimenScene(source, familyValue, facts);
    block.appendChild(specimen);

    section.appendChild(block);
  }

  return section;
}
