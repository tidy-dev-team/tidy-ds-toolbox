/// <reference types="@figma/plugin-typings" />

// Vertical layout — size-grouped Component Variants matrix (#65): for each
// size value (or a single unlabeled group when there's no size axis), a
// labeled group containing a grid whose rows are the family axis values and
// whose columns are demoted-axis combinations, each cell a live specimen
// instance of the real component. Axis roles come from deriveMatrixModel
// (matrixModel.ts), the single source of truth reused by Constraints (#66).

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import { deriveMatrixModel, type MatrixSizeGroup } from "./matrixModel";
import type { DerivedFacts } from "./facts";

function cellOverrides(
  facts: DerivedFacts,
  group: MatrixSizeGroup,
  columnProps: Record<string, string>,
): Record<string, string> {
  const overrides: Record<string, string> = { ...columnProps };
  if (facts.sizeAxis?.name && group.sizeValue) {
    overrides[facts.sizeAxis.name] = group.sizeValue;
  }
  return overrides;
}

export async function buildVariantMatrixSection(
  source: ComponentNode | ComponentSetNode,
  facts: DerivedFacts,
): Promise<FrameNode> {
  const model = deriveMatrixModel(facts);

  const section = buildAutoLayoutFrame(
    "variant-matrix-section",
    "VERTICAL",
    0,
    0,
    24,
  );
  section.appendChild(
    await createText("Component Variants", 18, {
      family: "Inter",
      style: "Bold",
    }),
  );

  for (const group of model.sizeGroups) {
    const groupName = group.label ?? "all sizes";
    const groupFrame = buildAutoLayoutFrame(
      `matrix — ${groupName}`,
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

    for (const row of model.rows) {
      const rowFrame = buildAutoLayoutFrame(
        `matrix — ${groupName} — row — ${row.label}`,
        "HORIZONTAL",
        0,
        0,
        16,
      );
      rowFrame.counterAxisAlignItems = "CENTER";

      const rowLabel = await createText(row.label, 12, undefined, "#6B7280");
      rowFrame.appendChild(rowLabel);

      for (const column of model.columns) {
        const cell = buildAutoLayoutFrame(
          `matrix — ${groupName} — ${row.label} — ${column.label || "cell"}`,
          "VERTICAL",
          0,
          0,
          4,
        );
        cell.counterAxisAlignItems = "CENTER";

        const instance = createSpecimenInstance(
          source,
          row.familyValue ?? "",
          facts,
          undefined,
          cellOverrides(facts, group, column.props),
        );
        cell.appendChild(instance);

        if (column.label) {
          cell.appendChild(
            await createText(column.label, 10, undefined, "#9CA3AF"),
          );
        }

        rowFrame.appendChild(cell);
      }

      groupFrame.appendChild(rowFrame);
    }

    section.appendChild(groupFrame);
  }

  return section;
}
