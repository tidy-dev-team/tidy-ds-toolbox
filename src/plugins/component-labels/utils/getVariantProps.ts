/// <reference types="@figma/plugin-typings" />

import { VariantProperty } from "../types";

/**
 * Gets all variant properties from a component set
 *
 * @param componentSet The component set to extract variant properties from
 * @returns Object containing all variant properties
 */
export function findAllVariantProps(
  componentSet: ComponentSetNode,
): Record<string, VariantProperty> {
  const componentProperties = componentSet.componentPropertyDefinitions;
  const variantProps: Record<string, VariantProperty> = {};

  for (const propName in componentProperties) {
    const property = componentProperties[propName];

    if (property.type === "VARIANT") {
      variantProps[propName] = {
        type: property.type,
        variantOptions: property.variantOptions || [],
        defaultValue: property.defaultValue || "",
      };
    }
  }

  return variantProps;
}
