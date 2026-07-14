/// <reference types="@figma/plugin-typings" />

// Vertical layout — Constraints redline section (#66): per size group, a
// redline bracket + width label above a live specimen for each DISTINCT
// measured width, plus a height chip. deriveFacts.ts collapses variants that
// share the same geometry (dedupeConstraintFacts), so a family whose values
// are all the same width shows one unlabeled redline, while a family whose
// values differ (e.g. a 1- vs 2-button group) shows one labeled redline each.
// Component-set only — omitted when breakdown.constraintWidths is empty.
// Redline brackets are raw primitive nodes (a thin bar + two end ticks) in
// an absolutely-positioned, fixed-size wrapper, since Figma auto-layout
// cannot overlay an annotation above a specimen. All colors/dimensions are
// literal, code-owned constants.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText, buildSectionTitle, fill, FONT_BOLD, TOKENS } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import { deriveMatrixModel } from "./matrixModel";
import { widthConstraintLabel } from "./anatomy";
import type { DerivedFacts } from "./facts";

const MARKER_BAR_THICKNESS = 2;
const MARKER_TICK_LENGTH = 12;
const WIDTH_BRACKET_HEIGHT = 24;

function markerRect(name: string, width: number, height: number): RectangleNode {
  const rect = figma.createRectangle();
  rect.name = name;
  rect.resize(width, height);
  rect.cornerRadius = Math.min(width, height) / 2;
  fill(rect, TOKENS.marker);
  return rect;
}

async function buildMarkerPill(label: string): Promise<FrameNode> {
  const pill = buildAutoLayoutFrame("marker-pill", "HORIZONTAL", 8, 3, 4);
  pill.cornerRadius = 6;
  fill(pill, TOKENS.marker);
  pill.appendChild(
    await createText(label, 10, FONT_BOLD, TOKENS.card),
  );
  return pill;
}

// Horizontal measurement bracket: a bar with end ticks and the width label
// in a pill centered on the bar (the original docs' redline style).
async function buildWidthBracket(width: number, label: string): Promise<FrameNode> {
  const wrapper = figma.createFrame();
  wrapper.name = "width-bracket";
  wrapper.layoutMode = "NONE";
  wrapper.fills = [];
  wrapper.clipsContent = false;

  const pill = await buildMarkerPill(label);
  const wrapperWidth = Math.max(width, pill.width + 8, 1);
  const wrapperHeight = Math.max(WIDTH_BRACKET_HEIGHT, pill.height);
  wrapper.resize(wrapperWidth, wrapperHeight);

  const bar = markerRect(
    "width-bracket — bar",
    wrapperWidth,
    MARKER_BAR_THICKNESS,
  );
  bar.x = 0;
  bar.y = (wrapperHeight - MARKER_BAR_THICKNESS) / 2;
  wrapper.appendChild(bar);

  for (const x of [0, wrapperWidth - MARKER_BAR_THICKNESS]) {
    const tick = markerRect(
      "width-bracket — tick",
      MARKER_BAR_THICKNESS,
      MARKER_TICK_LENGTH,
    );
    tick.x = x;
    tick.y = (wrapperHeight - MARKER_TICK_LENGTH) / 2;
    wrapper.appendChild(tick);
  }

  wrapper.appendChild(pill);
  pill.x = (wrapperWidth - pill.width) / 2;
  pill.y = (wrapperHeight - pill.height) / 2;

  return wrapper;
}

// Vertical measurement bracket beside the specimen: a bar spanning the
// specimen's height, end ticks, and the height number in a centered pill.
async function buildHeightBracket(specimenHeight: number, label: string): Promise<FrameNode> {
  const wrapper = figma.createFrame();
  wrapper.name = "height-bracket";
  wrapper.layoutMode = "NONE";
  wrapper.fills = [];
  wrapper.clipsContent = false;

  const pill = await buildMarkerPill(label);
  const wrapperWidth = Math.max(MARKER_TICK_LENGTH, pill.width);
  const wrapperHeight = Math.max(specimenHeight, pill.height, 1);
  wrapper.resize(wrapperWidth, wrapperHeight);

  const bar = markerRect(
    "height-bracket — bar",
    MARKER_BAR_THICKNESS,
    wrapperHeight,
  );
  bar.x = (wrapperWidth - MARKER_BAR_THICKNESS) / 2;
  bar.y = 0;
  wrapper.appendChild(bar);

  for (const y of [0, wrapperHeight - MARKER_BAR_THICKNESS]) {
    const tick = markerRect(
      "height-bracket — tick",
      MARKER_TICK_LENGTH,
      MARKER_BAR_THICKNESS,
    );
    tick.x = (wrapperWidth - MARKER_TICK_LENGTH) / 2;
    tick.y = y;
    wrapper.appendChild(tick);
  }

  wrapper.appendChild(pill);
  pill.x = (wrapperWidth - pill.width) / 2;
  pill.y = (wrapperHeight - pill.height) / 2;

  return wrapper;
}

