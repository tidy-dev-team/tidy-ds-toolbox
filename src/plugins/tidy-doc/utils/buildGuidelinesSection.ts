/// <reference types="@figma/plugin-typings" />

// Usage Guidelines Section (CONTEXT.md "Section", "Specimen Scene"):
// authored whenToUse/whenNotToUse/general bullet lists plus Do/Don't
// specimen pairs. Each pair renders a good and a bad SpecimenScene — 1–4
// live source-component instances in a row/stack, each with a verdict icon
// (code-generated glyph, no library linkage, per ADR-0006).

import {
  buildAutoLayoutFrame,
  setVariantProps,
} from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText } from "./buildChrome";
import type { DocSpec, DoDontPair, SpecimenScene } from "./docSpec";
import type { DerivedFacts } from "./facts";

async function buildBulletList(
  name: string,
  title: string,
  items: string[],
): Promise<FrameNode> {
  const list = buildAutoLayoutFrame(name, "VERTICAL", 0, 0, 6);
  const heading = await createText(title, 13, {
    family: "Inter",
    style: "Bold",
  });
  list.appendChild(heading);
  for (const item of items) {
    const bullet = await createText(`• ${item}`, 12, undefined, "#4B5563");
    list.appendChild(bullet);
  }
  return list;
}

function createSceneInstance(
  source: ComponentNode | ComponentSetNode,
  props: Record<string, string>,
  facts: DerivedFacts,
): InstanceNode {
  const base = source.type === "COMPONENT_SET" ? source.defaultVariant : source;
  const instance = base.createInstance();

  if (source.type === "COMPONENT_SET") {
    for (const [axisName, value] of Object.entries(facts.pinnedDefaults)) {
      setVariantProps(instance, axisName, value);
    }
    for (const [axisName, value] of Object.entries(props)) {
      setVariantProps(instance, axisName, value);
    }
  }

  return instance;
}

async function buildScene(
  source: ComponentNode | ComponentSetNode,
  scene: SpecimenScene,
  facts: DerivedFacts,
  name: string,
): Promise<FrameNode> {
  const frame = buildAutoLayoutFrame(
    name,
    scene.layout === "stack" ? "VERTICAL" : "HORIZONTAL",
    0,
    0,
    12,
  );
  frame.counterAxisAlignItems = "CENTER";

  for (const instanceSpec of scene.instances) {
    const instance = createSceneInstance(source, instanceSpec.props, facts);
    frame.appendChild(instance);
    if (instanceSpec.labelOverride) {
      const label = await createText(
        instanceSpec.labelOverride,
        11,
        undefined,
        "#6B7280",
      );
      frame.appendChild(label);
    }
  }

  return frame;
}

async function buildVerdictIcon(verdict: "good" | "bad"): Promise<TextNode> {
  return verdict === "good"
    ? createText("✓", 16, { family: "Inter", style: "Bold" }, "#16A34A")
    : createText("✗", 16, { family: "Inter", style: "Bold" }, "#DC2626");
}

async function buildVerdictRow(
  source: ComponentNode | ComponentSetNode,
  verdict: "good" | "bad",
  scene: SpecimenScene,
  facts: DerivedFacts,
  name: string,
): Promise<FrameNode> {
  const row = buildAutoLayoutFrame(name, "HORIZONTAL", 0, 0, 8);
  row.counterAxisAlignItems = "CENTER";
  row.appendChild(await buildVerdictIcon(verdict));
  row.appendChild(await buildScene(source, scene, facts, `${name} — scene`));
  return row;
}

async function buildDoDontPair(
  source: ComponentNode | ComponentSetNode,
  pair: DoDontPair,
  facts: DerivedFacts,
  index: number,
): Promise<FrameNode> {
  const name = `do/dont — ${index}`;
  const block = buildAutoLayoutFrame(name, "VERTICAL", 0, 0, 8);
  block.appendChild(
    await createText(pair.description, 12, undefined, "#111827"),
  );
  block.appendChild(
    await buildVerdictRow(source, "good", pair.good, facts, `${name} — good`),
  );
  block.appendChild(
    await buildVerdictRow(source, "bad", pair.bad, facts, `${name} — bad`),
  );
  return block;
}

export async function buildGuidelinesSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode | null> {
  const guidelines = spec.guidelines;
  if (!guidelines) return null;

  const hasContent =
    (guidelines.whenToUse?.length ?? 0) > 0 ||
    (guidelines.whenNotToUse?.length ?? 0) > 0 ||
    (guidelines.general?.length ?? 0) > 0 ||
    (guidelines.doDonts?.length ?? 0) > 0;
  if (!hasContent) return null;

  const section = buildAutoLayoutFrame(
    "guidelines-section",
    "VERTICAL",
    0,
    0,
    16,
  );

  if (guidelines.whenToUse?.length) {
    section.appendChild(
      await buildBulletList(
        "guidelines — when to use",
        "When to use",
        guidelines.whenToUse,
      ),
    );
  }
  if (guidelines.whenNotToUse?.length) {
    section.appendChild(
      await buildBulletList(
        "guidelines — when not to use",
        "When not to use",
        guidelines.whenNotToUse,
      ),
    );
  }
  if (guidelines.general?.length) {
    section.appendChild(
      await buildBulletList(
        "guidelines — general",
        "General",
        guidelines.general,
      ),
    );
  }

  if (guidelines.doDonts?.length) {
    const doDonts = buildAutoLayoutFrame(
      "guidelines — do/dont",
      "VERTICAL",
      0,
      0,
      20,
    );
    for (let i = 0; i < guidelines.doDonts.length; i++) {
      doDonts.appendChild(
        await buildDoDontPair(source, guidelines.doDonts[i], facts, i),
      );
    }
    section.appendChild(doDonts);
  }

  return section;
}
