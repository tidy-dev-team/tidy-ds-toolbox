/// <reference types="@figma/plugin-typings" />

import { ElementCoordinates } from "../types";

/**
 * Check if a node is an icon (instance with single vector child named "ic")
 */
function isIcon(node: SceneNode): boolean {
  return (
    node.type === "INSTANCE" &&
    node.children.length === 1 &&
    node.children[0].name === "ic" &&
    node.children[0].type === "VECTOR"
  );
}

/**
 * Check if a node is a "hack" element (invisible spacer, etc.)
 * These are typically used for layout tricks and should be ignored
 * Matches original plugin logic
 */
function isHackElement(node: SceneNode): boolean {
  // Check for very small elements with no fills or strokes (layout spacers)
  const hasFills =
    "fills" in node && Array.isArray(node.fills) && node.fills.length > 0;
  const hasStrokes =
    "strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0;
  const isTiny = node.height < 0.01 || node.width < 0.01;

  if (!hasFills && !hasStrokes && isTiny) {
    return true;
  }

  // Check for min/max size helper elements
  const nameLower = node.name.toLowerCase();
  if (nameLower.includes("min") && nameLower.includes("size")) {
    return true;
  }

  return false;
}

/**
 * Find the documentation frame for a component (if it exists)
 */
function findDocFrame(node: SceneNode): FrameNode | null {
  // Look for a parent frame that might contain documentation
  let current: BaseNode | null = node.parent;

  while (current) {
    if (current.type === "FRAME" && current.name.includes("documentation")) {
      return current;
    }
    current = current.parent;
  }

  return null;
}

/**
 * Get the text style name for a text node
 */
function findFontStyleName(textNode: TextNode): string {
  if (!textNode.textStyleId || textNode.textStyleId === "") {
    return "🎨 style not determined";
  }

  // Handle mixed styles
  if (textNode.textStyleId === figma.mixed) {
    return "🎨 mixed styles";
  }

  const foundStyle = figma.getStyleById(textNode.textStyleId as string);
  if (!foundStyle) {
    return "🎨 style not found";
  }

  if (foundStyle.remote === false) {
    return foundStyle.name;
  }

  return foundStyle.name + " (MISSING LIBRARY)";
}

/**
 * Add instance data to the coordinates array
 */
function addInstanceToArray(
  node: InstanceNode,
  array: ElementCoordinates[],
): void {
  if (!node.absoluteBoundingBox || !node.absoluteRenderBounds) return;

  const docFrame = findDocFrame(node);
  const linkTarget = docFrame ? docFrame.id : (node.mainComponent?.id ?? null);

  array.push([
    node.absoluteBoundingBox.x,
    node.absoluteBoundingBox.y,
    node.absoluteRenderBounds.width,
    node.absoluteRenderBounds.height,
    isIcon(node) ? "Icon" : node.name,
    linkTarget,
  ]);
}

/**
 * Add text node data to the coordinates array
 */
function addTextNodeToArray(node: TextNode, array: ElementCoordinates[]): void {
  if (!node.absoluteBoundingBox || !node.absoluteRenderBounds) return;

  // Skip if font is mixed
  if (node.fontName === figma.mixed || node.fontSize === figma.mixed) {
    array.push([
      node.absoluteBoundingBox.x,
      node.absoluteBoundingBox.y,
      node.absoluteRenderBounds.width,
      node.height,
      node.name,
      null,
      "mixed styles",
    ]);
    return;
  }

  const styleName = findFontStyleName(node);

  array.push([
    node.absoluteBoundingBox.x,
    node.absoluteBoundingBox.y,
    node.absoluteRenderBounds.width,
    node.height,
    node.name,
    null,
    styleName,
    node.fontName,
    node.fontSize,
  ]);
}

/**
 * Recursively find all taggable nodes (instances and text) in a container
 * Matches original plugin behavior:
 * - Instances are treated as atomic (not traversed into)
 * - Text nodes are found recursively inside non-instance children
 * - Elements starting with "_" are skipped
 */
export function findAllTaggableNodes(
  frame: FrameNode | ComponentNode | InstanceNode | GroupNode,
  includeInstances: boolean,
  includeText: boolean,
): ElementCoordinates[] {
  const elements: ElementCoordinates[] = [];

  // Enable optimization to skip invisible instance children
  figma.skipInvisibleInstanceChildren = true;

  function traverse(node: SceneNode): void {
    // Skip nodes without bounds or very small nodes
    if (!node.absoluteBoundingBox || node.width < 0.01) return;

    // Skip hack elements
    if (isHackElement(node)) return;

    // Skip elements starting with "_" (private/internal elements)
    if (node.name.startsWith("_")) return;

    if (node.type === "INSTANCE" && includeInstances) {
      addInstanceToArray(node, elements);
      // Don't recurse into instances - treat them as atomic
      return;
    }

    if (node.type === "TEXT" && includeText) {
      addTextNodeToArray(node, elements);
      return;
    }

    // Recurse into children for non-instance containers to find text
    if ("children" in node && node.type !== "INSTANCE") {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  // Start traversal from frame's children
  for (const child of frame.children) {
    traverse(child);
  }

  // Sort by x position (left to right)
  elements.sort((a, b) => a[0] - b[0]);

  return elements;
}

/**
 * Research nodes for spacing calculations
 * Returns arrays of element positions on X and Y axes
 */
export function researchNodesForSpacing(
  frame: FrameNode | ComponentNode | InstanceNode | GroupNode,
  isShallow: boolean,
): {
  xPositions: Array<{ start: number; end: number; node: SceneNode }>;
  yPositions: Array<{ start: number; end: number; node: SceneNode }>;
} {
  const xPositions: Array<{ start: number; end: number; node: SceneNode }> = [];
  const yPositions: Array<{ start: number; end: number; node: SceneNode }> = [];

  const nodesToProcess = isShallow
    ? frame.children
    : (frame.findAll(() => true) as SceneNode[]);

  for (const node of nodesToProcess) {
    if (!node.absoluteBoundingBox) continue;
    if (isHackElement(node)) continue;

    const bounds = node.absoluteBoundingBox;

    xPositions.push({
      start: bounds.x,
      end: bounds.x + bounds.width,
      node,
    });

    yPositions.push({
      start: bounds.y,
      end: bounds.y + bounds.height,
      node,
    });
  }

  // Sort by start position
  xPositions.sort((a, b) => a.start - b.start);
  yPositions.sort((a, b) => a.start - b.start);

  return { xPositions, yPositions };
}
