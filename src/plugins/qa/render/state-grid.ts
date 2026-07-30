/**
 * What a grid-of-instances block contains, decided purely (#111, #112).
 *
 * Two blocks in this engine are the same artifact with different content: #111's
 * resize evidence (the baseline beside the state that broke, labelled with the
 * measured numbers) and #112's contact sheet (every property combination in one
 * eyeful, rows by variant and columns by state). Both are a card of labelled
 * instances placed beside the checklist, so they share one renderer
 * (`renderStateGrid.ts`) and differ only in the plan that feeds it.
 *
 * Keeping the plan pure is what makes either block's *content* testable without
 * Figma - which matters more here than usual, because a drawing bug in this engine
 * has form: three visual defects passed a full test suite and were only caught by
 * rendering the frame and looking at it (#146).
 */

/** Component property values to apply to the instance in one cell. */
export type PanelProperties = Record<string, string | boolean>;

/** One instance in the grid, with what to say about it. */
export interface StatePanel {
  /** Short label above the instance, e.g. "widened to 300px". */
  label: string;
  /**
   * Measured facts printed under the instance. Empty for a cell that is only
   * there to be looked at, which is the whole contact sheet.
   */
  captions: string[];
  /**
   * Width to drive the instance to. Absent leaves it at its natural width, which
   * is what a long-text or property-combination cell wants: driving a width there
   * would confuse two variables in one picture.
   */
  width?: number;
  /**
   * Properties to set on the instance - variant axes, booleans and injected long
   * text alike, all as one `setProperties` call.
   *
   * One mechanism rather than three: a variant row, a boolean column and the
   * long-text cell are all "instance the default variant, then set these
   * properties", so the renderer has no per-kind branch to get wrong.
   */
  properties?: PanelProperties;
}

export interface StateGridRow {
  /** Row label down the left, e.g. a variant name. Empty for a single-row block. */
  label: string;
  cells: StatePanel[];
}

export interface StateGridPlan {
  /** Card heading. */
  title: string;
  /** One line under the heading saying what the block is. */
  subtitle: string;
  /**
   * The small print: what this block does *not* cover.
   *
   * Never optional, and never allowed to be empty. Both blocks bound their own
   * coverage - the evidence block shows at most a couple of states, the contact
   * sheet caps its combinations - and a block that silently truncated would read
   * as "here is everything", which is the failure mode #112 called out by name:
   * either way the row must state what was skipped rather than imply full
   * coverage.
   */
  footnote: string;
  rows: StateGridRow[];
}

/** Why there is no block. A fact about the component, usually, not a failure. */
export interface NoStateGrid {
  reason: string;
}

export function isPlan(
  result: StateGridPlan | NoStateGrid,
): result is StateGridPlan {
  return "rows" in result;
}
