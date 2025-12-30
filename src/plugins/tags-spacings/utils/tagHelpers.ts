/// <reference types="@figma/plugin-typings" />

import { IndexingScheme } from "../types";
import {
  INDEX_SCHEMES,
  NUMERIC_INDEXES,
  ALPHABETIC_LOWERCASE,
} from "./constants";

/**
 * Generate index string for a given position
 * Handles multi-character indexes for large sets
 */
export function generateIndexForPosition(
  position: number,
  indexScheme: string,
): string {
  // Handle numeric schemes separately
  if (indexScheme === NUMERIC_INDEXES) {
    return String(position + 1); // Return numbers starting from 1
  }

  const schemeLength = indexScheme.length;

  if (position < schemeLength) {
    // Single character index
    return indexScheme[position];
  } else {
    // Multi-character index for positions beyond single character limit
    const firstChar = Math.floor(position / schemeLength);
    const secondChar = position % schemeLength;

    if (firstChar < schemeLength) {
      // Two character combination (e.g., "aa", "ab", "ac"...)
      return indexScheme[firstChar] + indexScheme[secondChar];
    } else {
      // Three character combination for very large numbers
      const thirdCharIndex = Math.floor(firstChar / schemeLength);
      const secondCharIndex = firstChar % schemeLength;
      return (
        indexScheme[thirdCharIndex] +
        indexScheme[secondCharIndex] +
        indexScheme[secondChar]
      );
    }
  }
}

/**
 * Generate array of indexes for a given count
 */
export function generateIndexArray(
  count: number,
  startChar: string,
  indexScheme: string,
): string[] {
  const indexes: string[] = [];

  // For numeric schemes, start from 1
  if (indexScheme === NUMERIC_INDEXES) {
    const startNum = parseInt(startChar) || 1;
    for (let i = 0; i < count; i++) {
      indexes.push(String(startNum + i));
    }
    return indexes;
  }

  // For non-numeric schemes, find start position
  const startIndex = Math.max(0, indexScheme.indexOf(startChar.toLowerCase()));

  for (let i = 0; i < count; i++) {
    const position = startIndex + i;
    indexes.push(generateIndexForPosition(position, indexScheme));
  }

  return indexes;
}

/**
 * Generate smart indexes based on element count and preferences
 */
export function generateSmartIndexes(
  elementCount: number,
  scheme: IndexingScheme,
  startChar: string = "a",
): string[] {
  let selectedScheme = INDEX_SCHEMES[scheme] || ALPHABETIC_LOWERCASE;

  // Remove potentially ambiguous characters for clarity
  if (scheme !== "numeric" && scheme !== "circled" && scheme !== "geometric") {
    selectedScheme = selectedScheme
      .replace(/[0oO]/g, "") // Remove 0, o, O that can be confusing
      .replace(/[1lI]/g, ""); // Remove 1, l, I that can be confusing
  }

  return generateIndexArray(elementCount, startChar, selectedScheme);
}

/**
 * Set text properties on an instance using component properties
 * The property name is matched by prefix (e.g., "label" matches "label#123:456")
 */
export function setTextProps(
  instance: InstanceNode,
  propertyNamePrefix: string,
  value: string,
): void {
  try {
    const props = instance.componentProperties;
    for (const property in props) {
      if (property.startsWith(propertyNamePrefix)) {
        const newProps: Record<string, string> = {};
        newProps[property] = value;
        instance.setProperties(newProps);
        return;
      }
    }
  } catch (error) {
    console.warn(`Could not set text property ${propertyNamePrefix}:`, error);
  }
}

/**
 * Set variant properties on an instance
 */
export function setVariantProps(
  instance: InstanceNode,
  propertyName: string,
  value: string,
): void {
  try {
    const props = instance.componentProperties;
    if (props && propertyName in props) {
      instance.setProperties({ [propertyName]: value });
    }
  } catch (error) {
    console.warn(`Could not set variant property ${propertyName}:`, error);
  }
}

/**
 * Add a hyperlink to a text node within a component
 */
export function addLink(component: SceneNode, link: string): void {
  if (!("findOne" in component)) return;

  const linkText = component.findOne(
    (node) => node.name === "link" && node.type === "TEXT",
  ) as TextNode | null;

  if (linkText) {
    linkText.hyperlink = { type: "NODE", value: link };
  }
}
