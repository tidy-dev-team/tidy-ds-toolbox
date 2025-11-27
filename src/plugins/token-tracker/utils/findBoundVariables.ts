/// <reference types="@figma/plugin-typings" />

import { BoundNodeInfo, SearchCallbacks } from "../types";

/**
 * Recursively traverses all nodes in the document to find where a variable is used
 * @param variable - The variable to search for
 * @param instancesOnly - If true, only search within INSTANCE nodes
 * @param pageId - Optional page ID to limit search scope
 * @param callbacks - Optional callbacks for progress, streaming results, and cancellation
 * @returns Array of nodes and properties where the variable is bound
 */
export async function findNodesWithBoundVariable(
  variable: Variable,
  instancesOnly: boolean = false,
  pageId?: string | null,
  callbacks?: SearchCallbacks,
): Promise<BoundNodeInfo[]> {
  const boundNodes: BoundNodeInfo[] = [];
  const variableId = variable.id;
  const variableKey = variable.key;

  // Pre-build Set of target variable IDs for fast lookups
  const targetVariableIds = new Set<string>([variableId]);

  // Cache for variable IDs to keys - prevents repeated API calls
  const variableKeyCache = new Map<string, string>();
  variableKeyCache.set(variableId, variableKey);

  // Cache variable objects to avoid repeated getVariableById calls
  const variableCache = new Map<string, Variable>();
  variableCache.set(variableId, variable);

  // Track instance names we've already added to avoid duplicate component instances
  const processedInstanceNames = new Set<string>();

  // Progress tracking
  let nodesProcessed = 0;
  let totalNodes = 0;

  /**
   * Helper function to check if a variable alias matches our target variable
   */
  function isMatchingVariable(boundVar: VariableAlias): boolean {
    // Fast path: Check Set first (O(1) instead of string comparison)
    if (targetVariableIds.has(boundVar.id)) {
      return true;
    }

    // Check cache first
    let cachedKey = variableKeyCache.get(boundVar.id);

    if (cachedKey === undefined) {
      // Not in cache, fetch once and cache it
      try {
        // Check variable cache first to avoid API call
        let referencedVar = variableCache.get(boundVar.id);
        if (!referencedVar) {
          const fetchedVar = figma.variables.getVariableById(boundVar.id);
          if (fetchedVar) {
            referencedVar = fetchedVar;
            variableCache.set(boundVar.id, fetchedVar);
          }
        }

        if (referencedVar) {
          cachedKey = referencedVar.key;
          variableKeyCache.set(boundVar.id, cachedKey);

          // If keys match, add to targetVariableIds for even faster future lookups
          if (cachedKey === variableKey) {
            targetVariableIds.add(boundVar.id);
          }
        } else {
          // Cache null result to avoid repeated lookups
          variableKeyCache.set(boundVar.id, "");
          return false;
        }
      } catch (error) {
        // Cache failed lookup
        variableKeyCache.set(boundVar.id, "");
        return false;
      }
    }

    // Compare keys
    return cachedKey === variableKey;
  }

  /**
   * Find the top-level instance that contains this node
   */
  function findTopLevelInstance(node: SceneNode): InstanceNode | null {
    let topInstance: InstanceNode | null = null;
    let currentNode: BaseNode | null = node;

    while (currentNode && currentNode.parent) {
      if (currentNode.type === "INSTANCE") {
        topInstance = currentNode as InstanceNode;
      }
      if (currentNode.parent.type === "PAGE") {
        break;
      }
      currentNode = currentNode.parent;
    }

    return topInstance;
  }

  /**
   * Recursively check a node and its children for variable bindings
   */
  async function checkNode(node: SceneNode): Promise<boolean> {
    // Check for cancellation
    if (callbacks?.shouldCancel?.()) {
      return false; // Signal cancellation
    }

    // Update progress and yield to UI thread
    nodesProcessed++;
    if (callbacks?.onProgress && totalNodes > 0) {
      // Update every 10 nodes, or on first/last node
      if (
        nodesProcessed % 10 === 0 ||
        nodesProcessed === 1 ||
        nodesProcessed === totalNodes
      ) {
        callbacks.onProgress(
          Math.min(nodesProcessed, totalNodes),
          totalNodes,
          boundNodes.length,
        );

        // Yield to UI thread every 10 nodes to allow progress updates to render
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const boundProperties: string[] = [];

    try {
      // Skip invisible and locked nodes for performance
      if ("visible" in node && node.visible === false) {
        return true;
      }
      if ("locked" in node && node.locked === true) {
        return true;
      }

      // Check fills for variable bindings
      if ("fills" in node && node.fills && Array.isArray(node.fills)) {
        node.fills.forEach((fill, index) => {
          if (fill.type === "SOLID" && fill.boundVariables?.color) {
            if (isMatchingVariable(fill.boundVariables.color)) {
              boundProperties.push(`fills[${index}].color`);
            }
          }
        });
      }

      // Check strokes for variable bindings
      if ("strokes" in node && node.strokes && Array.isArray(node.strokes)) {
        node.strokes.forEach((stroke, index) => {
          if (stroke.type === "SOLID" && stroke.boundVariables?.color) {
            if (isMatchingVariable(stroke.boundVariables.color)) {
              boundProperties.push(`strokes[${index}].color`);
            }
          }
        });
      }

      // Check basic boundVariables properties
      if ("boundVariables" in node && node.boundVariables) {
        // Width and height
        if (
          node.boundVariables.width &&
          isMatchingVariable(node.boundVariables.width)
        ) {
          boundProperties.push("width");
        }
        if (
          node.boundVariables.height &&
          isMatchingVariable(node.boundVariables.height)
        ) {
          boundProperties.push("height");
        }

        // Layout properties
        const layoutProps = [
          "paddingLeft",
          "paddingRight",
          "paddingTop",
          "paddingBottom",
          "itemSpacing",
          "counterAxisSpacing",
        ];
        layoutProps.forEach((prop) => {
          if (
            (node.boundVariables as any)[prop] &&
            isMatchingVariable((node.boundVariables as any)[prop])
          ) {
            boundProperties.push(prop);
          }
        });

        // Text properties
        if (node.type === "TEXT") {
          if (
            node.boundVariables.characters &&
            isMatchingVariable(node.boundVariables.characters)
          ) {
            boundProperties.push("characters");
          }
        }
      }

      // Check effect properties (shadows, blurs)
      if ("effects" in node && node.effects && Array.isArray(node.effects)) {
        node.effects.forEach((effect, index) => {
          if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
            if (
              effect.boundVariables?.color &&
              isMatchingVariable(effect.boundVariables.color)
            ) {
              boundProperties.push(`effects[${index}].color`);
            }
            const effectProps = ["offset.x", "offset.y", "radius", "spread"];
            effectProps.forEach((prop) => {
              const [parent, child] = prop.split(".");
              const boundVar = child
                ? (effect.boundVariables as any)?.[parent]?.[child]
                : (effect.boundVariables as any)?.[prop];
              if (boundVar && isMatchingVariable(boundVar)) {
                boundProperties.push(`effects[${index}].${prop}`);
              }
            });
          }
          if (
            effect.type === "LAYER_BLUR" ||
            effect.type === "BACKGROUND_BLUR"
          ) {
            if (
              effect.boundVariables?.radius &&
              isMatchingVariable(effect.boundVariables.radius)
            ) {
              boundProperties.push(`effects[${index}].radius`);
            }
          }
        });
      }

      // Check component properties (for instances)
      if (node.type === "INSTANCE" && "componentProperties" in node) {
        try {
          const componentProperties = node.componentProperties;
          if (componentProperties) {
            Object.entries(componentProperties).forEach(
              ([propName, propValue]) => {
                if (
                  propValue &&
                  typeof propValue === "object" &&
                  "boundVariables" in propValue &&
                  propValue.boundVariables?.value &&
                  isMatchingVariable(propValue.boundVariables.value)
                ) {
                  boundProperties.push(`componentProperties.${propName}`);
                }
              },
            );
          }
        } catch (error) {
          console.warn(
            `Skipping node ${node.id} due to component property error:`,
            error,
          );
        }
      }

      // If any properties are bound to this variable, add the node to results
      if (boundProperties.length > 0) {
        if (instancesOnly) {
          const topInstance = findTopLevelInstance(node);

          if (topInstance) {
            if (!processedInstanceNames.has(topInstance.name)) {
              processedInstanceNames.add(topInstance.name);
              boundNodes.push({
                node: topInstance,
                boundProperties,
                propertyPath: getNodePath(topInstance),
                pageName: getNodePage(topInstance),
              });

              // Emit streaming result
              if (callbacks?.onStreamingResult) {
                callbacks.onStreamingResult({
                  variableId: variable.id,
                  variableName: variable.name,
                  instanceNode: {
                    id: topInstance.id,
                    name: topInstance.name,
                    type: topInstance.type,
                    pageName: getNodePage(topInstance),
                  },
                });
              }
            }
          }
        } else {
          // Normal mode - add the node itself
          boundNodes.push({
            node,
            boundProperties,
            propertyPath: getNodePath(node),
            pageName: getNodePage(node),
          });
        }
      }

      // Recursively check children
      if ("children" in node && node.children) {
        for (const child of node.children) {
          const shouldContinue = await checkNode(child);
          if (!shouldContinue) {
            return false; // Propagate cancellation
          }
        }
      }
    } catch (error) {
      console.warn(
        `Skipping node ${node.id} (${node.name}) due to error:`,
        error,
      );
    }

    return true; // Continue processing
  }

  /**
   * Get the page name where a node is located
   */
  function getNodePage(node: SceneNode): string {
    let currentNode: BaseNode | null = node;

    while (currentNode && currentNode.parent) {
      if (currentNode.parent.type === "PAGE") {
        return currentNode.parent.name || "Unnamed Page";
      }
      currentNode = currentNode.parent;
    }

    return "Unknown Page";
  }

  /**
   * Get the path to a node (for debugging/display purposes)
   */
  function getNodePath(node: SceneNode): string {
    const path: string[] = [];
    let currentNode: BaseNode | null = node;

    while (
      currentNode &&
      currentNode.parent &&
      currentNode.parent.type !== "DOCUMENT" &&
      currentNode.parent.type !== "PAGE"
    ) {
      path.unshift(currentNode.name || currentNode.type);
      currentNode = currentNode.parent;
    }

    return path.length > 0 ? path.join(" > ") : node.name || node.type;
  }

  // Start checking from all pages or specific page if pageId is provided
  const pagesToSearch = pageId
    ? figma.root.children.filter((page) => page.id === pageId)
    : figma.root.children;

  console.log(
    `🔍 Searching in ${pagesToSearch.length} page(s)${
      pageId ? ` (filtered by pageId: ${pageId})` : " (all pages)"
    }`,
  );

  if (pageId && pagesToSearch.length === 0) {
    console.warn(`⚠️ No page found with ID: ${pageId}`);
    return boundNodes;
  }

  // Count total nodes for progress tracking
  function countNodes(node: SceneNode): number {
    let count = 1;
    if ("children" in node && node.children) {
      node.children.forEach((child) => {
        count += countNodes(child);
      });
    }
    return count;
  }

  function countInstanceNodes(node: SceneNode): number {
    let count = 0;
    if (node.type === "INSTANCE") {
      count += countNodes(node);
    }
    if ("children" in node && node.children) {
      node.children.forEach((child) => {
        count += countInstanceNodes(child);
      });
    }
    return count;
  }

  pagesToSearch.forEach((page) => {
    if (page.type === "PAGE") {
      page.children.forEach((child) => {
        totalNodes += instancesOnly
          ? countInstanceNodes(child)
          : countNodes(child);
      });
    }
  });

  console.log(`📊 Total nodes to scan: ${totalNodes}`);

  // Send initial progress update
  if (callbacks?.onProgress && totalNodes > 0) {
    callbacks.onProgress(0, totalNodes, 0);
  }

  const startTime = Date.now();
  let cancelled = false;

  for (const page of pagesToSearch) {
    if (page.type === "PAGE" && !cancelled) {
      console.log(`  📄 Searching page: "${page.name}" (${page.id})`);
      if (instancesOnly) {
        // When instancesOnly is true, only start from instances
        const findInstancesInNode = async (
          node: SceneNode,
        ): Promise<boolean> => {
          if (node.type === "INSTANCE") {
            const shouldContinue = await checkNode(node);
            if (!shouldContinue) {
              cancelled = true;
              return false;
            }
          }
          // Continue searching for instances in children
          if ("children" in node && node.children) {
            for (const child of node.children) {
              const shouldContinue = await findInstancesInNode(child);
              if (!shouldContinue) {
                return false;
              }
            }
          }
          return true;
        };

        for (const child of page.children) {
          const shouldContinue = await findInstancesInNode(child);
          if (!shouldContinue) {
            cancelled = true;
            break;
          }
        }
      } else {
        // Normal behavior - check all nodes
        for (const child of page.children) {
          const shouldContinue = await checkNode(child);
          if (!shouldContinue) {
            cancelled = true;
            break;
          }
        }
      }
    }
  }

  const endTime = Date.now();
  const searchTime = endTime - startTime;

  // Send final progress update
  if (callbacks?.onProgress && totalNodes > 0 && !cancelled) {
    callbacks.onProgress(totalNodes, totalNodes, boundNodes.length);
  }

  if (cancelled) {
    console.log(
      `⚠️ Search cancelled by user after ${searchTime}ms. Found ${boundNodes.length} nodes so far.`,
    );
  } else {
    console.log(
      `✅ Search completed in ${searchTime}ms. Found ${boundNodes.length} nodes.`,
    );
  }

  console.log(
    `   📊 Performance: Cached ${variableCache.size} variables, ${variableKeyCache.size} keys, ${targetVariableIds.size} target IDs, ${processedInstanceNames.size} unique components`,
  );

  return boundNodes;
}

/**
 * Helper function to get a summary of where a variable is used
 */
export async function getVariableUsageSummary(
  variable: Variable,
  instancesOnly: boolean = false,
  pageId?: string | null,
) {
  const boundNodes = await findNodesWithBoundVariable(
    variable,
    instancesOnly,
    pageId,
  );

  const summary = {
    totalNodes: boundNodes.length,
    nodesByType: {} as Record<string, number>,
    propertyUsage: {} as Record<string, number>,
    nodes: boundNodes,
  };

  boundNodes.forEach(({ node, boundProperties }) => {
    // Count by node type
    summary.nodesByType[node.type] = (summary.nodesByType[node.type] || 0) + 1;

    // Count by property type
    boundProperties.forEach((prop) => {
      const baseProperty = prop.split("[")[0].split(".")[0]; // Extract base property name
      summary.propertyUsage[baseProperty] =
        (summary.propertyUsage[baseProperty] || 0) + 1;
    });
  });

  return summary;
}
