/// <reference types="@figma/plugin-typings" />

import { UtilityResult } from "../types";
import { keyboardsMap } from "./keyboardsMap";

/**
 * Creates a scrambled "misprint" string from the component name
 * using Hebrew keyboard mapping
 */
function createMisprintText(name: string): string {
  const scrambled = name
    .split("")
    .map((char) => keyboardsMap[char] ?? char)
    .join("");

  return `---------------------------------------------------- misprint: ${scrambled}`;
}

/**
 * Adds misprint text to a component or component set description
 */
function addMisprintToDescription(
  element: ComponentNode | ComponentSetNode,
): void {
  const misprint = createMisprintText(element.name);
  const descriptionLines = element.description?.split("\n") ?? [];

  // Check if misprint line already exists and update it
  const misprintIndex = descriptionLines.findIndex((line) =>
    line.startsWith("----------------------------------------------------"),
  );

  if (misprintIndex >= 0) {
    descriptionLines.splice(misprintIndex, 1, misprint);
  } else {
    descriptionLines.push(misprint);
  }

  element.description = descriptionLines.join("\n");
}

/**
 * Main handler for the Misprint utility.
 * Adds scrambled Hebrew text to component descriptions for searchability.
 */
export async function runMisprint(): Promise<UtilityResult> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      success: false,
      message: "Please select at least one component or component set.",
    };
  }

  // Filter selection for components and component sets
  const validElements = selection.filter(
    (node): node is ComponentNode | ComponentSetNode =>
      node.type === "COMPONENT" || node.type === "COMPONENT_SET",
  );

  if (validElements.length === 0) {
    return {
      success: false,
      message:
        "No components or component sets selected. Please select components to add misprint to.",
    };
  }

  // Apply misprint to each valid element
  for (const element of validElements) {
    try {
      addMisprintToDescription(element);
    } catch (error) {
      console.error("Error adding misprint:", error);
    }
  }

  return {
    success: true,
    message: `Added misprint to ${validElements.length} component${validElements.length === 1 ? "" : "s"}.`,
    count: validElements.length,
  };
}
