/// <reference types="@figma/plugin-typings" />

import { VariableResult } from "../types";
import { debugLog } from "@shared/logging";

/**
 * Loads the Inter font (required for text creation)
 */
let fontsLoaded = false;

export async function loadInterFont() {
  if (fontsLoaded) {
    return;
  }

  try {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    fontsLoaded = true;
    debugLog("✅ Fonts loaded successfully");
  } catch (error) {
    console.warn("Could not load Inter font, trying fallback fonts");
    try {
      await figma.loadFontAsync({ family: "Roboto", style: "Regular" });
      await figma.loadFontAsync({ family: "Roboto", style: "Medium" });
      await figma.loadFontAsync({ family: "Roboto", style: "Bold" });
      fontsLoaded = true;
      debugLog("✅ Fallback fonts (Roboto) loaded successfully");
    } catch (fallbackError) {
      console.warn("Could not load fallback fonts either, using defaults");
      fontsLoaded = true;
    }
  }
}

/**
 * Gets the appropriate font family and style, with fallbacks
 */
function getFontName(style: "Regular" | "Medium" | "Bold"): FontName {
  try {
    return { family: "Inter", style };
  } catch {
    try {
      return { family: "Roboto", style };
    } catch {
      return { family: "Arial", style };
    }
  }
}

/**
 * Converts RGB color to hex string
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Converts technical property paths to user-friendly names
 */
function getFriendlyPropertyName(propertyPath: string): string {
  const friendlyNames: Record<string, string> = {
    "fills[0].color": "Fill",
    "strokes[0].color": "Stroke",
    "effects[0].color": "Effect Color",
    "effects[0].radius": "Effect Radius",
    cornerRadius: "Corner Radius",
    paddingTop: "Padding Top",
    paddingBottom: "Padding Bottom",
    paddingLeft: "Padding Left",
    paddingRight: "Padding Right",
    itemSpacing: "Item Spacing",
  };

  if (friendlyNames[propertyPath]) {
    return friendlyNames[propertyPath];
  }

  // Handle array indices patterns like "fills[1].color" -> "Fill 2"
  const arrayPattern = /^(\w+)\[(\d+)\]\.(.+)$/;
  const arrayMatch = propertyPath.match(arrayPattern);
  if (arrayMatch) {
    const [, property, index, subProperty] = arrayMatch;
    const baseName = friendlyNames[`${property}[0].${subProperty}`] || property;
    return `${baseName} ${parseInt(index) + 1}`;
  }

  // Handle simple property names
  const simplePattern = /^(\w+)$/;
  const simpleMatch = propertyPath.match(simplePattern);
  if (simpleMatch) {
    const property = simpleMatch[1];
    return property
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  }

  return propertyPath;
}

/**
 * Resolves variable alias to get actual color
 */
function resolveVariableAlias(
  variableId: string,
  modeId: string,
  depth: number = 0,
): { r: number; g: number; b: number; a: number } | null {
  if (depth > 10) {
    console.warn("Maximum alias resolution depth reached");
    return null;
  }

  try {
    const aliasedVariable = figma.variables.getVariableById(variableId);
    if (!aliasedVariable) return null;

    let aliasedValue = aliasedVariable.valuesByMode[modeId];

    if (!aliasedValue) {
      const collection = figma.variables.getVariableCollectionById(
        aliasedVariable.variableCollectionId,
      );
      if (collection) {
        const defaultModeId = collection.defaultModeId;
        aliasedValue = aliasedVariable.valuesByMode[defaultModeId];
      }
    }

    if (aliasedValue && typeof aliasedValue === "object") {
      if ("r" in aliasedValue) {
        return aliasedValue as { r: number; g: number; b: number; a: number };
      } else if (
        "type" in aliasedValue &&
        aliasedValue.type === "VARIABLE_ALIAS"
      ) {
        return resolveVariableAlias(aliasedValue.id, modeId, depth + 1);
      }
    }
  } catch (error) {
    console.warn(`Failed to resolve variable alias:`, error);
  }

  return null;
}

/**
 * Gets all color values from a variable (all modes)
 */
