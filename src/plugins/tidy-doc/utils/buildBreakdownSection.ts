/// <reference types="@figma/plugin-typings" />

// Component Breakdown Section (CONTEXT.md "Component Breakdown"): a fixed,
// ordered catalogue of derived anatomy sub-sections — v1 ships Height,
// Width, Icon placement (Padding/Inner-spacing are a documented fast-follow)
// — each rendered only when the component exposes that fact
// (skip-when-empty one level down). Measurements are re-derived from the
// live component (deriveFacts.ts) and rendered raw; this builder never
// invents a fact the component doesn't expose.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { buildSizeMarks } from "../../../shared/doc-markers/sizeMarks";
import { loadInterFont } from "../../../shared/doc-markers/fontLoader";
import type { SpacingsConfig } from "../../../shared/doc-markers/types";
import {
  buildTitleBlock,
  createText,
  DOC_SCALE,
  DOC_SPACING,
  TOKENS,
} from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import { describedIconPlacements, planIconPlacementExamples } from "./anatomy";
import type { DocSpec } from "./docSpec";
import type { DerivedFacts } from "./facts";
import type { IconPlacementExample, SizeMeasurement } from "./anatomy";

const SIZE_MARKS_CONFIG: SpacingsConfig = {
  includeSize: true,
  includePaddings: false,
  includeItemSpacing: false,
  units: "px",
  rootSize: 16,
  isShallow: true,
};

// Between one measured specimen and the next. Wider than the block rhythm
// because a height row carries redline markers that overhang its specimen on
// two sides — at 12 the marks of adjacent rows read as one figure.
const SPECIMEN_ROW_SPACING = 32;
// Between a specimen and the label naming it.
const SPECIMEN_LABEL_SPACING = 12;

function verticalSizingLabel(sizing: "FIXED" | "HUG" | "FILL"): string {
  return sizing.charAt(0) + sizing.slice(1).toLowerCase();
}

function familyDefaultOf(
  source: ComponentSetNode,
  facts: DerivedFacts,
): string | undefined {
  return facts.familyAxis.name
    ? source.defaultVariant.variantProperties?.[facts.familyAxis.name]
    : undefined;
}

function createSizeSpecimenInstance(
  source: ComponentSetNode,
  facts: DerivedFacts,
  sizeValue: string,
): InstanceNode {
  return createSpecimenInstance(source, {
    facts,
    familyValue: familyDefaultOf(source, facts),
    overrides: facts.sizeAxis?.name
      ? { [facts.sizeAxis.name]: sizeValue }
      : undefined,
  });
}

/** A specimen label: the line naming what sits under it. */
async function specimenLabel(text: string): Promise<TextNode> {
  return createText(text, DOC_SCALE.body, undefined, TOKENS.mutedDark);
}

// Builds one specimen + code-generated size markers (tags-spacings,
// ADR-0006 — never Kido helper instances) inside a plain (non-auto-layout)
// wrapper. The wrapper is built at the page origin so absolute-space marker
// math (buildSizeMarks) and local-space reparenting agree; the wrapper's own
// position is then free to be repositioned by the outer auto-layout flow.
async function buildMarkedSpecimen(
  specimen: InstanceNode,
  name: string,
): Promise<FrameNode> {
  specimen.x = 0;
  specimen.y = 0;

  const wrapper = figma.createFrame();
  wrapper.name = name;
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

  return wrapper;
}

/**
 * One measured size: the label over the specimen it measures.
 *
 * The label leads and the specimen follows, rather than sitting beside it,
 * because the redline markers extend the specimen to the right and below —
 * a label placed after them ended up detached from the figure it names, at a
 * distance that varied with the specimen's own width.
 */
async function buildHeightRow(
  source: ComponentSetNode,
  facts: DerivedFacts,
  measurement: SizeMeasurement,
): Promise<FrameNode> {
  const row = buildAutoLayoutFrame(
    `height-row — ${measurement.value}`,
    "VERTICAL",
    0,
    0,
    SPECIMEN_LABEL_SPACING,
  );
  row.appendChild(
    await specimenLabel(
      `${measurement.value} — ${Math.round(measurement.height)}px — ${verticalSizingLabel(
        measurement.verticalSizing,
      )}`,
    ),
  );
  row.appendChild(
    await buildMarkedSpecimen(
      createSizeSpecimenInstance(source, facts, measurement.value),
      `height-specimen — ${measurement.value}`,
    ),
  );
  return row;
}

async function buildHeightSubSection(
  source: ComponentSetNode,
  facts: DerivedFacts,
  caption?: string,
): Promise<FrameNode> {
  const block = buildAutoLayoutFrame(
    "breakdown — height",
    "VERTICAL",
    0,
    0,
    DOC_SPACING.block,
  );
  block.appendChild(
    await buildTitleBlock("title", "Height", caption ? [caption] : []),
  );

  const rows = buildAutoLayoutFrame(
    "breakdown — height — rows",
    "VERTICAL",
    0,
    0,
    SPECIMEN_ROW_SPACING,
  );
  for (const measurement of facts.breakdown.heights) {
    rows.appendChild(await buildHeightRow(source, facts, measurement));
  }
  block.appendChild(rows);

  return block;
}

