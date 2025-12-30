/// <reference types="@figma/plugin-typings" />

import { SpacingUnits } from "../types";

/**
 * Set text content on a marker's label
 */
function setMarkerText(
  marker: InstanceNode,
  textNodeName: string,
  value: string,
): void {
  const textNode = marker.findOne(
    (node) => node.type === "TEXT" && node.name === textNodeName,
  ) as TextNode | null;

  if (textNode) {
    textNode.characters = value;
  }
}

/**
 * Format a size value based on units
 */
export function formatSizeValue(
  size: number,
  units: SpacingUnits,
  rootSize: number = 16,
): string {
  switch (units) {
    case "px":
      return `${Math.round(size)}px`;
    case "rem":
      return `${(size / rootSize).toFixed(2)}rem`;
    case "percent":
      return `${Math.round(size)}%`;
    case "var":
      return `var(--spacing-${Math.round(size)})`;
    default:
      return `${Math.round(size)}px`;
  }
}

/**
 * Set marker size properties (text label with formatted value)
 */
export function setMarkerSizeProps(
  rootSize: number,
  size: number,
  marker: InstanceNode,
  units: SpacingUnits,
): void {
  const formattedValue = formatSizeValue(size, units, rootSize);

  // Try common text node names used in markers
  const textNodeNames = ["label", "size", "value", "Text"];

  for (const name of textNodeNames) {
    const textNode = marker.findOne(
      (node) => node.type === "TEXT" && node.name === name,
    ) as TextNode | null;

    if (textNode) {
      textNode.characters = formattedValue;
      return;
    }
  }

  // Fallback: find any text node
  const anyTextNode = marker.findOne(
    (node) => node.type === "TEXT",
  ) as TextNode | null;

  if (anyTextNode) {
    anyTextNode.characters = formattedValue;
  }
}

/**
 * Get the marker hand/stem length for positioning calculations
 */
export function getMarkerHandLength(marker: InstanceNode): number {
  // Try to find the hand/stem element
  const hand = marker.findOne(
    (node) =>
      node.name === "hand" || node.name === "stem" || node.name === "line",
  );

  if (hand && "width" in hand) {
    return Math.max(hand.width, hand.height);
  }

  // Default fallback
  return 40;
}
