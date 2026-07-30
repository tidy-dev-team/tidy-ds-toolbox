/// <reference types="@figma/plugin-typings" />

/**
 * Drawing a grid-of-instances block (#111's resize evidence, #112's contact sheet).
 *
 * The figma-touching half; *what* goes in the block is decided purely by
 * `resize-evidence.ts` and `contact-sheet.ts`, which share the `StateGridPlan`
 * shape this draws. One renderer for both, so the two blocks cannot drift apart
 * visually and the fiddly parts - guaranteed cleanup, a property combination Figma
 * refuses, placement beside the checklist - are solved once.
 *
 * Like the per-mode showcase, and unlike either probe, what this draws deliberately
 * **survives** the call: canvas evidence is the entire point. So it is labelled and
 * stamped, and it is released from the probe marker only once it is placed - an
 * unlabelled surviving frame is exactly the confusing artifact ADR-0001 worries
 * about.
 */

import { markProbe, unmarkProbe } from "../theme-probe";
import { driveWidthThrough } from "../resize-probe";
import type { DrivePath } from "../resize/plan";
import type { StateGridPlan, StatePanel } from "./state-grid";
import {
  autoLayout,
  card,
  FONT_BOLD,
  FONT_REGULAR,
  INK,
  loadRenderFonts,
  MUTED,
  text,
} from "./primitives";

const GAP_FROM_ANCHOR = 32;

/** Width reserved for the row labels down the left of a multi-row grid. */
const ROW_LABEL_WIDTH = 96;

/** Horizontal gap between columns. Shared so the header and every row agree. */
const COLUMN_GAP = 16;

/** Widest a caption wraps to, so a long measurement cannot stretch its column. */
const CAPTION_WIDTH = 200;

/** What a block needs to build its instances. */
export interface StateGridSubject {
  /** The component every cell instances - the set's default variant. */
  main: ComponentNode;
  /** How a width has to be driven for this component; see `planResizeProbe`. */
  path: DrivePath;
}

/**
 * Build one cell: a label, the instance in its stage, and any captions.
 *
 * The `setProperties` call is guarded rather than trusted. A set with an incomplete
 * variant matrix has combinations that do not exist, and Figma throws on those - so
 * on a contact sheet of 48 cells, one impossible combination would otherwise take
 * the whole block down. The cell says so instead, which is also more useful than a
 * blank: "this combination does not exist" is a fact about the set.
 */
function buildCell(
  panel: StatePanel,
  subject: StateGridSubject,
  track: Track,
): FrameNode {
  const cell = track(autoLayout(panel.label || "state", "VERTICAL", 0, 0, 6));
  cell.counterAxisSizingMode = "AUTO";
  cell.appendChild(track(text(panel.label, 10, FONT_BOLD, INK)));

  // The stage is what the width is driven through, so it has to be configured the
  // same way the probe configured its own - which is why that helper is shared
  // rather than reimplemented here. Getting the FILL case wrong would show a
  // component that never actually resized.
  const stage = track(
    autoLayout(`${panel.label} - stage`, "VERTICAL", 0, 0, 0),
  );
  cell.appendChild(stage);

  const instance = track(subject.main.createInstance());
  const drive = driveWidthThrough(
    stage,
    instance,
    subject.path,
    instance.width,
  );

  const problems: string[] = [];
  if (panel.properties && Object.keys(panel.properties).length > 0) {
    try {
      instance.setProperties(panel.properties);
    } catch {
      problems.push("This combination does not exist on the set.");
    }
  }
  // After the properties, not before: setting a boolean or swapping text changes
  // what the component wants to be, and the width has to be applied to that.
  if (panel.width !== undefined) drive(panel.width);

  for (const caption of [...problems, ...panel.captions]) {
    const line = track(text(caption, 10, FONT_REGULAR, MUTED));
    line.textAutoResize = "HEIGHT";
    line.resize(CAPTION_WIDTH, line.height);
    cell.appendChild(line);
  }

  return cell;
}

/** Records every node created, so a failed build can remove all of them. */
type Track = <T extends SceneNode>(node: T) => T;

