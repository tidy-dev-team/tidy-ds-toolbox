/// <reference types="@figma/plugin-typings" />

// Vertical layout — Constraints redline section (#66): per size group, a
// redline bracket + width label above a live specimen for each column
// combination, plus a height chip. Component-set only — omitted when
// deriveFacts.ts left breakdown.constraintWidths empty (a single component).
// Redline brackets are raw primitive nodes (a thin bar + two end ticks) in
// an absolutely-positioned, fixed-size wrapper, since Figma auto-layout
// cannot overlay an annotation above a specimen. All colors/dimensions are
// literal, code-owned constants.

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import { deriveMatrixModel } from "./matrixModel";
import { widthConstraintLabel } from "./anatomy";
import type { DerivedFacts } from "./facts";

const REDLINE_COLOR = "#EF4444";
const REDLINE_BAR_HEIGHT = 1;
const REDLINE_TICK_HEIGHT = 8;
const REDLINE_WRAPPER_HEIGHT = 16;

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

function buildRedlineBracket(width: number): FrameNode {
  const wrapperWidth = Math.max(width, 1);

  const wrapper = figma.createFrame();
  wrapper.name = "redline-bracket";
  wrapper.layoutMode = "NONE";
  wrapper.fills = [];
  wrapper.resize(wrapperWidth, REDLINE_WRAPPER_HEIGHT);

  const bar = figma.createRectangle();
  bar.name = "redline-bracket — bar";
  bar.resize(wrapperWidth, REDLINE_BAR_HEIGHT);
  bar.x = 0;
  bar.y = (REDLINE_WRAPPER_HEIGHT - REDLINE_BAR_HEIGHT) / 2;
  bar.fills = [{ type: "SOLID", color: hexToRgb(REDLINE_COLOR) }];
  wrapper.appendChild(bar);

  for (const x of [0, wrapperWidth]) {
    const tick = figma.createRectangle();
    tick.name = "redline-bracket — tick";
    tick.resize(REDLINE_BAR_HEIGHT, REDLINE_TICK_HEIGHT);
    tick.x = Math.min(Math.max(x - REDLINE_BAR_HEIGHT / 2, 0), wrapperWidth);
    tick.y = (REDLINE_WRAPPER_HEIGHT - REDLINE_TICK_HEIGHT) / 2;
    tick.fills = [{ type: "SOLID", color: hexToRgb(REDLINE_COLOR) }];
    wrapper.appendChild(tick);
  }

  return wrapper;
}

async function buildHeightChip(
  heightFact: { height: number; verticalSizing: "FIXED" | "HUG" | "FILL" },
): Promise<FrameNode> {
  const chip = buildAutoLayoutFrame("height-chip", "HORIZONTAL", 8, 4, 4);
  chip.cornerRadius = 6;
  chip.fills = [{ type: "SOLID", color: hexToRgb("#F3F4F6") }];
  const label =
    heightFact.verticalSizing === "FIXED"
      ? `H: ${Math.round(heightFact.height)}`
      : `H: ${heightFact.verticalSizing === "HUG" ? "Hug" : "Fill"}`;
  chip.appendChild(await createText(label, 10, undefined, "#4B5563"));
  return chip;
}

export async function buildConstraintsSection(
  source: ComponentNode | ComponentSetNode,
  facts: DerivedFacts,
): Promise<FrameNode | null> {
  if (facts.breakdown.constraintWidths.length === 0) return null;

  const model = deriveMatrixModel(facts);
  const widthByKey = new Map(
    facts.breakdown.constraintWidths.map((fact) => [
      `${fact.sizeLabel ?? ""}::${fact.columnLabel}`,
      fact,
    ]),
  );

  const section = buildAutoLayoutFrame(
    "constraints-section",
    "VERTICAL",
    0,
    0,
    24,
  );
  section.appendChild(
    await createText("Constraints", 18, { family: "Inter", style: "Bold" }),
  );

  for (const group of model.sizeGroups) {
    const groupName = group.label ?? "all sizes";
    const groupFrame = buildAutoLayoutFrame(
      `constraints — ${groupName}`,
      "VERTICAL",
      0,
      0,
      12,
    );

    if (group.label) {
      groupFrame.appendChild(
        await createText(group.label, 14, { family: "Inter", style: "Bold" }),
      );
    }

    const height = facts.breakdown.heights.find(
      (h) => h.value === group.sizeValue,
    );
    if (height) {
      groupFrame.appendChild(await buildHeightChip(height));
    }

    const row = buildAutoLayoutFrame(
      `constraints — ${groupName} — row`,
      "HORIZONTAL",
      0,
      0,
      24,
    );

    for (const column of model.columns) {
      const widthFact = widthByKey.get(
        `${group.label ?? ""}::${column.label}`,
      );
      if (!widthFact) continue;

      const cell = buildAutoLayoutFrame(
        `constraints — ${groupName} — ${column.label || "cell"}`,
        "VERTICAL",
        0,
        0,
        4,
      );
      cell.counterAxisAlignItems = "CENTER";

      cell.appendChild(
        await createText(
          widthConstraintLabel(widthFact.horizontalSizing, widthFact.width),
          10,
          undefined,
          "#DC2626",
        ),
      );
      cell.appendChild(buildRedlineBracket(widthFact.width));

      const overrides: Record<string, string> = { ...column.props };
      if (facts.sizeAxis?.name && group.sizeValue) {
        overrides[facts.sizeAxis.name] = group.sizeValue;
      }
      const instance = createSpecimenInstance(
        source,
        widthFact.familyValue ?? facts.familyAxis.values[0] ?? "",
        facts,
        undefined,
        overrides,
      );
      cell.appendChild(instance);

      if (column.label) {
        cell.appendChild(
          await createText(column.label, 10, undefined, "#9CA3AF"),
        );
      }

      row.appendChild(cell);
    }

    groupFrame.appendChild(row);
    section.appendChild(groupFrame);
  }

  return section;
}
