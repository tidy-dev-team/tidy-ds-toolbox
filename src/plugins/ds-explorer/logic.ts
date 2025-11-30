/// <reference types="@figma/plugin-typings" />

import { PropertyInfo, ComponentData, BuildData } from "./types";

// Helper to get property info from component or component set
function getComponentPropertyInfo(
  node: ComponentSetNode | ComponentNode
): PropertyInfo[] {
  const properties: PropertyInfo[] = [];

  try {
    if (!node) return [];

    const definitions = node.componentPropertyDefinitions;
    if (!definitions) return [];

    Object.entries(definitions).forEach(([name, def]) => {
      if (name?.trim()) {
        properties.push({
          name,
          type: def.type as any,
          defaultValue: def.defaultValue,
          variantOptions: def.variantOptions,
        });
      }
    });

    return properties.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error getting component properties:", error);
    return [];
  }
}

// Helper to get component description
function getComponentDescription(
  node: ComponentSetNode | ComponentNode
): string {
  try {
    if (node.description?.trim()) {
      return node.description.trim();
    }
    if (node.type === "COMPONENT_SET" && node.defaultVariant?.description?.trim()) {
      return node.defaultVariant.description.trim();
    }
    return "No description available";
  } catch (error) {
    return "Error loading description";
  }
}

// Helper to generate component image
async function getComponentImage(
  node: ComponentSetNode | ComponentNode
): Promise<string | null> {
  try {
    const nodeToRender = node.type === "COMPONENT_SET" 
      ? node.defaultVariant 
      : node;

    if (!nodeToRender) return null;

    const imageBytes = await nodeToRender.exportAsync({
      format: "PNG",
      constraint: { type: "WIDTH", value: 400 },
    });

    const base64 = figma.base64Encode(imageBytes);
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
}

// Helper to find exposed instances
function findExposedInstances(
  node: ComponentNode
): { name: string; id: string; key: string }[] {
  const instances: { name: string; id: string; key: string }[] = [];

  try {
    node.findAll((child: SceneNode) => {
      if (child.type === "INSTANCE" && (child as InstanceNode).exposedInstances) {
        const instance = child as InstanceNode;
        instances.push({
          name: instance.name,
          id: instance.id,
          key: instance.mainComponent?.key || "",
        });
      }
      return false;
    });
  } catch (error) {
    console.error("Error finding instances:", error);
  }

  return instances;
}

// Helper to import component (tries component set first, then regular component)
async function importComponent(key: string, figma: any): Promise<ComponentSetNode | ComponentNode> {
  try {
    return await figma.importComponentSetByKeyAsync(key);
  } catch (error) {
    try {
      return await figma.importComponentByKeyAsync(key);
    } catch (innerError) {
      const errorMsg = innerError instanceof Error ? innerError.message : String(innerError);
      throw new Error(`Failed to import component: ${errorMsg}`);
    }
  }
}

// Handler for getting component properties
export async function handleGetComponentProperties(
  payload: { key: string; name: string; requestId?: string },
  figma: any
): Promise<ComponentData> {
  if (!payload.key || !payload.name) {
    throw new Error("Invalid payload: missing key or name");
  }

  try {
    const node = await importComponent(payload.key, figma);
    
    const properties = getComponentPropertyInfo(node);
    const description = getComponentDescription(node);
    const image = await getComponentImage(node);
    const nestedInstances = node.type === "COMPONENT_SET"
      ? findExposedInstances(node.defaultVariant)
      : findExposedInstances(node);

    const componentData = {
      properties,
      nestedInstances,
      description,
      image,
    };

    // Send response directly from here (backward compatibility)
    if (payload.requestId) {
      figma.ui.postMessage({
        type: "response",
        requestId: payload.requestId,
        result: componentData,
      });
    }

    return componentData;
  } catch (error: any) {
    // Send error response
    if (payload.requestId) {
      figma.ui.postMessage({
        type: "error",
        requestId: payload.requestId,
        error: `Failed to load component: ${error.message}`,
      });
    }

    throw new Error(`Failed to load component: ${error.message}`);
  }
}

// Helper to parse variant name
function parseVariantName(name: string): Record<string, string> {
  const properties: Record<string, string> = {};
  const parts = name.split(",");

  for (const part of parts) {
    const [key, value] = part.split("=").map((s) => s.trim());
    if (key && value) {
      properties[key] = value;
    }
  }

  return properties;
}

// Handler for building component
export async function handleBuildComponent(
  buildData: BuildData & { requestId?: string },
  figma: any
): Promise<void> {
  const {
    componentKey: rawComponentKey,
    requestId,
    ...rawProperties
  } = buildData;
  const properties = rawProperties as Record<string, any>;
  const componentKey = String(rawComponentKey || "");

  try {
    if (!componentKey) {
      throw new Error("Component key is required");
    }

    const node = await importComponent(componentKey, figma);
    const clone = node.clone();
    clone.name = `${node.name} (Built)`;

    // Process properties for component sets
    if (clone.type === "COMPONENT_SET") {
      const propertyDefs = clone.componentPropertyDefinitions as ComponentPropertyDefinitions;

      for (const [propName, propDef] of Object.entries(propertyDefs)) {
        // Remove disabled properties
        if (properties[propName] === false) {
          clone.deleteComponentProperty(propName);
          continue;
        }

        // Filter variant options
        if (propDef.type === "VARIANT" && propDef.variantOptions) {
          const enabledOptions = propDef.variantOptions.filter((option: string) => {
            const optionKey = `${propName}#${option}`;
            return properties[optionKey] !== false;
          });

          // Remove variants that don't match enabled options
          const variants = [...clone.children];
          for (const variant of variants) {
            if (variant.type === "COMPONENT") {
              const variantProps = parseVariantName(variant.name);
              if (variantProps[propName] && !enabledOptions.includes(variantProps[propName])) {
                variant.remove();
              }
            }
          }
        }
      }
    } 
    // Process properties for regular components
    else if (clone.type === "COMPONENT") {
      const propertyDefs = clone.componentPropertyDefinitions as ComponentPropertyDefinitions;

      for (const propName of Object.keys(propertyDefs)) {
        if (properties[propName] === false) {
          clone.deleteComponentProperty(propName);
        }
      }
    }

    // Add to canvas
    figma.currentPage.appendChild(clone);
    figma.currentPage.selection = [clone];
    figma.viewport.scrollAndZoomIntoView([clone]);

    figma.notify(`✓ Component built successfully!`);

    // Send success response
    if (requestId) {
      figma.ui.postMessage({
        type: "response",
        requestId,
        result: { success: true, instanceId: clone.id },
      });
    }
  } catch (error: any) {
    console.error("Error building component:", error);
    figma.notify(`✗ Error: ${error.message}`);

    // Send error response
    if (requestId) {
      figma.ui.postMessage({
        type: "error",
        requestId,
        error: `Error: ${error.message}`,
      });
    }

    throw error;
  }
}
