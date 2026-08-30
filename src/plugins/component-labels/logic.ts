/// <reference types="@figma/plugin-typings" />

import { findAllVariantProps } from "./utils/getVariantProps";
import { AxisSlot, chooseSlotValue, collectAxisSlots } from "./utils/axisSlots";
import { extractVariantValue } from "./utils/variantValue";
import { splitArrayOfObjects } from "./utils/splitArrayOfObjects";
import { extractToTheTop } from "./utils/extractToTheTop";
import {
  createModuleListeners,
  onSelectionAndPageChanges,
} from "../../shared/module-listeners";
import {
  LabelConfig,
  BuildLabelsPayload,
  SettingsPayload,
  VariantProperty,
} from "./types";
import {
  createCancellationToken,
  runUntilCancelled,
  type CancellationToken,
} from "../../shared/cancellation";

/**
 * Component Labels handler - processes messages from the UI
 */
const listeners = createModuleListeners("component-labels");

export async function componentLabelsHandler(
  action: string,
  payload: any,
  _figma?: PluginAPI,
): Promise<any> {
  ensureListeners();

  switch (action) {
    case "init":
      return handleInit();

    case "selection-change":
      return handleSelectionChange();

    case "build-labels":
      return await handleBuildLabels(payload);

    default:
      console.warn(`Unknown action: ${action}`);
      return null;
  }
}

/**
 * Initialize plugin and send stored settings
 */
function handleInit(): SettingsPayload {
  const spacing = figma.root.getPluginData("spacing");
  const fontSize = figma.root.getPluginData("fontSize");
  const extractElement = figma.root.getPluginData("extractElement");

  const settings: SettingsPayload = {
    spacing,
    fontSize,
    extractElement,
  };

  figma.ui.postMessage({
    type: "settings",
    payload: settings,
  });

  return settings;
}

/**
 * Handle selection change - extract variant props from selected component set
 */
function ensureListeners() {
  // Removed again when the shell navigates away (see
  // `src/shared/module-listeners.ts`). Until that existed these three kept
  // posting `variant-props` to a panel that was no longer mounted, for the rest
  // of the session, on every selection and page change in the file.
  listeners.ensure(() =>
    onSelectionAndPageChanges(() => {
      handleSelectionChange({ silent: true });
    }),
  );
}

type SelectionChangeOptions = {
  silent?: boolean;
};

function handleSelectionChange(
  options: SelectionChangeOptions = {},
): Record<string, VariantProperty> | null {
  const { silent } = options;
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: "selection-cleared",
    });
    return null;
  }

  const element = selection[0];
  if (element.type !== "COMPONENT_SET") {
    if (!silent) {
      figma.notify("Please select a component set");
      figma.ui.postMessage({
        type: "error",
        payload: { message: "Please select a component set" },
      });
    } else {
      figma.ui.postMessage({
        type: "selection-cleared",
      });
    }
    return null;
  }

  const variantProps = findAllVariantProps(element);

  figma.ui.postMessage({
    type: "variant-props",
    payload: variantProps,
  });

  return variantProps;
}

/**
 * Build labels for the selected component set
 */
async function handleBuildLabels(payload: BuildLabelsPayload): Promise<void> {
  const { labels, spacing, fontSize, extractElement } = payload;

  // Save plugin data
  savePluginData(spacing, fontSize, extractElement);

  const selection = figma.currentPage.selection;
  if (selection.length === 0 || selection[0].type !== "COMPONENT_SET") {
    figma.notify("Please select a component set");
    return;
  }

  const element = selection[0] as ComponentSetNode;

  await executeBuildLabels(element, {
    labels,
    spacing,
    fontSize,
    extractElement,
  });

  figma.notify("✓ Labels created successfully!");

  figma.ui.postMessage({
    type: "labels-built",
  });
}

/**
 * Build labels on a given component set. Shared between the UI message
 * handler and the agent-facing Operation.
 *
 * The token is optional and defaults to one nothing can cancel, so the
 * designer path - which has no Bridge and nobody to ask it to stop - behaves
 * exactly as it did. `runUntilCancelled` owns the check-and-yield pairing.
 */
export async function executeBuildLabels(
  element: ComponentSetNode,
  opts: {
    labels: LabelConfig;
    spacing: number;
    fontSize: number;
    extractElement: boolean;
  },
  token: CancellationToken = createCancellationToken(),
): Promise<LabelsBuildOutcome> {
  await loadFonts();
  return await buildLabelElements(
    element.children,
    opts.labels,
    element,
    opts.spacing,
    opts.fontSize,
    opts.extractElement,
    token,
  );
}

/**
 * What one step of the label build contributes.
 *
 * The build is a sequence of steps, not a uniform list of items: each axis
 * needs the previous axes' labels for its own positioning, and the grouping
 * needs both second-level rows. That is why the steps are thunks closing over
 * local results rather than items `runUntilCancelled` maps over directly.
 */
export type LabelStepName =
  | "top"
  | "left"
  | "second-top"
  | "second-left"
  | "grouping"
  | "extract";

