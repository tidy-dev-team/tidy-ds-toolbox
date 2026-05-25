/// <reference types="@figma/plugin-typings" />

import { findAllVariantProps } from "./utils/getVariantProps";
import { getTopAndLeftElements } from "./utils/getTopAndLeftElements";
import { splitArrayOfObjects } from "./utils/splitArrayOfObjects";
import { extractToTheTop } from "./utils/extractToTheTop";
import {
  LabelConfig,
  BuildLabelsPayload,
  SettingsPayload,
  VariantProperty,
} from "./types";

/**
 * Component Labels handler - processes messages from the UI
 */
let listenersRegistered = false;

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
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  figma.on("selectionchange", () => handleSelectionChange({ silent: true }));
  figma.on("currentpagechange", () => handleSelectionChange({ silent: true }));
  figma.on("run", () => handleSelectionChange({ silent: true }));
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

  await executeBuildLabels(element, { labels, spacing, fontSize, extractElement });

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
 * Creates and positions a label for a component node
 */
async function createLabel(
  node: SceneNode,
  propertyName: string,
  parent: BaseNode,
  fontSize: number,
  position: { x: number; y: number },
): Promise<TextNode | null> {
  const arr = node.name.split(",");
  const found = arr.find((item) => item.includes(propertyName));
  const value = found?.split("=")[1];

  if (!value) return null;

  const label = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  label.characters = value;
  label.fontName = { family: "Inter", style: "Regular" };
  label.fontSize = fontSize;
  //@ts-ignore
  parent.appendChild(label);
  label.x = position.x;
  label.y = position.y;

  return label;
}

/**
 * Creates labels for a row of nodes
 */
interface LabelRowResult {
  labels: TextNode[];
  sources: SceneNode[];
}

async function createLabelsForRow(
  rowNodes: SceneNode[],
  propertyName: string,
  element: ComponentSetNode,
  _spacing: number,
  fontSize: number,
  positionFn: (node: SceneNode, label: TextNode) => { x: number; y: number },
): Promise<LabelRowResult> {
  const labels: TextNode[] = [];
  const sources: SceneNode[] = [];

  if (!propertyName) return { labels, sources };

  const parent = element.parent;
  if (!parent) return { labels, sources };

  for (const node of rowNodes) {
    const label = await createLabel(
      node,
      propertyName,
      parent,
      fontSize,
      { x: 0, y: 0 }, // Temporary position
    );

    if (label) {
      // Calculate the final position
      const position = positionFn(node, label);
      label.x = position.x;
      label.y = position.y;
      labels.push(label);
      sources.push(node);
    }
  }

  return { labels, sources };
}

function extractVariantValue(node: SceneNode, propertyName: string): string {
  if (!propertyName) return "";
  const arr = node.name.split(",");
  const found = arr.find((item) => item.includes(propertyName));
  return found?.split("=")[1]?.trim() ?? "";
}

/**
 * Processes and optimizes groups of labels
 */
function processLabelGroups(
  labels: TextNode[],
  extraKey?: (label: TextNode) => string,
): void {
  const groupedLabels = splitArrayOfObjects(labels, extraKey);

  for (const group of groupedLabels) {
    const bounds = computeMaximumBounds(group);
    const isVertical = group[0].y !== group[1]?.y;

    if (isVertical) {
      // Vertical alignment (left labels)
      const min = bounds[0].y;
      const max = bounds[1].y;
      const shift = (max - min) / 2;

      group.sort((a, b) => a.y - b.y);
      group.forEach((node, index) => {
        if (index === 0) {
          node.y = node.y + shift - node.height / 2;
        } else {
          node.remove();
        }
      });
    } else {
      // Horizontal alignment (top labels)
      const min = bounds[0].x;
      const max = bounds[1].x;
      const shift = (max - min) / 2;

      group.sort((a, b) => a.x - b.x);
      group.forEach((node, index) => {
        if (index === 0) {
          node.x = node.x + shift;
        } else {
          node.remove();
        }
      });
    }
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
  const { leftRow, topRow } = getTopAndLeftElements(nodes);

  // Create first-level labels
  const topResult = await createLabelsForRow(
    topRow,
    labels.top,
    element,
    spacing,
    fontSize,
    (node, label) => ({
      x: element.x + node.x + node.width / 2 - label.width / 2,
      y: element.y - label.height - spacing,
    }),
  );
  const topLabels = topResult.labels;

  const leftResult = await createLabelsForRow(
    leftRow,
    labels.left,
    element,
    spacing,
    fontSize,
    (node, label) => ({
      x: element.x - label.width - spacing,
      y: element.y + node.y + node.height / 2 - label.height / 2,
    }),
  );
  const leftLabels = leftResult.labels;

  // Calculate bounds for positioning second-level labels
  const leftBounds = computeMaximumBounds(leftLabels);
  const leftWidth = leftLabels.length ? leftBounds[1].x - leftBounds[0].x : 0;

  // Create second-level labels
  const secondTopResult = await createLabelsForRow(
    topRow,
    labels.secondTop,
    element,
    spacing,
    fontSize,
    (node, label) => ({
      x: element.x + node.x + node.width / 2 - label.width / 2,
      y: topLabels.length
        ? topLabels[0].y - label.height - spacing
        : element.y - label.height - spacing * 2,
    }),
  );
  const secondLevelTopLabels = secondTopResult.labels;

  const secondLeftResult = await createLabelsForRow(
    leftRow,
    labels.secondLeft,
    element,
    spacing,
    fontSize,
    (node, label) => ({
      x: element.x - (leftWidth + label.width + spacing * 2),
      y: element.y + node.y + node.height / 2 - label.height / 2,
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
    processLabelGroups(secondLevelLeftLabels, (label) => {
      const src = sourceByLabel.get(label);
      return src ? extractVariantValue(src, labels.left) : "";
    });
  }
  if (labels.groupSecondTop) {
    const sourceByLabel = new Map(
      secondTopResult.labels.map((l, i) => [l, secondTopResult.sources[i]]),
    );
    processLabelGroups(secondLevelTopLabels, (label) => {
      const src = sourceByLabel.get(label);
      return src ? extractVariantValue(src, labels.top) : "";
    });
  }
}
