/// <reference types="@figma/plugin-typings" />

import {
  INTERNAL_TOOLS_PAGE,
  DS_SIZE_MARKER,
  DS_SPACING_MARKER,
} from "./constants";

/**
 * Get a spacing or size marker instance from the Internal Tools page
 * @param markerPosition - Position variant: "top", "right", "bottom", "left"
 * @param type - "spacing" or "size"
 * @returns A marker instance or null if not found
 */
export function getMarker(
  markerPosition: string,
  type: "spacing" | "size" = "spacing",
): InstanceNode | null {
  const toolsPage = figma.root.findChild(
    (node) => node.name === INTERNAL_TOOLS_PAGE,
  ) as PageNode | null;

  if (!toolsPage) {
    console.warn("Internal tools page not found");
    return null;
  }

  const markerSetName = type === "size" ? DS_SIZE_MARKER : DS_SPACING_MARKER;
  const markerSet = toolsPage.findOne(
    (node) => node.name === markerSetName,
  ) as ComponentSetNode | null;

  if (!markerSet || markerSet.type !== "COMPONENT_SET") {
    console.warn(`Marker set "${markerSetName}" not found`);
    return null;
  }

  const markerComponent = markerSet.findOne(
    (node) =>
      node.type === "COMPONENT" && node.name === `position=${markerPosition}`,
  ) as ComponentNode | null;

  if (!markerComponent) {
    console.warn(
      `Marker variant "position=${markerPosition}" not found in ${markerSetName}`,
    );
    return null;
  }

  const instance = markerComponent.createInstance();
  figma.currentPage.appendChild(instance);

  return instance;
}
