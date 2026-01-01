/// <reference types="@figma/plugin-typings" />

import { SpacingsConfig, SupportedContainerNode } from "../types";
import { getMarker } from "./getMarker";
import { setMarkerSizeProps } from "./markerHelpers";

/**
 * Build size markers (width and height) for a container node
 */
export async function buildSizeMarks(
  frame: SupportedContainerNode,
  config: SpacingsConfig,
): Promise<InstanceNode[]> {
  const markers: InstanceNode[] = [];
  const frameBounds = frame.absoluteBoundingBox!;

  // Height marker (on the right side)
  const rightMarker = await getMarker("right", "size");
  if (rightMarker) {
    rightMarker.resize(rightMarker.width, frame.height);
    rightMarker.x = frameBounds.x + frame.width;
    rightMarker.y = frameBounds.y;
    setMarkerSizeProps(
      config.rootSize,
      frame.height,
      rightMarker,
      config.units,
    );
    rightMarker.name = ".frame-size_height";
    markers.push(rightMarker);
  }

  // Width marker (on the bottom)
  const bottomMarker = await getMarker("bottom", "size");
  if (bottomMarker) {
    bottomMarker.resize(frame.width, bottomMarker.height);
    bottomMarker.x = frameBounds.x;
    bottomMarker.y = frameBounds.y + frame.height;
    setMarkerSizeProps(
      config.rootSize,
      frame.width,
      bottomMarker,
      config.units,
    );
    bottomMarker.name = ".frame-size_width";
    markers.push(bottomMarker);
  }

  return markers;
}
