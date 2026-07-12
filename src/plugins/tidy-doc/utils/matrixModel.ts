// Pure axis-role assignment for the vertical layout's Component Variants
// matrix (#65): size groups, the row axis + row values, and the ordered list
// of column combinations (label + property map). No Figma types — operates
// on DerivedFacts so it's unit-testable without a Figma runtime (mirrors
// categorizeAxes.ts). This is the single source of truth for axis roles,
// reused by the Constraints section (#66) so the two always agree on which
// size/column combinations exist.

import type { DerivedFacts } from "./facts";

// A structural subset of DerivedFacts — just the axis-role fields the model
// needs — so deriveFacts.ts (the Figma-touching adapter) can build the model
// from the categorization result before the rest of DerivedFacts (breakdown,
// modeCollections, relatedCandidates) exists, to derive the Constraints
// width facts (#66) that must agree with this same model.
export type MatrixModelFacts = Pick<
  DerivedFacts,
  "sizeAxis" | "familyAxis" | "demotedAxisValues" | "componentName"
>;

export interface MatrixSizeGroup {
  label: string | null;
  sizeValue: string | null;
}

export interface MatrixRow {
  label: string;
  familyValue: string | null;
}

export interface MatrixColumn {
  label: string;
  props: Record<string, string>;
}

export interface MatrixModel {
  sizeGroups: MatrixSizeGroup[];
  rowAxisName: string | null;
  rows: MatrixRow[];
  columns: MatrixColumn[];
  /** Number of column combinations dropped by the cap (0 if none). */
  truncatedColumnCount: number;
}

// Mirrors the ~12 target and log-and-drop behavior of the existing height
// derivation (deriveFacts.ts's deriveHeights).
const MAX_COLUMNS = 12;

function cartesianProduct(
  axisEntries: Array<[string, string[]]>,
): Array<Record<string, string>> {
  return axisEntries.reduce<Array<Record<string, string>>>(
    (combos, [axisName, values]) => {
      const next: Array<Record<string, string>> = [];
      for (const combo of combos) {
        for (const value of values) {
          next.push({ ...combo, [axisName]: value });
        }
      }
      return next;
    },
    [{}],
  );
}

function columnLabel(props: Record<string, string>): string {
  return Object.values(props).join(" / ");
}

/**
 * Size groups = the size axis values (none ⇒ one unlabeled group). Rows =
 * the family axis values (no named family axis ⇒ one row labeled with the
 * component name). Columns = the capped cartesian product of the demoted
 * axes' values (no demoted axes ⇒ one empty column). The state axis is
 * never a column dimension — it isn't a key in `demotedAxisValues` — so
 * every cell pins it to its rest-state default instead.
 */
export function deriveMatrixModel(facts: MatrixModelFacts): MatrixModel {
  const sizeGroups: MatrixSizeGroup[] = facts.sizeAxis
    ? facts.sizeAxis.values.map((value) => ({
        label: value,
        sizeValue: value,
      }))
    : [{ label: null, sizeValue: null }];

  const rows: MatrixRow[] = facts.familyAxis.name
    ? facts.familyAxis.values.map((value) => ({
        label: value,
        familyValue: value,
      }))
    : [{ label: facts.componentName, familyValue: null }];

  const demotedAxisEntries = Object.entries(facts.demotedAxisValues);
  const allCombos = cartesianProduct(demotedAxisEntries);
  const truncatedColumnCount = Math.max(0, allCombos.length - MAX_COLUMNS);
  const cappedCombos = allCombos.slice(0, MAX_COLUMNS);

  if (truncatedColumnCount > 0) {
    console.warn(
      `tidy-doc: Component Variants matrix truncated ${truncatedColumnCount} column combination(s) past the ${MAX_COLUMNS}-column cap`,
    );
  }

  const columns: MatrixColumn[] = cappedCombos.map((props) => ({
    label: columnLabel(props),
    props,
  }));

  return {
    sizeGroups,
    rowAxisName: facts.familyAxis.name,
    rows,
    columns,
    truncatedColumnCount,
  };
}
