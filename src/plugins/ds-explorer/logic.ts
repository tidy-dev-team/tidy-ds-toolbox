/// <reference types="@figma/plugin-typings" />

// DS Explorer main thread logic

import { PropertyInfo, ComponentData, BuildData } from "./types";

// Helper to get property info from component or component set
function getComponentPropertyInfo(
  node: ComponentSetNode | ComponentNode
): PropertyInfo[] {
  const properties: PropertyInfo[] = [];

  try {
    if (!node) return [];

    // For component sets
    if (node.type === "COMPONENT_SET" && node.componentPropertyDefinitions) {
      Object.entries(node.componentPropertyDefinitions).forEach(
        ([name, def]) => {
          if (name && name.trim()) {
            properties.push({
              name,
              type: def.type as any,
              defaultValue: def.defaultValue,
              variantOptions: def.variantOptions,
            });
          }
        }
      );
    }
    // For regular components
    else if (
      node.type === "COMPONENT" &&
      (node as ComponentNode).componentPropertyDefinitions
    ) {
      Object.entries(
        (node as ComponentNode).componentPropertyDefinitions
      ).forEach(([name, def]) => {
        if (name && name.trim()) {
          properties.push({
            name,
            type: def.type as any,
            defaultValue: def.defaultValue,
            variantOptions: def.variantOptions,
          });
        }
      });
    }

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
    if (node.description && node.description.trim()) {
      return node.description.trim();
    }
    if (node.type === "COMPONENT_SET" && node.defaultVariant?.description) {
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
    let nodeToRender: any;

    if (node.type === "COMPONENT_SET") {
      if (!node.defaultVariant) return null;
      nodeToRender = node.defaultVariant;
    } else {
      nodeToRender = node;
    }

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
      if (
        child.type === "INSTANCE" &&
        (child as InstanceNode).exposedInstances
      ) {
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

// Handler for getting component properties
export async function handleGetComponentProperties(
  payload: { key: string; name: string; requestId?: string },
  figma: any
): Promise<ComponentData> {
  console.log("🚀 handleGetComponentProperties called with:", {
    name: payload.name,
    key: payload.key,
    requestId: payload.requestId,
  });

  // Validate input
  if (!payload.key || !payload.name) {
    console.log("❌ Invalid payload - missing key or name");
    throw new Error("Invalid payload: missing key or name");
  }

  try {
    // Try importing as component set first
    let node: any;

    try {
      console.log(
        "🔍 Attempting to import component set with key:",
        payload.key
      );
      node = await figma.importComponentSetByKeyAsync(payload.key);
      console.log("✅ Component set imported successfully:", {
        name: node.name,
        type: node.type,
        hasPropertyDefinitions: !!node.componentPropertyDefinitions,
        hasDefaultVariant: !!node.defaultVariant,
      });
    } catch (error) {
      const componentSetError =
        error instanceof Error ? error.message : String(error);
      console.log(
        "⚠️ Component set import failed, trying regular component. Error:",
        componentSetError
      );
      // Fall back to regular component
      try {
        node = await figma.importComponentByKeyAsync(payload.key);
        console.log("✅ Regular component imported successfully:", {
          name: node.name,
          type: node.type,
          hasPropertyDefinitions: !!(node as any).componentPropertyDefinitions,
        });
      } catch (innerError) {
        const componentError =
          innerError instanceof Error ? innerError.message : String(innerError);
        console.log("❌ Regular component import also failed:", componentError);
        throw new Error(`Failed to import component: ${componentError}`);
      }
    }

    if (!node) {
      console.log("❌ No node found after import attempts");
      throw new Error("Component not found after import attempts");
    }

    console.log("🔍 Analyzing node type and properties...");
    const properties = getComponentPropertyInfo(node);
    const description = getComponentDescription(node);
    const image = await getComponentImage(node);

    const nestedInstances =
      node.type === "COMPONENT_SET"
        ? findExposedInstances(node.defaultVariant)
        : findExposedInstances(node);

    console.log("📊 Analysis results:");
    console.log("- Properties count:", properties.length);
    console.log(
      "- Properties:",
      properties.map((p) => p.name)
    );
    console.log("- Description:", description);
    console.log("- Image generated:", !!image);
    console.log("- Nested instances count:", nestedInstances.length);

    const componentData = {
      properties,
      nestedInstances,
      description,
      image,
    };

    // Send response back to UI
    if (payload.requestId) {
      console.log(
        "📤 Sending response to UI with requestId:",
        payload.requestId
      );
      console.log("📤 Response data:", {
        hasProperties: componentData.properties.length > 0,
        hasImage: !!componentData.image,
        hasDescription: !!componentData.description,
      });

      figma.ui.postMessage({
        type: "response",
        requestId: payload.requestId,
        result: componentData,
      });

      console.log("✅ Response sent to UI");
    } else {
      console.log("⚠️ No requestId provided, not sending response");
    }

    return componentData;
  } catch (error: any) {
    console.error("❌ Error in handleGetComponentProperties:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
    });

    // Send error response
    if (payload.requestId) {
      console.log("📤 Sending error response to UI");
      figma.ui.postMessage({
        type: "error",
        requestId: payload.requestId,
        error: `Failed to load component: ${error.message}`,
      });
    }

    throw new Error(`Failed to load component: ${error.message}`);
  }
}

// Handler for building component
export async function handleBuildComponent(
  buildData: BuildData & { requestId?: string },
  figma: any
): Promise<void> {
  console.log("Building component with data:", buildData);

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

    // Import component/component set
    let node: any;
    try {
      node = await figma.importComponentSetByKeyAsync(componentKey);
    } catch (error) {
      const importSetError =
        error instanceof Error ? error.message : String(error);
      console.warn(
        "Component set import failed, falling back to component:",
        importSetError
      );
      try {
        node = await figma.importComponentByKeyAsync(componentKey);
      } catch (innerError) {
        const importComponentError =
          innerError instanceof Error ? innerError.message : String(innerError);
        throw new Error(`Failed to import component: ${importComponentError}`);
      }
    }

    if (!node) {
      throw new Error("Component import returned no node");
    }

    // Clone node
    const clone = node.clone();
    clone.name = `${node.name} (Built)`;

    // Process properties

    if (clone.type === "COMPONENT_SET") {
      // Remove disabled variant properties
      const propertyDefs =
        clone.componentPropertyDefinitions as ComponentPropertyDefinitions;

      for (const [propName, propDef] of Object.entries(propertyDefs)) {
        // If property is disabled, remove it
        if (properties[propName] === false) {
          clone.deleteComponentProperty(propName);
          continue;
        }

        // If it's a variant with options, filter options
        if (propDef.type === "VARIANT" && propDef.variantOptions) {
          const enabledOptions = propDef.variantOptions.filter(
            (option: string) => {
              const optionKey = `${propName}#${option}`;
              return properties[optionKey] !== false;
            }
          );

          // Delete variants that don't match enabled options
          const variants = [...clone.children];
          for (const variant of variants) {
            if (variant.type === "COMPONENT") {
              const variantProps = parseVariantName(variant.name);
              if (
                variantProps[propName] &&
                !enabledOptions.includes(variantProps[propName])
              ) {
                variant.remove();
              }
            }
          }
        }
      }
    } else if (clone.type === "COMPONENT") {
      // For regular components, remove disabled properties
      const propertyDefs =
        clone.componentPropertyDefinitions as ComponentPropertyDefinitions;

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