/** Every step a full run takes, in the order it takes them. */
export const LABEL_STEP_ORDER: LabelStepName[] = [
  "top",
  "left",
  "second-top",
  "second-left",
  "grouping",
  "extract",
];
/** The outcome of a label build, whether it finished or was stopped. */
export interface LabelsBuildOutcome {
  /** The steps that ran to completion, in the order they ran. */
  completedSteps: LabelStepName[];
  /**
   * The steps this run was actually planning - the conditional ones
   * (grouping, extraction) are planned only when their condition is true, so
   * a report never names a step the run was never going to take.
   */
  plannedSteps: LabelStepName[];
  /** Whether the run stopped before covering every planned step. */
  cancelled: boolean;
}

/**
 * What a run that stopped short should tell the designer, or null if it did
 * not stop short.
 *
 * Same audience and same three questions as the DS Template's
 * `describeStoppedRun` (#184): how far did it get, what is on the canvas now,
 * and what happens if I run it again. The third matters most here because the
 * build only ever adds nodes - a second run draws a second set of labels
 * beside the first rather than completing it.
 */
export function describeStoppedLabelsBuild(
  completedSteps: readonly LabelStepName[],
  plannedSteps: readonly LabelStepName[],
): string | null {
  const missing = plannedSteps.filter((step) => !completedSteps.includes(step));
  if (missing.length === 0) return null;

  const completed =
    completedSteps.length === 0 ? "no steps" : completedSteps.join(", ");

  return (
    `Label build stopped after ${completed}. ` +
    `The labels already drawn are still on the canvas and were not undone; ` +
    `not drawn: ${missing.join(", ")}. ` +
    `Running it again draws a whole new set of labels beside these rather ` +
    `than filling in the missing ones - delete the drawn ones first if you ` +
    `want one clean set.`
  );
}
/**
 * Save plugin data to document
 */
function savePluginData(
  spacing?: number,
  fontSize?: number,
  extractElement?: boolean,
): void {
  if (spacing !== undefined) {
    figma.root.setPluginData("spacing", JSON.stringify(spacing));
  }

  if (fontSize !== undefined) {
    figma.root.setPluginData("fontSize", JSON.stringify(fontSize));
  }

  if (extractElement !== undefined) {
    figma.root.setPluginData("extractElement", JSON.stringify(extractElement));
  }
}

/**
 * Load necessary fonts
 */
async function loadFonts(): Promise<void> {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
}

/**
 * Creates a label carrying one variant value
 */
async function createLabel(
  value: string,
  parent: BaseNode,
  fontSize: number,
): Promise<TextNode> {
  const label = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  label.characters = value;
  label.fontName = { family: "Inter", style: "Regular" };
  label.fontSize = fontSize;
  //@ts-ignore
  parent.appendChild(label);

  return label;
}

/**
 * Creates one label per slot of an axis
 */
interface LabelRowResult {
  labels: TextNode[];
  sources: SceneNode[];
}

async function createLabelsForSlots(
  slots: readonly AxisSlot<SceneNode>[],
  propertyName: string,
  element: ComponentSetNode,
  fontSize: number,
  positionFn: (
    slot: AxisSlot<SceneNode>,
    label: TextNode,
  ) => { x: number; y: number },
): Promise<LabelRowResult> {
  const labels: TextNode[] = [];
  const sources: SceneNode[] = [];

  if (!propertyName) return { labels, sources };

  const parent = element.parent;
  if (!parent) return { labels, sources };

  for (const slot of slots) {
    const chosen = chooseSlotValue(slot, (node) =>
      extractVariantValue(node.name, propertyName),
    );
    if (!chosen) continue;

    const label = await createLabel(chosen.value, parent, fontSize);
    const position = positionFn(slot, label);
    label.x = position.x;
    label.y = position.y;
    labels.push(label);
    sources.push(chosen.node);
  }

  return { labels, sources };
}

/**
 * Merges the labels of a group into one label centred on the group.
 *
 * The axis is passed in rather than guessed from whether the first two
 * labels share a y: a group of one - which a ragged grid produces often -
 * has no second label to compare against, and guessing moved it by half its
 * own size.
 */
function processLabelGroups(
  labels: TextNode[],
  axis: "x" | "y",
  extraKey?: (label: TextNode) => string,
): void {
  const groupedLabels = splitArrayOfObjects(labels, extraKey);

  for (const group of groupedLabels) {
    // Each label already sits centred on its own slot, so the group's
    // centre is the midpoint of those centres - not of their outer bounds.
    const centerOf = (node: TextNode) =>
      axis === "x" ? node.x + node.width / 2 : node.y + node.height / 2;

    const centers = group.map(centerOf);
    const target = (Math.min(...centers) + Math.max(...centers)) / 2;

    group.sort((a, b) => centerOf(a) - centerOf(b));
    group.forEach((node, index) => {
      if (index > 0) {
        node.remove();
        return;
      }
      if (axis === "x") {
        node.x = target - node.width / 2;
      } else {
        node.y = target - node.height / 2;
      }
    });
  }
}

/**
 * Compute maximum bounds for an array of nodes
 */
