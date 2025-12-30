/// <reference types="@figma/plugin-typings" />

import { SpacingUnits } from "../types";

/**
 * Set text content on a marker using component properties
 * The property name is matched by prefix (e.g., "text" matches "text#123:456")
 */
function setMarkerTextProp(
  marker: InstanceNode,
  propertyNamePrefix: string,
  value: string,
): void {
  try {
    const props = marker.componentProperties;
    for (const property in props) {
      if (property.startsWith(propertyNamePrefix)) {
        const newProps: Record<string, string> = {};
        newProps[property] = value;
        marker.setProperties(newProps);
        return;
      }
    }
  } catch (error) {
    console.warn(`Could not set marker property ${propertyNamePrefix}:`, error);
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
      return `${(size / rootSize).toFixed(3)}rem`;
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
 * Uses component properties like the original plugin
 */
export function setMarkerSizeProps(
  rootSize: number,
  size: number,
  marker: InstanceNode,
  units: SpacingUnits,
): void {
  const formattedValue = formatSizeValue(size, units, rootSize);

  // Set via component property - original uses "text" prefix
  setMarkerTextProp(marker, "text", formattedValue);
}

/**
 * Get the marker hand/stem length for positioning calculations
 * In the original, it's marker.children[1].width
 */
export function getMarkerHandLength(marker: InstanceNode): number {
  // Try to get the hand element at index 1 (original plugin pattern)
  if (marker.children && marker.children.length > 1) {
    const hand = marker.children[1];
    if ("width" in hand) {
      return hand.width;
    }
  }

  // Fallback: try to find by name
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

/**
 * Get marker shift for proper sizing
 * This calculates the additional width needed based on the text width
 * Must be called AFTER setMarkerSizeProps to get accurate text width
 */
export function getMarkerShift(marker: InstanceNode): number {
  // Get the hand width from children[1]
  let markerHandWidth = 40;
  if (marker.children && marker.children.length > 1) {
    const hand = marker.children[1];
    if ("width" in hand) {
      markerHandWidth = hand.width;
    }
  }

  // Find the text node to get its width
  const markerText = marker.findOne(
    (node) => node.type === "TEXT",
  ) as TextNode | null;
  if (markerText) {
    const difference = 16 - markerText.width;
    return markerHandWidth + 20 - difference;
  }

  return markerHandWidth + 20;
}
