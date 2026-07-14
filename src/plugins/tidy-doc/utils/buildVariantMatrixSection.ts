/// <reference types="@figma/plugin-typings" />

// Vertical layout — size-grouped Component Variants matrix (#65): for each
// size value (or a single unlabeled group when there's no size axis), a
// labeled group containing a grid whose rows are the family axis values and
// whose columns are demoted-axis combinations, each cell a live specimen
// instance of the real component. Axis roles come from deriveMatrixModel
// (matrixModel.ts), the single source of truth reused by Constraints (#66).

import { buildAutoLayoutFrame } from "../../sticker-sheet-builder/utils/utilityFunctions";
import { createText, buildSectionTitle, buildSizeSeparator, TOKENS } from "./buildChrome";
import { createSpecimenInstance } from "./specimenFactory";
import { deriveMatrixModel, type MatrixSizeGroup } from "./matrixModel";
import type { DerivedFacts } from "./facts";

// "s" → "Size S", "small" → "Size Small". The separator reads as a size-group
// header (these groups exist only when there is a size axis).
function sizeSeparatorLabel(value: string): string {
  return `Size ${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

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
  section.layoutAlign = "STRETCH";
  section.appendChild(await buildSectionTitle("Component Variants"));

  for (const group of model.sizeGroups) {
    const groupName = group.label ?? "all sizes";
    const groupFrame = buildAutoLayoutFrame(
      `matrix — ${groupName}`,
      "VERTICAL",
      0,
      0,
      12,
    );
    groupFrame.layoutAlign = "STRETCH";

    if (group.label) {
      groupFrame.appendChild(await buildSizeSeparator(sizeSeparatorLabel(group.label)));
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

      // Prefix the family axis name so the row reads e.g. "BtnAmount = 1"
      // rather than a bare "1"; a nameless family (single unnamed row labeled
      // with the component name) is left as-is.
      const rowLabelText = model.rowAxisName
        ? `${model.rowAxisName} = ${row.label}`
        : row.label;
      const rowLabel = await createText(rowLabelText, 12, undefined, TOKENS.muted);
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
            await createText(column.label, 10, undefined, TOKENS.faint),
          );
        }

        rowFrame.appendChild(cell);
      }

      groupFrame.appendChild(rowFrame);
    }

    section.appendChild(groupFrame);
  }

  // One off/on PAIR per BOOLEAN property: the default variant with the property
  // forced off and forced on. A pair (rather than a single "on" example) is
  // needed because a property may default to on — showing only "on" would look
  // identical to the default. Stacked vertically below the normal variants (not
  // as extra columns) since a component may declare any number of them.
  if (facts.booleanProperties.length > 0) {
    const defaultFamilyValue =
      source.type === "COMPONENT_SET" && facts.familyAxis.name
        ? (source.defaultVariant?.variantProperties?.[facts.familyAxis.name] ??
          facts.familyAxis.values[0] ??
          "")
        : (facts.familyAxis.values[0] ?? "");

    const boolGroup = buildAutoLayoutFrame(
      "matrix — boolean props",
      "VERTICAL",
      0,
      0,
      16,
    );

    for (const prop of facts.booleanProperties) {
      const rowFrame = buildAutoLayoutFrame(
        `matrix — boolean — ${prop.name}`,
        "HORIZONTAL",
        0,
        0,
        16,
      );
      rowFrame.counterAxisAlignItems = "CENTER";
      rowFrame.appendChild(await createText(prop.name, 12, undefined, TOKENS.muted));

      for (const value of [false, true]) {
        const cell = buildAutoLayoutFrame(
          `matrix — boolean — ${prop.name} — ${value ? "on" : "off"}`,
          "VERTICAL",
          0,
          0,
          4,
        );
        cell.counterAxisAlignItems = "CENTER";

        const instance = createSpecimenInstance(
          source,
          defaultFamilyValue,
          facts,
          undefined,
          undefined,
          { [prop.key]: value },
        );
        cell.appendChild(instance);
        cell.appendChild(
          await createText(value ? "on" : "off", 10, undefined, TOKENS.faint),
        );

        rowFrame.appendChild(cell);
      }

      boolGroup.appendChild(rowFrame);
    }

    section.appendChild(boolGroup);
  }

  return section;
}
