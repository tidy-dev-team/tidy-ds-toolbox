/// <reference types="@figma/plugin-typings" />

import {
  getOrCreateSizeMarkerComponents,
  getOrCreateSpacingMarkerComponents,
} from "./buildInternalComponents";

/**
 * Get a spacing or size marker instance from the Internal Tools page
 * @param markerPosition - Position variant: "top", "right", "bottom", "left"
 * @param type - "spacing" or "size"
 * @returns A marker instance or null if not found
 */
export async function getMarker(
  markerPosition: string,
  type: "spacing" | "size" = "spacing",
): Promise<InstanceNode | null> {
  const factory =
    type === "size"
      ? getOrCreateSizeMarkerComponents
      : getOrCreateSpacingMarkerComponents;

  const components = await factory();
  if (!components) {
    console.warn("Marker components could not be created");
    return null;
  }

  const component = components.get(`position=${markerPosition}`) ?? null;
  if (!component) {
    console.warn(`Marker variant "position=${markerPosition}" not found`);
    return null;
  }

  const instance = component.createInstance();
  figma.currentPage.appendChild(instance);
  return instance;
}