function computeMaximumBounds(
  nodes: TextNode[],
): [{ x: number; y: number }, { x: number; y: number }] {
  if (nodes.length === 0) {
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return [
    { x: minX, y: minY },
    { x: maxX, y: maxY },
  ];
}

/**
 * Build all label elements for the component set.
 *
 * Stoppable between steps, never inside one (#185): the token is read by
 * `runUntilCancelled` between whole steps, so whatever a step draws is either
 * finished or never started. The build only ever adds nodes and removes
 * none, so a stopped run leaves the labels its completed steps drew - a
 * subset of a normal result, and never anything worse than not having run.
 * The grouping and extraction steps are listed even when their condition is
 * false, so the step order is the same for every run and a stopped run's
 * report names real steps either way.
 */
async function buildLabelElements(
  nodes: readonly SceneNode[],
  labels: LabelConfig,
  element: ComponentSetNode,
  spacing: number,
  fontSize: number,
  extractElement: boolean,
  token: CancellationToken,
): Promise<LabelsBuildOutcome> {
  // Every column of the grid, and every row - read from all of the
  // children, so a ragged set still reports the rows that its first column
  // never reaches (#175).
  const columns = collectAxisSlots(nodes, "x");
  const rows = collectAxisSlots(nodes, "y");

  let topResult: LabelRowResult = { labels: [], sources: [] };
  let leftResult: LabelRowResult = { labels: [], sources: [] };
  let secondTopResult: LabelRowResult = { labels: [], sources: [] };
  let secondLeftResult: LabelRowResult = { labels: [], sources: [] };
  let leftWidth = 0;

  // The conditional steps are planned only when their condition is true, so
  // a stopped run's report names real steps rather than steps that were
  // never going to run.
  const groupingStep: {
    name: LabelStepName;
    run: () => Promise<void> | void;
  } = {
    name: "grouping",
    run: () => {
      // Process and optimize label groups (optional per axis). Grouping is
      // scoped to the parent (primary) axis bucket so labels in different
      // primary groups stay distinct — otherwise e.g. all "primary" labels
      // across every size group would collapse into one globally-centered label.
      if (labels.groupSecondLeft) {
        const sourceByLabel = new Map(
          secondLeftResult.labels.map((l, i) => [
            l,
            secondLeftResult.sources[i],
          ]),
        );
        processLabelGroups(secondLeftResult.labels, "y", (label) => {
          const src = sourceByLabel.get(label);
          return src ? extractVariantValue(src.name, labels.left) : "";
        });
      }
      if (labels.groupSecondTop) {
        const sourceByLabel = new Map(
          secondTopResult.labels.map((l, i) => [l, secondTopResult.sources[i]]),
        );
        processLabelGroups(secondTopResult.labels, "x", (label) => {
          const src = sourceByLabel.get(label);
          return src ? extractVariantValue(src.name, labels.top) : "";
        });
      }
    },
  };

  const steps: { name: LabelStepName; run: () => Promise<void> | void }[] = [
    {
      name: "top",
      run: async () => {
        topResult = await createLabelsForSlots(
          columns,
          labels.top,
          element,
          fontSize,
          (slot, label) => ({
            x: element.x + slot.center - label.width / 2,
            y: element.y - label.height - spacing,
          }),
        );
      },
    },
    {
      name: "left",
      run: async () => {
        leftResult = await createLabelsForSlots(
          rows,
          labels.left,
          element,
          fontSize,
          (slot, label) => ({
            x: element.x - label.width - spacing,
            y: element.y + slot.center - label.height / 2,
          }),
        );
        // Calculate bounds for positioning second-level labels
        const leftBounds = computeMaximumBounds(leftResult.labels);
        leftWidth = leftResult.labels.length
          ? leftBounds[1].x - leftBounds[0].x
          : 0;
      },
    },
    {
      name: "second-top",
      run: async () => {
        secondTopResult = await createLabelsForSlots(
          columns,
          labels.secondTop,
          element,
          fontSize,
          (slot, label) => ({
            x: element.x + slot.center - label.width / 2,
            y: topResult.labels.length
              ? topResult.labels[0].y - label.height - spacing
              : element.y - label.height - spacing * 2,
          }),
        );
      },
    },
    {
      name: "second-left",
      run: async () => {
        secondLeftResult = await createLabelsForSlots(
          rows,
          labels.secondLeft,
          element,
          fontSize,
          (slot, label) => ({
            x: element.x - (leftWidth + label.width + spacing * 2),
            y: element.y + slot.center - label.height / 2,
          }),
        );
      },
    },
  ];
  if (labels.groupSecondLeft || labels.groupSecondTop) {
    steps.push(groupingStep);
  }
  if (extractElement) {
    steps.push({
      name: "extract",
      run: () => {
        extractToTheTop(element);
      },
    });
  }

  const { completed, cancelled } = await runUntilCancelled(
    steps,
    async (step) => {
      await step.run();
      return step;
    },
    token,
  );

  return {
    completedSteps: completed.map((step) => step.name),
    plannedSteps: steps.map((step) => step.name),
    cancelled,
  };
}