function getVariableColors(variable: Variable): Array<{
  modeId: string;
  modeName: string;
  color: { r: number; g: number; b: number };
}> {
  const colors: Array<{
    modeId: string;
    modeName: string;
    color: { r: number; g: number; b: number };
  }> = [];

  const collection = figma.variables.getVariableCollectionById(
    variable.variableCollectionId,
  );

  if (collection) {
    for (const mode of collection.modes) {
      const modeValue = variable.valuesByMode[mode.modeId];

      let resolvedColor: { r: number; g: number; b: number; a: number } | null =
        null;

      if (typeof modeValue === "object" && modeValue !== null) {
        if ("r" in modeValue) {
          resolvedColor = modeValue as {
            r: number;
            g: number;
            b: number;
            a: number;
          };
        } else if ("type" in modeValue && modeValue.type === "VARIABLE_ALIAS") {
          resolvedColor = resolveVariableAlias(modeValue.id, mode.modeId);
        }
      }

      if (resolvedColor) {
        colors.push({
          modeId: mode.modeId,
          modeName: mode.name,
          color: { r: resolvedColor.r, g: resolvedColor.g, b: resolvedColor.b },
        });
      }
    }
  }

  if (colors.length === 0) {
    colors.push({
      modeId: "default",
      modeName: "Default",
      color: { r: 0.5, g: 0.5, b: 0.5 },
    });
  }

  return colors;
}

/**
 * Creates a visual table-like representation of variable usage results
 */
export function createResultTable(results: VariableResult[]): FrameNode {
  debugLog(`🎨 Creating result table for ${results.length} variables...`);

  try {
    const tableContainer = figma.createFrame();
    tableContainer.name = `Variable_Usage_Results`;
    tableContainer.layoutMode = "VERTICAL";
    tableContainer.primaryAxisSizingMode = "AUTO";
    tableContainer.counterAxisSizingMode = "AUTO";
    tableContainer.paddingTop = 20;
    tableContainer.paddingBottom = 20;
    tableContainer.paddingLeft = 20;
    tableContainer.paddingRight = 20;
    tableContainer.itemSpacing = 16;
    tableContainer.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    tableContainer.cornerRadius = 8;
    tableContainer.strokes = [
      { type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } },
    ];
    tableContainer.strokeWeight = 1;

    figma.currentPage.appendChild(tableContainer);

    results.forEach((result, idx) => {
      const variableCard = createVariableCard(result, idx + 1);
      tableContainer.appendChild(variableCard);
    });

    debugLog(`✅ Successfully created table with ${results.length} variables`);

    tableContainer.x = 100;
    tableContainer.y = 100;

    figma.viewport.scrollAndZoomIntoView([tableContainer]);
    figma.currentPage.selection = [tableContainer];

    return tableContainer;
  } catch (error) {
    console.error("❌ Failed to create result table:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create result table: ${errorMessage}`);
  }
}

/**
 * Creates a card for a single variable and its usage
 */
function createVariableCard(result: VariableResult, index: number): FrameNode {
  const card = figma.createFrame();
  card.name = `Variable_${index}_${result.variable.name}`;
  card.layoutMode = "VERTICAL";
  card.primaryAxisSizingMode = "AUTO";
  card.counterAxisSizingMode = "FIXED";
  card.resize(800, 100);
  card.paddingTop = 16;
  card.paddingBottom = 16;
  card.paddingLeft = 16;
  card.paddingRight = 16;
  card.itemSpacing = 12;
  card.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }];
  card.cornerRadius = 8;
  card.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
  card.strokeWeight = 1;

  // Header with variable name
  const header = figma.createText();
  header.characters = `${result.variable.name} (${result.boundNodes.length} uses)`;
  header.fontSize = 16;
  header.fontName = getFontName("Bold");
  header.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
  card.appendChild(header);

  // Color samples
  const colorFrame = createColorSamples(result.variable);
  card.appendChild(colorFrame);

  // Bound nodes list
  if (result.boundNodes.length > 0) {
    const nodesFrame = createNodesList(result.boundNodes);
    card.appendChild(nodesFrame);
  }

  return card;
}

