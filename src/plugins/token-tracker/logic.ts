/// <reference types="@figma/plugin-typings" />

import {
  findNodesWithBoundVariable,
  getVariableUsageSummary,
} from "./utils/findBoundVariables";
import { createResultTable, loadInterFont } from "./utils/createResultTable";
import { debugLog } from "@shared/logging";
import {
  ColorVariable,
  VariableCollection,
  Page,
  RGBA,
  GetCollectionsPayload,
  GetPagesPayload,
  GetColorVariablesPayload,
  FindBoundNodesPayload,
  CancelSearchPayload,
  VariableResult,
} from "./types";

// Search cancellation flag
let searchCancelled = false;

// Collection cache
const collectionCache = new Map<
  string,
  { defaultModeId: string; modes: { id: string; name: string }[] }
>();

/**
 * Helper function to resolve variable alias
 */
function resolveVariableValue(
  value: any,
  modeId: string,
  depth: number = 0
): RGBA | string {
  if (depth > 10) {
    return "Circular reference";
  }

  if (typeof value === "object" && value !== null && "r" in value) {
    return value as RGBA;
  } else if (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  ) {
    try {
      const referencedVariable = figma.variables.getVariableById(value.id);
      if (referencedVariable && referencedVariable.resolvedType === "COLOR") {
        let referencedValue = referencedVariable.valuesByMode[modeId];

        if (!referencedValue) {
          const collection = figma.variables.getVariableCollectionById(
            referencedVariable.variableCollectionId
          );
          if (collection) {
            const defaultModeId = collection.defaultModeId;
            referencedValue = referencedVariable.valuesByMode[defaultModeId];
          }
        }

        if (
          typeof referencedValue === "object" &&
          referencedValue !== null &&
          "r" in referencedValue
        ) {
          return referencedValue as RGBA;
        } else if (
          typeof referencedValue === "object" &&
          referencedValue !== null &&
          "type" in referencedValue &&
          referencedValue.type === "VARIABLE_ALIAS"
        ) {
          return resolveVariableValue(referencedValue, modeId, depth + 1);
        } else {
          return `→ ${referencedVariable.name}`;
        }
      }
    } catch (error) {
      console.error("Error resolving variable alias:", error);
    }
  }
  return "Unresolved";
}

/**
 * Token Tracker handler - processes messages from the UI
 */
export async function tokenTrackerHandler(
  action: string,
  payload: any,
  figma: any
): Promise<any> {
  debugLog(`📥 Token Tracker: ${action}`, payload);

  switch (action) {
    case "get-collections":
      const collections = handleGetCollections(payload);
      figma.ui.postMessage({
        type: "collections-result",
        collections,
      });
      return collections;

    case "get-pages":
      const pagesResult = handleGetPages(payload);
      figma.ui.postMessage({
        type: "pages-result",
        pages: pagesResult.pages,
        currentPageId: pagesResult.currentPageId,
      });
      return pagesResult;

    case "get-color-variables":
      const variables = handleGetColorVariables(payload);
      debugLog(
        "📤 Token Tracker sending variables-result:",
        variables?.length || 0,
        "variables"
      );
      figma.ui.postMessage({
        type: "variables-result",
        variables,
      });
      return variables;

    case "find-bound-nodes":
      return await handleFindBoundNodes(payload);

    case "cancel-search":
      handleCancelSearch(payload);
      return null;

    default:
      console.warn(`Unknown action: ${action}`);
      return null;
  }
}

/**
 * Get all variable collections
 */
function handleGetCollections(
  payload: GetCollectionsPayload
): VariableCollection[] {
  try {
    const localCollections = figma.variables.getLocalVariableCollections();
    const collections: VariableCollection[] = localCollections.map(
      (collection) => ({
        id: collection.id,
        name: collection.name,
      })
    );
    return collections;
  } catch (error) {
    console.error("Error fetching collections:", error);
    return [];
  }
}

/**
 * Get all pages
 */
function handleGetPages(payload: GetPagesPayload): {
  pages: Page[];
  currentPageId: string | null;
} {
  try {
    const allPages = figma.root.children;
    const pages: Page[] = allPages.map((page) => ({
      id: page.id,
      name: page.name,
    }));
    return { pages, currentPageId: figma.currentPage.id };
  } catch (error) {
    console.error("Error fetching pages:", error);
    return { pages: [], currentPageId: null };
  }
}

/**
 * Get color variables from selected collection
 */