// Width has no specimen of its own — the redlines under Height already show
// the geometry — so it stays a title group with the measured bounds appended
// as further lines, on the group's own rhythm.
async function buildWidthSubSection(
  facts: DerivedFacts,
  caption?: string,
): Promise<FrameNode> {
  const block = await buildTitleBlock(
    "breakdown — width",
    "Width",
    caption ? [caption] : [],
  );

  const width = facts.breakdown.width!;
  if (width.minWidth !== null) {
    block.appendChild(
      await createText(
        `Min width: ${Math.round(width.minWidth)}px`,
        DOC_SCALE.body,
        undefined,
        TOKENS.muted,
      ),
    );
  }
  if (width.maxWidth !== null) {
    block.appendChild(
      await createText(
        `Max width: ${Math.round(width.maxWidth)}px`,
        DOC_SCALE.body,
        undefined,
        TOKENS.muted,
      ),
    );
  }

  return block;
}

function iconPropertyLine(fact: {
  propertyName: string;
  propertyType: string;
  values: string[];
}): string {
  const type = fact.propertyType.toLowerCase();
  return fact.values.length > 0
    ? `${fact.propertyName} (${type}) — ${fact.values.join(", ")}`
    : `${fact.propertyName} (${type})`;
}

async function buildIconExample(
  source: ComponentNode | ComponentSetNode,
  facts: DerivedFacts,
  example: IconPlacementExample,
): Promise<FrameNode> {
  const row = buildAutoLayoutFrame(
    `icon-placement — ${example.label}`,
    "VERTICAL",
    0,
    0,
    SPECIMEN_LABEL_SPACING,
  );
  row.appendChild(await specimenLabel(example.label));
  row.appendChild(
    createSpecimenInstance(source, {
      facts,
      familyValue:
        source.type === "COMPONENT_SET"
          ? familyDefaultOf(source, facts)
          : undefined,
      overrides: example.variantOverrides,
      booleanOverrides: example.booleanOverrides,
    }),
  );
  return row;
}

async function buildIconPlacementSubSection(
  source: ComponentNode | ComponentSetNode,
  facts: DerivedFacts,
  caption?: string,
): Promise<FrameNode> {
  const block = buildAutoLayoutFrame(
    "breakdown — icon-placement",
    "VERTICAL",
    0,
    0,
    DOC_SPACING.title,
  );

  const title = await buildTitleBlock(
    "title",
    "Icon placement",
    caption ? [caption] : [],
  );
  for (const fact of describedIconPlacements(facts.breakdown.iconPlacements)) {
    title.appendChild(
      await createText(
        iconPropertyLine(fact),
        DOC_SCALE.body,
        undefined,
        TOKENS.muted,
      ),
    );
  }
  block.appendChild(title);

  // Specimens are what actually answer "where does the icon go"; the property
  // lines above only name the controls. A component whose icon property is an
  // INSTANCE_SWAP plans no examples — there is no icon here to choose — and
  // then the block is the property lines alone, as it was before #215.
  const examples = planIconPlacementExamples(facts.breakdown.iconPlacements);
  if (examples.length > 0) {
    const grid = buildAutoLayoutFrame(
      "breakdown — icon-placement — examples",
      "VERTICAL",
      0,
      0,
      SPECIMEN_ROW_SPACING,
    );
    for (const example of examples) {
      grid.appendChild(await buildIconExample(source, facts, example));
    }
    block.appendChild(grid);
  }

  return block;
}

// Pure skip predicate (#72) — whether the Breakdown Section has anything to
// render. Warns (but still reports `false`) when the spec asks for this
// Section but the component exposes none of the anatomy facts it needs.
export function appliesBreakdownSection(
  facts: DerivedFacts,
  spec: DocSpec,
): boolean {
  if (!spec.breakdown) return false;

  const { heights, width, iconPlacements } = facts.breakdown;
  if (heights.length === 0 && !width && iconPlacements.length === 0) {
    console.warn(
      `tidy-doc: "breakdown" key present but no derived anatomy facts for "${facts.componentName}" (${facts.componentId}); dropping the Component Breakdown Section.`,
    );
    return false;
  }

  return true;
}

export async function buildBreakdownSection(
  source: ComponentNode | ComponentSetNode,
  spec: DocSpec,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const breakdownSpec = spec.breakdown!;
  const { heights, width, iconPlacements } = facts.breakdown;

  const section = buildAutoLayoutFrame(
    "breakdown-section",
    "VERTICAL",
    0,
    0,
    DOC_SPACING.section,
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
  if (iconPlacements.length > 0) {
    section.appendChild(
      await buildIconPlacementSubSection(
        source,
        facts,
        breakdownSpec.iconPlacementCaption,
      ),
    );
  }

  return section;
}
