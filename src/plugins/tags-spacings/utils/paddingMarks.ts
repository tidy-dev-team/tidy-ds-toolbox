/// <reference types="@figma/plugin-typings" />

import {
  SpacingsConfig,
  PaddingMeasurements,
  SupportedContainerNode,
} from "../types";
import { getMarker } from "./getMarker";
import {
  setMarkerSizeProps,
  getMarkerHandLength,
  getMarkerShift,
} from "./markerHelpers";

/**
 * Calculate padding measurements for a container node
 * For groups, calculates from children bounds since groups don't have padding properties
 */
function calculatePaddings(frame: SupportedContainerNode): PaddingMeasurements {
  const frameBounds = frame.absoluteBoundingBox!;
  const frameX = frameBounds.x;
  const frameY = frameBounds.y;

  // Initialize with frame padding properties if available
  const paddings: PaddingMeasurements = {
    topPadding: { y: frameY, size: 0 },
    rightPadding: { x: frameX + frame.width, size: 0 },
    bottomPadding: { y: frameY + frame.height, size: 0 },
    leftPadding: { x: frameX, size: 0 },
  };

  // Use auto-layout padding if available
  if ("paddingTop" in frame && frame.paddingTop !== undefined) {
    paddings.topPadding.size = frame.paddingTop ?? 0;
    paddings.rightPadding.size = frame.paddingRight ?? 0;
    paddings.bottomPadding.size = frame.paddingBottom ?? 0;
    paddings.leftPadding.size = frame.paddingLeft ?? 0;

    // Calculate positions based on padding
    paddings.rightPadding.x = frameX + frame.width - paddings.rightPadding.size;
    paddings.bottomPadding.y =
      frameY + frame.height - paddings.bottomPadding.size;
  } else if ("children" in frame && frame.children.length > 0) {
    // Calculate from children bounds
    const children = frame.children.filter(
      (child) => child.visible && child.absoluteBoundingBox,
    );

    if (children.length > 0) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const child of children) {
        const bounds = child.absoluteBoundingBox!;
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      }

      paddings.topPadding.size = minY - frameY;
      paddings.leftPadding.size = minX - frameX;
      paddings.rightPadding.size = frameX + frame.width - maxX;
      paddings.bottomPadding.size = frameY + frame.height - maxY;

      paddings.rightPadding.x = maxX;
      paddings.bottomPadding.y = maxY;
    }
  }

  return paddings;
}

/**
 * Check if paddings have any non-zero values
 */
function hasPaddings(paddings: PaddingMeasurements): boolean {
  return (
    paddings.topPadding.size > 0.01 ||
    paddings.rightPadding.size > 0.01 ||
    paddings.bottomPadding.size > 0.01 ||
    paddings.leftPadding.size > 0.01
  );
}

/**
 * Build padding markers for a container node
 */
export async function buildPaddingMarks(
  frame: SupportedContainerNode,
  config: SpacingsConfig,
): Promise<InstanceNode[]> {
  const markers: InstanceNode[] = [];
  const paddings = calculatePaddings(frame);

  if (!hasPaddings(paddings)) {
    return markers;
  }

  const frameBounds = frame.absoluteBoundingBox!;

  // Left padding marker
  if (paddings.leftPadding.size > 0.01) {
    const marker = await getMarker("top", "spacing");
    if (marker) {
      const handLength = getMarkerHandLength(marker);
      marker.x = paddings.leftPadding.x;
      marker.y = frameBounds.y - handLength - 21;
      marker.resize(paddings.leftPadding.size, frame.height + handLength + 21);
      setMarkerSizeProps(
        config.rootSize,
        paddings.leftPadding.size,
        marker,
        config.units,
      );
      marker.name = ".padding-marker_left";
      markers.push(marker);
    }
  }

  // Right padding marker
  if (paddings.rightPadding.size > 0.01) {
    const marker = await getMarker("top", "spacing");
    if (marker) {
      const handLength = getMarkerHandLength(marker);
      marker.x = paddings.rightPadding.x;
      marker.y = frameBounds.y - handLength - 21;
      marker.resize(paddings.rightPadding.size, frame.height + handLength + 21);
      setMarkerSizeProps(
        config.rootSize,
        paddings.rightPadding.size,
        marker,
        config.units,
      );
      marker.name = ".padding-marker_right";
      markers.push(marker);
    }
  }

  // Top padding marker
  if (paddings.topPadding.size > 0.01) {
    const marker = await getMarker("right", "spacing");
    if (marker) {
      marker.x = frameBounds.x;
      marker.y = paddings.topPadding.y;
      // Set text props BEFORE resize (original plugin order)
      setMarkerSizeProps(
        config.rootSize,
        paddings.topPadding.size,
        marker,
        config.units,
      );
      // Get shift AFTER setting text (depends on text width)
      const shift = getMarkerShift(marker);
      marker.resize(frame.width + shift, paddings.topPadding.size);
      marker.name = ".padding-marker_top";
      markers.push(marker);
    }
  }

  // Bottom padding marker
  if (paddings.bottomPadding.size > 0.01) {
    const marker = await getMarker("right", "spacing");
    if (marker) {
      marker.x = frameBounds.x;
      marker.y = paddings.bottomPadding.y;
      // Set text props BEFORE resize (original plugin order)
      setMarkerSizeProps(
        config.rootSize,
        paddings.bottomPadding.size,
        marker,
        config.units,
      );
      // Get shift AFTER setting text (depends on text width)
      const shift = getMarkerShift(marker);
      marker.resize(frame.width + shift, paddings.bottomPadding.size);
      marker.name = ".padding-marker_bottom";
      markers.push(marker);
    }
  }

  return markers;
}
