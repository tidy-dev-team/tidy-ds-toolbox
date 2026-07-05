/// <reference types="@figma/plugin-typings" />

// Component Breakdown Section (CONTEXT.md "Component Breakdown"): a fixed,
// ordered catalogue of derived anatomy sub-sections — v1 ships Height,
// Width, Icon placement (Padding/Inner-spacing are a documented fast-follow)
// — each rendered only when the component exposes that fact
// (skip-when-empty one level down). Measurements are re-derived from the
// live component (deriveFacts.ts) and rendered raw; this builder never
// invents a fact the component doesn't expose.

import {
  buildAutoLayoutFrame,
  setVariantProps,
} from "../../sticker-sheet-builder/utils/utilityFunctions";
import { buildSizeMarks } from "../../tags-spacings/utils/sizeMarks";
import { loadInterFont } from "../../tags-spacings/utils/fontLoader";
import type { SpacingsConfig } from "../../tags-spacings/types";
import { createText } from "./buildChrome";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";
import type { SizeMeasurement } from "./anatomy";

const SIZE_MARKS_CONFIG: SpacingsConfig = {
  includeSize: true,
  includePaddings: false,
  includeItemSpacing: false,
  units: "px",
  rootSize: 16,
  isShallow: true,
};

function verticalSizingLabel(sizing: "FIXED" | "HUG" | "FILL"): string {
  return sizing.charAt(0) + sizing.slice(1).toLowerCase();
}

function createSizeSpecimenInstance(
  source: ComponentSetNode,
  facts: DerivedFacts,
  sizeValue: string,
): InstanceNode {
  const instance = source.defaultVariant.createInstance();

  for (const [axisName, value] of Object.entries(facts.pinnedDefaults)) {
    setVariantProps(instance, axisName, value);
  }
  if (facts.familyAxis.name) {
    const familyDefault =
      source.defaultVariant.variantProperties?.[facts.familyAxis.name];
    if (familyDefault)
      setVariantProps(instance, facts.familyAxis.name, familyDefault);
  }
  if (facts.sizeAxis?.name) {
    setVariantProps(instance, facts.sizeAxis.name, sizeValue);
  }

  return instance;
}

// Builds one specimen + code-generated size markers (tags-spacings,
// ADR-0006 — never Kido helper instances) inside a plain (non-auto-layout)
// wrapper. The wrapper is built at the page origin so absolute-space marker
// math (buildSizeMarks) and local-space reparenting agree; the wrapper's own
// position is then free to be repositioned by the outer auto-layout flow.
async function buildHeightRow(
  source: ComponentSetNode,
  facts: DerivedFacts,
  measurement: SizeMeasurement,
): Promise<FrameNode> {
  const specimen = createSizeSpecimenInstance(source, facts, measurement.value);
  specimen.x = 0;
  specimen.y = 0;

  const wrapper = figma.createFrame();
  wrapper.name = `height-specimen — ${measurement.value}`;
  wrapper.fills = [];
  wrapper.clipsContent = false;
  wrapper.x = 0;
  wrapper.y = 0;
  wrapper.resize(Math.max(specimen.width, 1), Math.max(specimen.height, 1));
  wrapper.appendChild(specimen);

  await loadInterFont();
  const markers = await buildSizeMarks(specimen, SIZE_MARKS_CONFIG);
  for (const marker of markers) wrapper.appendChild(marker);

  const maxX = Math.max(
    specimen.x + specimen.width,
    ...markers.map((marker) => marker.x + marker.width),
  );
  const maxY = Math.max(
    specimen.y + specimen.height,
    ...markers.map((marker) => marker.y + marker.height),
  );
  wrapper.resize(Math.max(maxX, 1), Math.max(maxY, 1));

  const label = await createText(
    `${measurement.value} — ${Math.round(measurement.height)}px — ${verticalSizingLabel(
      measurement.verticalSizing,
    )}`,
    12,
    undefined,
    "#4B5563",
  );

  const row = buildAutoLayoutFrame(
    `height-row — ${measurement.value}`,
    "HORIZONTAL",
    0,
    0,
    12,
  );
  row.counterAxisAlignItems = "CENTER";
  row.appendChild(wrapper);
  row.appendChild(label);
  return row;
}

