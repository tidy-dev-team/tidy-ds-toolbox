/// <reference types="@figma/plugin-typings" />

import { PropertyInfo, ComponentData, BuildData } from "./types";

// Figma typings do not export ComponentPropertyDefinition directly, so define it here:
type ComponentPropertyDefinition = ComponentPropertyDefinitions[string];

// Helper to get property info from component or component set
function getComponentPropertyInfo(
  node: ComponentSetNode | ComponentNode,
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
  node: ComponentSetNode | ComponentNode,
): string {
  try {
    if (node.description?.trim()) {
      return node.description.trim();
    }
    if (
      node.type === "COMPONENT_SET" &&
      node.defaultVariant?.description?.trim()
    ) {
      return node.defaultVariant.description.trim();
    }
    return "No description available";
  } catch (error) {
    return "Error loading description";
  }
}

// Helper to generate component image
async function getComponentImage(
  node: ComponentSetNode | ComponentNode,
): Promise<string | null> {
  try {
    const nodeToRender =
      node.type === "COMPONENT_SET" ? node.defaultVariant : node;

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
  node: ComponentNode,
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

// Helper to import component (tries component set first, then regular component)
async function importComponent(
  key: string,
  figma: any,
): Promise<ComponentSetNode | ComponentNode> {
  try {
    return await figma.importComponentSetByKeyAsync(key);
  } catch (error) {
    try {
      return await figma.importComponentByKeyAsync(key);
    } catch (innerError) {
      const errorMsg =
        innerError instanceof Error ? innerError.message : String(innerError);
      throw new Error(`Failed to import component: ${errorMsg}`);
    }
  }
}

// Handler for getting component properties
export async function handleGetComponentProperties(
  payload: { key: string; name: string; requestId?: string },
  figma: any,
): Promise<ComponentData> {
  if (!payload.key || !payload.name) {
    throw new Error("Invalid payload: missing key or name");
  }

  try {
    const node = await importComponent(payload.key, figma);

    const properties = getComponentPropertyInfo(node);
    const description = getComponentDescription(node);
    const image = await getComponentImage(node);
    const nestedInstances =
      node.type === "COMPONENT_SET"
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

// Helper to strip a property from all variant names in a component set
function stripPropertyFromVariantNames(
  componentSet: ComponentSetNode,
  propertyName: string,
): void {
  const variants = componentSet.children.filter(
    (child): child is ComponentNode => child.type === "COMPONENT",
  );

  for (const variant of variants) {
    const props = parseVariantName(variant.name);
    if (!(propertyName in props)) continue;

    delete props[propertyName];

    // Rebuild name without the removed property
    const newName = Object.entries(props)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");

    // Only rename if we have remaining properties
    if (newName) {
      variant.name = newName;
    }
  }
}

function getDefaultVariantValue(
  propName: string,
  propDef: ComponentPropertyDefinition,
  componentSet: ComponentSetNode,
): string | null {
  if (typeof propDef.defaultValue === "string" && propDef.defaultValue) {
    return propDef.defaultValue;
  }

  if (componentSet.defaultVariant?.name) {
    const variantProps = parseVariantName(componentSet.defaultVariant.name);
    if (variantProps[propName]) {
      return variantProps[propName];
    }
  }

  if (propDef.variantOptions && propDef.variantOptions.length > 0) {
    return propDef.variantOptions[0];
  }

  return null;
}

// Handler for building component
export async function handleBuildComponent(
  buildData: BuildData & { requestId?: string },
  figma: any,
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
    const blockedVariantProps = new Set<string>();

    const handlePropertyDeletion = (
      target: ComponentNode | ComponentSetNode,
      propName: string,
      propDef: ComponentPropertyDefinitions[string],
    ) => {
      if (propDef.type === "VARIANT") {
        blockedVariantProps.add(propName);
        return;
      }
      target.deleteComponentProperty(propName);
    };

    // Process properties for component sets
    if (clone.type === "COMPONENT_SET") {
      const propertyDefs =
        clone.componentPropertyDefinitions as ComponentPropertyDefinitions;

      for (const [propName, propDef] of Object.entries(propertyDefs)) {
        const typedPropDef = propDef as ComponentPropertyDefinition;
        const propertyDisabled = properties[propName] === false;

        if (typedPropDef.type !== "VARIANT") {
          if (propertyDisabled) {
            handlePropertyDeletion(clone, propName, typedPropDef);
          }
          continue;
        }

        const variantOptions = typedPropDef.variantOptions;
        if (!variantOptions || variantOptions.length === 0) {
          if (propertyDisabled) {
            try {
              clone.deleteComponentProperty(propName);
            } catch (error) {
              console.warn(
                `Unable to delete variant property "${propName}":`,
                error,
              );
              blockedVariantProps.add(propName);
            }
          }
          continue;
        }

        const enabledOptions = propertyDisabled
          ? []
          : variantOptions.filter((option) => {
              const optionKey = `${propName}#${option}`;
              return properties[optionKey] !== false;
            });

        const allOptionsDisabled =
          propertyDisabled || enabledOptions.length === 0;
        const optionsChanged =
          allOptionsDisabled || enabledOptions.length !== variantOptions.length;

        if (!optionsChanged) {
          continue;
        }

        const targetValues = new Set<string>();
        if (allOptionsDisabled) {
          const defaultValue = getDefaultVariantValue(
            propName,
            typedPropDef,
            clone,
          );
          if (defaultValue) {
            targetValues.add(defaultValue);
          }
        } else {
          enabledOptions.forEach((option) => targetValues.add(option));
        }

        const variants = [...clone.children].filter(
          (child): child is ComponentNode => child.type === "COMPONENT",
        );
        const removalTargets: ComponentNode[] = [];
        const keepSet = new Set<ComponentNode>();

        for (const variant of variants) {
          const variantProps = parseVariantName(variant.name);
          const variantValue = variantProps[propName];

          const shouldKeep =
            targetValues.size === 0
              ? true
              : variantValue && targetValues.has(variantValue);

          if (shouldKeep) {
            keepSet.add(variant);
          } else {
            removalTargets.push(variant);
          }
        }

        if (keepSet.size === 0 && variants.length > 0) {
          // Ensure at least one variant remains to avoid empty component sets
          const fallbackVariant = variants[0];
          keepSet.add(fallbackVariant);
          const index = removalTargets.indexOf(fallbackVariant);
          if (index >= 0) {
            removalTargets.splice(index, 1);
          }
        }

        removalTargets.forEach((variant) => variant.remove());

        if (allOptionsDisabled) {
          // Strip property from remaining variant names first
          // This is required because Figma infers variant properties from child names
          stripPropertyFromVariantNames(clone, propName);

          try {
            clone.deleteComponentProperty(propName);
          } catch (error) {
            console.warn(
              `Unable to delete variant property "${propName}":`,
              error,
            );
            blockedVariantProps.add(propName);
          }
        }
      }
    }
    // Process properties for regular components
    else if (clone.type === "COMPONENT") {
      const propertyDefs =
        clone.componentPropertyDefinitions as ComponentPropertyDefinitions;

      for (const [propName, propDef] of Object.entries(propertyDefs)) {
        if (properties[propName] === false) {
          handlePropertyDeletion(
            clone,
            propName,
            propDef as ComponentPropertyDefinition,
          );
        }
      }
    }

    // Add to canvas
    figma.currentPage.appendChild(clone);
    figma.currentPage.selection = [clone];
    figma.viewport.scrollAndZoomIntoView([clone]);

    if (blockedVariantProps.size > 0) {
      const ignoredList = [...blockedVariantProps].join(", ");
      const warningMessage = `Variant properties cannot be removed automatically (${ignoredList}). Disable specific variant options instead.`;
      console.warn(warningMessage);
      figma.notify(warningMessage, { timeout: 5000 });
    }

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