// Pure skip predicate (#72) — whether the Constraints Section has any
// redlined widths to render.
export function appliesConstraintsSection(facts: DerivedFacts): boolean {
  return facts.breakdown.constraintWidths.length > 0;
}

export async function buildConstraintsSection(
  source: ComponentNode | ComponentSetNode,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const model = deriveMatrixModel(facts);
  const factsBySize = new Map<string, typeof facts.breakdown.constraintWidths>();
  for (const fact of facts.breakdown.constraintWidths) {
    const key = fact.sizeLabel ?? "";
    const bucket = factsBySize.get(key);
    if (bucket) bucket.push(fact);
    else factsBySize.set(key, [fact]);
  }

  const section = buildAutoLayoutFrame(
    "constraints-section",
    "VERTICAL",
    0,
    0,
    24,
  );
  section.layoutAlign = "STRETCH";
  section.appendChild(await buildSectionTitle("Constraints"));

  for (const group of model.sizeGroups) {
    const groupName = group.label ?? "all sizes";
    const groupFacts = factsBySize.get(group.label ?? "");
    if (!groupFacts || groupFacts.length === 0) continue;

    const groupFrame = buildAutoLayoutFrame(
      `constraints — ${groupName}`,
      "VERTICAL",
      0,
      0,
      12,
    );
    if (group.label) {
      // Same "Size M" wording as the Variants section's separator, but keeping
      // this section's plain bold label design.
      groupFrame.appendChild(
        await createText(
          `Size ${group.label.charAt(0).toUpperCase()}${group.label.slice(1)}`,
          14,
          FONT_BOLD,
        ),
      );
    }

    const height = facts.breakdown.heights.find(
      (h) => h.value === group.sizeValue,
    );

    const row = buildAutoLayoutFrame(
      `constraints — ${groupName} — row`,
      "HORIZONTAL",
      0,
      0,
      24,
    );

    for (const widthFact of groupFacts) {
      const cell = buildAutoLayoutFrame(
        `constraints — ${groupName} — ${widthFact.label || "cell"}`,
        "VERTICAL",
        0,
        0,
        8,
      );
      // Left-aligned so the width bracket tracks the specimen's edge even
      // when the height bracket widens the specimen row beneath it.
      cell.counterAxisAlignItems = "MIN";

      cell.appendChild(
        await buildWidthBracket(
          widthFact.width,
          widthConstraintLabel(
            widthFact.horizontalSizing,
            widthFact.width,
            widthFact.minWidth,
            widthFact.maxWidth,
          ),
        ),
      );

      const overrides: Record<string, string> = { ...widthFact.columnProps };
      if (facts.sizeAxis?.name && group.sizeValue) {
        overrides[facts.sizeAxis.name] = group.sizeValue;
      }
      const instance = createSpecimenInstance(source, {
        familyValue: widthFact.familyValue ?? facts.familyAxis.values[0] ?? "",
        facts,
        overrides,
      });

      // The height bracket rides beside every specimen — one per redlined
      // variant, so each cell reads as a complete width × height measurement.
      if (height) {
        const specimenRow = buildAutoLayoutFrame(
          `constraints — ${groupName} — ${widthFact.label || "cell"} — specimen`,
          "HORIZONTAL",
          0,
          0,
          12,
        );
        specimenRow.counterAxisAlignItems = "CENTER";
        specimenRow.appendChild(instance);
        specimenRow.appendChild(
          await buildHeightBracket(
            instance.height,
            `${Math.round(height.height)}`,
          ),
        );
        cell.appendChild(specimenRow);
      } else {
        cell.appendChild(instance);
      }

      if (widthFact.label) {
        cell.appendChild(
          await createText(widthFact.label, 10, undefined, TOKENS.faint),
        );
      }

      row.appendChild(cell);
    }

    groupFrame.appendChild(row);
    section.appendChild(groupFrame);
  }

  return section;
}