/**
 * Creates color samples section
 */
function createColorSamples(variable: Variable): FrameNode {
  const container = figma.createFrame();
  container.name = "ColorSamples";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 8;
  container.fills = [];

  const variableColors = getVariableColors(variable);

  variableColors.forEach((modeColor) => {
    const swatch = figma.createFrame();
    swatch.name = `Swatch_${modeColor.modeName}`;
    swatch.layoutMode = "VERTICAL";
    swatch.primaryAxisSizingMode = "AUTO";
    swatch.counterAxisSizingMode = "AUTO";
    swatch.itemSpacing = 4;
    swatch.fills = [];

    // Color rectangle
    const colorRect = figma.createRectangle();
    colorRect.resize(60, 30);
    colorRect.cornerRadius = 4;
    colorRect.fills = [{ type: "SOLID", color: modeColor.color }];
    colorRect.strokes = [
      { type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } },
    ];
    colorRect.strokeWeight = 1;
    swatch.appendChild(colorRect);

    // Hex value
    const hexText = figma.createText();
    hexText.characters = rgbToHex(
      modeColor.color.r,
      modeColor.color.g,
      modeColor.color.b,
    );
    hexText.fontSize = 10;
    hexText.fontName = getFontName("Regular");
    hexText.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
    swatch.appendChild(hexText);

    container.appendChild(swatch);
  });

  return container;
}

/**
 * Creates a list of bound nodes
 */
function createNodesList(boundNodes: VariableResult["boundNodes"]): FrameNode {
  const container = figma.createFrame();
  container.name = "BoundNodes";
  container.layoutMode = "VERTICAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 6;
  container.fills = [];

  // Show max 10 nodes
  const nodesToShow = boundNodes.slice(0, 10);

  nodesToShow.forEach((nodeInfo, index) => {
    try {
      const nodeItem = figma.createFrame();
      nodeItem.name = `Node_${index + 1}`;
      nodeItem.layoutMode = "VERTICAL";
      nodeItem.primaryAxisSizingMode = "AUTO";
      nodeItem.counterAxisSizingMode = "AUTO";
      nodeItem.paddingTop = 8;
      nodeItem.paddingBottom = 8;
      nodeItem.paddingLeft = 12;
      nodeItem.paddingRight = 12;
      nodeItem.itemSpacing = 4;
      nodeItem.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.98, b: 1 } }];
      nodeItem.cornerRadius = 4;

      // Node name with link
      const nameText = figma.createText();
      nameText.characters = `${nodeInfo.node.name} [${nodeInfo.pageName}]`;
      nameText.fontSize = 12;
      nameText.fontName = getFontName("Medium");
      nameText.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.4, b: 0.8 } }];

      // Try to set hyperlink
      try {
        const hyperlink: HyperlinkTarget = {
          type: "NODE",
          value: nodeInfo.node.id,
        };
        nameText.setRangeHyperlink(0, nameText.characters.length, hyperlink);
      } catch (linkError) {
        console.warn("Could not set hyperlink:", linkError);
      }

      nodeItem.appendChild(nameText);

      // Properties
      const propsText = figma.createText();
      const friendlyProps = nodeInfo.boundProperties.map((p) =>
        getFriendlyPropertyName(p),
      );
      propsText.characters = `Properties: ${friendlyProps.join(", ")}`;
      propsText.fontSize = 10;
      propsText.fontName = getFontName("Regular");
      propsText.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
      nodeItem.appendChild(propsText);

      container.appendChild(nodeItem);
    } catch (error) {
      console.error(`Failed to create node item:`, error);
    }
  });

  // Show "more" indicator if needed
  if (boundNodes.length > 10) {
    const moreText = figma.createText();
    moreText.characters = `... and ${boundNodes.length - 10} more`;
    moreText.fontSize = 11;
    moreText.fontName = getFontName("Regular");
    moreText.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
    container.appendChild(moreText);
  }

  return container;
}

export function resetFonts() {
  fontsLoaded = false;
}