function buildInto(
  plan: StateGridPlan,
  subject: StateGridSubject,
  track: Track,
): FrameNode {
  const root = track(autoLayout(plan.title, "VERTICAL", 24, 24, 16));
  // Claimed immediately, before anything that can fail. `track` covers a thrown
  // error; being killed mid-build unwinds nothing at all, and then the marker is
  // the only thing that lets the next run reclaim what is left (#131). Released in
  // `placeStateGrid` once the block is deliberately kept.
  markProbe(root);
  root.counterAxisSizingMode = "AUTO";
  card(root);

  root.appendChild(track(text(plan.title, 16, FONT_BOLD, INK)));
  const subtitle = track(text(plan.subtitle, 11, FONT_REGULAR, MUTED));
  root.appendChild(subtitle);

  const grid = track(autoLayout("grid", "VERTICAL", 0, 0, 12));
  grid.counterAxisSizingMode = "AUTO";
  root.appendChild(grid);

  // Column headings once at the top, rather than a label on every cell. On a
  // single-row block (the evidence one) the cells carry their own labels, because
  // there is no column/row distinction to draw and a header over one row is
  // redundant chrome.
  const headerRow = plan.rows.length > 1;
  const headings: TextNode[] = [];
  if (headerRow) {
    const header = track(autoLayout("columns", "HORIZONTAL", 0, 0, COLUMN_GAP));
    grid.appendChild(header);
    const corner = track(text("", 10, FONT_BOLD, MUTED));
    corner.resize(ROW_LABEL_WIDTH, corner.height);
    header.appendChild(corner);
    for (const cell of plan.rows[0].cells) {
      const heading = track(text(cell.label, 10, FONT_BOLD, MUTED));
      headings.push(heading);
      header.appendChild(heading);
    }
  }

  // Cells are collected per column so their widths can be reconciled afterwards.
  const columns: SceneNode[][] = [];
  for (const row of plan.rows) {
    const rowFrame = track(
      autoLayout(row.label || "row", "HORIZONTAL", 0, 0, COLUMN_GAP),
    );
    rowFrame.counterAxisAlignItems = "MIN";
    grid.appendChild(rowFrame);

    if (headerRow) {
      const label = track(text(row.label, 11, FONT_BOLD, INK));
      label.textAutoResize = "HEIGHT";
      label.resize(ROW_LABEL_WIDTH, label.height);
      rowFrame.appendChild(label);
    }

    row.cells.forEach((panel, column) => {
      const cell = buildCell(
        // On a multi-row grid the column heading is already drawn above, so the
        // per-cell label would repeat it once per row.
        headerRow ? { ...panel, label: "" } : panel,
        subject,
        track,
      );
      rowFrame.appendChild(cell);
      (columns[column] ??= []).push(cell);
    });
  }

  // **Columns are squared up after the fact, and have to be.**
  //
  // Left to hug, every cell takes its own intrinsic width, so a wide variant in row
  // two shifts every cell after it and the headings at the top line up with nothing.
  // A contact sheet whose columns do not align is not a contact sheet - the whole
  // point is scanning *down* a column to compare one state across variants.
  //
  // Figma has no grid layout to lean on here, so the widest cell in each column sets
  // that column's width and every other cell in it is pinned to the same number.
  columns.forEach((cells, column) => {
    const heading = headings[column];
    const width = Math.max(
      ...cells.map((cell) => cell.width),
      heading ? heading.width : 0,
    );
    for (const cell of cells) {
      if (cell.type !== "FRAME") continue;
      // Hugging has to be switched off before a width will stick.
      cell.counterAxisSizingMode = "FIXED";
      cell.resize(width, cell.height);
    }
    if (heading) {
      heading.textAutoResize = "HEIGHT";
      heading.resize(width, heading.height);
    }
  });

  const footnote = track(text(plan.footnote, 10, FONT_REGULAR, MUTED));
  root.appendChild(footnote);

  // Sized after everything is in place, because the width to wrap to is the width
  // the grid ended up needing - the same discipline the per-mode block uses, and
  // for the same reason: left to hug, one unwrapped sentence makes the card twice
  // as wide as its pictures need.
  const bodyWidth = Math.max(CAPTION_WIDTH, grid.width);
  for (const node of [subtitle, footnote]) {
    node.textAutoResize = "HEIGHT";
    node.resize(bodyWidth, node.height);
  }

  return root;
}

/**
 * Build the block, removing every node created if anything throws.
 *
 * Every `createFrame` / `createInstance` parents to the current page the moment it
 * is called, so each one is a litter risk until it is attached under the root -
 * removing the root alone leaves any node not yet appended. Tracking them all is
 * what makes the cleanup total. #131 has been round this loop: the guarantee has to
 * be structural rather than a careful reading.
 */
export async function buildStateGrid(
  plan: StateGridPlan,
  subject: StateGridSubject,
): Promise<FrameNode> {
  await loadRenderFonts();
  const created: SceneNode[] = [];
  try {
    return buildInto(plan, subject, (node) => {
      created.push(node);
      return node;
    });
  } catch (error) {
    // Last created first, so a parent never takes its children with it and leaves
    // the loop removing an already-removed node.
    for (const node of created.reverse()) {
      if (!node.removed) node.remove();
    }
    throw error;
  }
}

/**
 * Remove any prior block of this kind for this target, wherever it is.
 *
 * Scans every page at any depth, matching `renderChecklist`'s own lookup: a designer
 * may have moved the block into a frame or section, or onto another page, and a
 * lookup limited to the current page's direct children would miss it and stack a
 * second copy beside the first.
 *
 * Called even when this run draws nothing, so a re-run that no longer has evidence
 * to show - the component was fixed - clears the last run's block instead of leaving
 * it beside a freshly rebuilt checklist, where it reads as current.
 */
export async function removePriorStateGrid(
  dataKey: string,
  targetId: string,
): Promise<void> {
  await figma.loadAllPagesAsync();
  for (const page of figma.root.children) {
    for (const node of page.findAll(
      (candidate) => candidate.getPluginData(dataKey) === targetId,
    )) {
      node.remove();
    }
  }
}

/** Place the block below `anchor` (the checklist frame), stamped so a re-run replaces it. */
export function placeStateGrid(
  block: FrameNode,
  anchor: SceneNode,
  dataKey: string,
  targetId: string,
  /** Vertical offset from the anchor's top, so two blocks can stack. */
  offsetY: number,
): void {
  block.setPluginData(dataKey, targetId);
  // Into the anchor's own parent, not the current page: `x`/`y` are
  // parent-relative, so placing it anywhere else puts the offset in a different
  // coordinate space and the block lands nowhere near the checklist.
  const parent = anchor.parent ?? figma.currentPage;
  parent.appendChild(block);
  block.x = anchor.x + anchor.width + GAP_FROM_ANCHOR;
  block.y = anchor.y + offsetY;

  // Last, once the block is where it belongs: until this point it is still a
  // transient node the next run may reclaim, and after it the sweep leaves it
  // alone. Anything that throws above therefore leaves something recoverable
  // rather than a permanent orphan.
  unmarkProbe(block);
}