function handleGetColorVariables(
  payload: GetColorVariablesPayload
): ColorVariable[] {
  const { collectionId } = payload;
  debugLog("🔍 Getting color variables for collection:", collectionId);
  try {
    const colorVariables: ColorVariable[] = [];
    const processedVariableIds = new Set<string>();

    // Process local variables
    const localVariables = figma.variables.getLocalVariables();
    debugLog("📊 Found", localVariables.length, "local variables");
    for (const variable of localVariables) {
      if (
        variable.resolvedType === "COLOR" &&
        !processedVariableIds.has(variable.id)
      ) {
        if (collectionId && variable.variableCollectionId !== collectionId) {
          continue;
        }

        // Get collection info for modes
        let collectionInfo = collectionCache.get(variable.variableCollectionId);
        if (!collectionInfo) {
          const collection = figma.variables.getVariableCollectionById(
            variable.variableCollectionId
          );
          if (collection) {
            collectionInfo = {
              defaultModeId: collection.defaultModeId,
              modes: collection.modes.map((mode) => ({
                id: mode.modeId,
                name: mode.name,
              })),
            };
            collectionCache.set(variable.variableCollectionId, collectionInfo);
          }
        }

        const colorVar: ColorVariable = {
          id: variable.id,
          name: variable.name,
          resolvedType: variable.resolvedType,
          valuesByMode: {},
          defaultModeId:
            collectionInfo?.defaultModeId ||
            Object.keys(variable.valuesByMode)[0] ||
            "",
          modes: collectionInfo?.modes || [],
          description: variable.description || "",
          isLocal: true,
        };

        // Get values for each mode
        for (const modeId of Object.keys(variable.valuesByMode)) {
          const value = variable.valuesByMode[modeId];
          colorVar.valuesByMode[modeId] = resolveVariableValue(value, modeId);
        }

        colorVariables.push(colorVar);
        processedVariableIds.add(variable.id);
      }
    }

    debugLog("✅ Found", colorVariables.length, "color variables");
    return colorVariables;
  } catch (error) {
    console.error("Error fetching color variables:", error);
    return [];
  }
}

/**
 * Find bound nodes for selected variables
 */
async function handleFindBoundNodes(
  payload: FindBoundNodesPayload
): Promise<void> {
  try {
    const { variableIds, pageId } = payload;
    searchCancelled = false; // Reset cancellation flag

    debugLog(
      `🔍 Finding bound nodes for ${variableIds.length} selected variables${
        pageId
          ? ` on page ${figma.getNodeById(pageId)?.name || pageId}`
          : " on all pages"
      }...`
    );

    // Load fonts with better error handling
    try {
      await loadInterFont();
    } catch (fontError) {
      console.warn("Font loading failed, continuing with defaults:", fontError);
    }

    const results: VariableResult[] = [];

    for (let i = 0; i < variableIds.length; i++) {
      const variableId = variableIds[i];
      if (searchCancelled) {
        debugLog("🛑 Search cancelled by user");
        break;
      }

      try {
        const variable = figma.variables.getVariableById(variableId);
        if (variable) {
          // Pass callbacks for progress and streaming
          const boundNodes = await findNodesWithBoundVariable(
            variable,
            true, // instancesOnly
            pageId,
            {
              onProgress: (current, total, nodesFound) => {
                // Send progress update to UI
                figma.ui.postMessage({
                  type: "search-progress",
                  progress: {
                    current,
                    total,
                    percentage: Math.round((current / total) * 100),
                    nodesFound,
                    currentVariableName: variable.name,
                    currentVariableIndex: i + 1,
                    totalVariables: variableIds.length,
                  },
                });
              },
              onStreamingResult: (result) => {
                // Send streaming result to UI
                figma.ui.postMessage({
                  type: "streaming-result",
                  result,
                });
              },
              shouldCancel: () => searchCancelled,
            }
          );

          const summary = await getVariableUsageSummary(variable, true, pageId);

          results.push({
            variable,
            boundNodes,
            summary,
            instancesOnly: true,
          });
        } else {
          debugLog(`❌ Variable with ID ${variableId} not found`);
        }
      } catch (error) {
        console.error(`❌ Error processing variable ${variableId}:`, error);
      }
    }

    // Create visual table if we have results
    if (results.length > 0) {
      try {
        debugLog(`🎨 Creating result table for ${results.length} variables...`);
        const resultTable = createResultTable(results);
        debugLog(
          `📊 Successfully created visual result table with ${results.reduce(
            (total, r) => total + r.boundNodes.length,
            0
          )} total bound nodes across ${results.length} variables`
        );
      } catch (tableError) {
        console.error("❌ Error creating result table:", tableError);
        // Fallback to console output
        debugLog("📋 Falling back to console output:");
        results.forEach((result, index) => {
          debugLog(
            `${index + 1}. Variable: ${result.variable.name} - ${
              result.boundNodes.length
            } nodes found`
          );
        });
      }
    } else {
      debugLog(`⚠️ No results to display`);
    }
  } catch (error) {
    console.error("❌ Error finding bound nodes:", error);
    throw error;
  } finally {
    // Send completion message to UI
    figma.ui.postMessage({
      type: "search-complete",
    });
  }
}

/**
 * Cancel ongoing search
 */
function handleCancelSearch(payload: CancelSearchPayload): void {
  debugLog("🛑 Cancellation requested by user");
  searchCancelled = true;
}
