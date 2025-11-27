/// <reference types="@figma/plugin-typings" />

import { ElementRows } from "../types";

/**
 * Gets the top and left elements from a collection of scene nodes
 * Identifies the leftmost and topmost elements and returns all elements in the same row/column
 *
 * @param nodes The collection of scene nodes to analyze
 * @returns Object containing arrays of nodes in the left and top rows
 */
export function getTopAndLeftElements(
  nodes: readonly SceneNode[],
): ElementRows {
  if (!nodes.length) {
    return { leftRow: [], topRow: [] };
  }

  // Find the leftmost and topmost elements
  const leftmost = nodes.reduce((prev, curr) =>
    prev.x < curr.x ? prev : curr,
  );

  const topmost = nodes.reduce((prev, curr) => (prev.y < curr.y ? prev : curr));

  // Get all elements in the same vertical column as the leftmost element
  const leftRow = nodes.filter(
    (node) => node.x >= leftmost.x && node.x <= leftmost.x + leftmost.width,
  );

  // Get all elements in the same horizontal row as the topmost element
  const topRow = nodes.filter(
    (node) => node.y >= topmost.y && node.y <= topmost.y + topmost.height,
  );

  return { leftRow, topRow };
}
