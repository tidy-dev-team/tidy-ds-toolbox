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
 */
export async function executeBuildLabels(
  element: ComponentSetNode,
  opts: {
    labels: LabelConfig;
    spacing: number;
    fontSize: number;
    extractElement: boolean;
  },
): Promise<void> {
  await loadFonts();
  await buildLabelElements(
    element.children,
    opts.labels,
    element,
    opts.spacing,
    opts.fontSize,
  );

  if (opts.extractElement) {
    extractToTheTop(element);
  }
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
 * Build all label elements for the component set
 */
async function buildLabelElements(
  nodes: readonly SceneNode[],
  labels: LabelConfig,
  element: ComponentSetNode,
  spacing: number,
  fontSize: number,
): Promise<void> {
  // Every column of the grid, and every row - read from all of the
  // children, so a ragged set still reports the rows that its first column
  // never reaches (#175).
  const columns = collectAxisSlots(nodes, "x");
  const rows = collectAxisSlots(nodes, "y");

  // Create first-level labels
  const topResult = await createLabelsForSlots(
    columns,
    labels.top,
    element,
    fontSize,
    (slot, label) => ({
      x: element.x + slot.center - label.width / 2,
      y: element.y - label.height - spacing,
    }),
  );
  const topLabels = topResult.labels;

  const leftResult = await createLabelsForSlots(
    rows,
    labels.left,
    element,
    fontSize,
    (slot, label) => ({
      x: element.x - label.width - spacing,
      y: element.y + slot.center - label.height / 2,
    }),
  );
  const leftLabels = leftResult.labels;

  // Calculate bounds for positioning second-level labels
  const leftBounds = computeMaximumBounds(leftLabels);
  const leftWidth = leftLabels.length ? leftBounds[1].x - leftBounds[0].x : 0;

  // Create second-level labels
  const secondTopResult = await createLabelsForSlots(
    columns,
    labels.secondTop,
    element,
    fontSize,
    (slot, label) => ({
      x: element.x + slot.center - label.width / 2,
      y: topLabels.length
        ? topLabels[0].y - label.height - spacing
        : element.y - label.height - spacing * 2,
    }),
  );
  const secondLevelTopLabels = secondTopResult.labels;

  const secondLeftResult = await createLabelsForSlots(
    rows,
    labels.secondLeft,
    element,
    fontSize,
    (slot, label) => ({
      x: element.x - (leftWidth + label.width + spacing * 2),
      y: element.y + slot.center - label.height / 2,
    }),
  );
  const secondLevelLeftLabels = secondLeftResult.labels;

  // Process and optimize label groups (optional per axis). Grouping is
  // scoped to the parent (primary) axis bucket so labels in different
  // primary groups stay distinct — otherwise e.g. all "primary" labels
  // across every size group would collapse into one globally-centered label.
  if (labels.groupSecondLeft) {
    const sourceByLabel = new Map(
      secondLeftResult.labels.map((l, i) => [l, secondLeftResult.sources[i]]),
    );
    processLabelGroups(secondLevelLeftLabels, "y", (label) => {
      const src = sourceByLabel.get(label);
      return src ? extractVariantValue(src.name, labels.left) : "";
    });
  }
  if (labels.groupSecondTop) {
    const sourceByLabel = new Map(
      secondTopResult.labels.map((l, i) => [l, secondTopResult.sources[i]]),
    );
    processLabelGroups(secondLevelTopLabels, "x", (label) => {
      const src = sourceByLabel.get(label);
      return src ? extractVariantValue(src.name, labels.top) : "";
    });
  }
}