async function buildHeightSubSection(
  source: ComponentSetNode,
  facts: DerivedFacts,
  caption?: string,
): Promise<FrameNode> {
  const block = buildAutoLayoutFrame("breakdown — height", "VERTICAL", 0, 0, 8);
  block.appendChild(
    await createText("Height", 14, { family: "Inter", style: "Bold" }),
  );
  if (caption) {
    block.appendChild(await createText(caption, 12, undefined, "#4B5563"));
  }

  const rows = buildAutoLayoutFrame(
    "breakdown — height — rows",
    "VERTICAL",
    0,
    0,
    12,
  );
  for (const measurement of facts.breakdown.heights) {
    rows.appendChild(await buildHeightRow(source, facts, measurement));
  }
  block.appendChild(rows);

  return block;
}

async function buildWidthSubSection(
  facts: DerivedFacts,
  caption?: string,
): Promise<FrameNode> {
  const block = buildAutoLayoutFrame("breakdown — width", "VERTICAL", 0, 0, 8);
  block.appendChild(
    await createText("Width", 14, { family: "Inter", style: "Bold" }),
  );
  if (caption) {
    block.appendChild(await createText(caption, 12, undefined, "#4B5563"));
  }

  const width = facts.breakdown.width!;
  if (width.minWidth !== null) {
    block.appendChild(
      await createText(
        `Min width: ${Math.round(width.minWidth)}px`,
        12,
        undefined,
        "#6B7280",
      ),
    );
  }
  if (width.maxWidth !== null) {
    block.appendChild(
      await createText(
        `Max width: ${Math.round(width.maxWidth)}px`,
        12,
        undefined,
        "#6B7280",
      ),
    );
  }

  return block;
}

async function buildIconPlacementSubSection(
  facts: DerivedFacts,
  caption?: string,
): Promise<FrameNode> {
  const block = buildAutoLayoutFrame(
    "breakdown — icon-placement",
    "VERTICAL",
    0,
    0,
    8,
  );
  block.appendChild(
    await createText("Icon placement", 14, { family: "Inter", style: "Bold" }),
  );
  if (caption) {
    block.appendChild(await createText(caption, 12, undefined, "#4B5563"));
  }

  const icon = facts.breakdown.iconPlacement!;
  const detail =
    icon.values.length > 0
      ? `${icon.propertyName} (${icon.propertyType.toLowerCase()}) — ${icon.values.join(", ")}`
      : `${icon.propertyName} (${icon.propertyType.toLowerCase()})`;
  block.appendChild(await createText(detail, 12, undefined, "#6B7280"));

  return block;
}

export async function buildBreakdownSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode | null> {
  const breakdownSpec = spec.breakdown;
  if (!breakdownSpec) return null;

  const { heights, width, iconPlacement } = facts.breakdown;
  if (heights.length === 0 && !width && !iconPlacement) {
    console.warn(
      `tidy-doc: "breakdown" key present but no derived anatomy facts for "${facts.componentName}" (${facts.componentId}); dropping the Component Breakdown Section.`,
    );
    return null;
  }

  const section = buildAutoLayoutFrame(
    "breakdown-section",
    "VERTICAL",
    0,
    0,
    24,
  );

  if (heights.length > 0 && source.type === "COMPONENT_SET") {
    section.appendChild(
      await buildHeightSubSection(source, facts, breakdownSpec.heightCaption),
    );
  }
  if (width) {
    section.appendChild(
      await buildWidthSubSection(facts, breakdownSpec.widthCaption),
    );
  }
  if (iconPlacement) {
    section.appendChild(
      await buildIconPlacementSubSection(
        facts,
        breakdownSpec.iconPlacementCaption,
      ),
    );
  }

  return section;
}
