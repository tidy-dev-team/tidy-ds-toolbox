/// <reference types="@figma/plugin-typings" />

import { SpacingsConfig, SupportedContainerNode } from "../types";
import { getMarker } from "./getMarker";
import { setMarkerSizeProps } from "./markerHelpers";
import { researchNodesForSpacing } from "./elementResearch";

/**
 * Build item spacing markers for gaps between children
 */
export async function buildItemSpacingMarks(
  frame: SupportedContainerNode,
  config: SpacingsConfig,
): Promise<InstanceNode[]> {
  const markers: InstanceNode[] = [];

  // Check if frame has auto-layout
  if (!("layoutMode" in frame) || frame.layoutMode === "NONE") {
    // No auto-layout, try to detect spacing from children positions
    return buildSpacingFromChildren(frame, config);
  }

  const frameBounds = frame.absoluteBoundingBox!;
  const itemSpacing = frame.itemSpacing ?? 0;

  if (itemSpacing <= 0) {
    return markers;
  }

  // Get children positions
  const visibleChildren = frame.children.filter(
    (child) => child.visible && child.absoluteBoundingBox,
  );

  if (visibleChildren.length < 2) {
    return markers;
  }

  const isVertical = frame.layoutMode === "VERTICAL";

  // Create markers between each pair of children
  for (let i = 0; i < visibleChildren.length - 1; i++) {
    const current = visibleChildren[i];
    const next = visibleChildren[i + 1];
    const currentBounds = current.absoluteBoundingBox!;
    const nextBounds = next.absoluteBoundingBox!;

    if (isVertical) {
      // Vertical spacing
      const gapStart = currentBounds.y + currentBounds.height;
      const gapSize = nextBounds.y - gapStart;

      if (gapSize > 0.01) {
        const marker = getMarker("right", "spacing");
        if (marker) {
          marker.x = frameBounds.x;
          marker.y = gapStart;
          marker.resize(frame.width + 40, gapSize);
          setMarkerSizeProps(config.rootSize, gapSize, marker, config.units);
          marker.name = `.spacing-marker_v${i}`;
          markers.push(marker);
        }
      }
    } else {
      // Horizontal spacing
      const gapStart = currentBounds.x + currentBounds.width;
      const gapSize = nextBounds.x - gapStart;

      if (gapSize > 0.01) {
        const marker = getMarker("top", "spacing");
        if (marker) {
          marker.x = gapStart;
          marker.y = frameBounds.y - 61;
          marker.resize(gapSize, frame.height + 61);
          setMarkerSizeProps(config.rootSize, gapSize, marker, config.units);
          marker.name = `.spacing-marker_h${i}`;
          markers.push(marker);
        }
      }
    }
  }

  return markers;
}

/**
 * Build spacing markers by analyzing child positions (for non-auto-layout or group nodes)
 */
async function buildSpacingFromChildren(
  frame: SupportedContainerNode,
  config: SpacingsConfig,
): Promise<InstanceNode[]> {
  const markers: InstanceNode[] = [];
  const { xPositions, yPositions } = researchNodesForSpacing(
    frame,
    config.isShallow,
  );

  // Detect if layout is more horizontal or vertical
  const frameBounds = frame.absoluteBoundingBox!;
  const isMoreHorizontal = frame.width > frame.height;

  if (isMoreHorizontal) {
    // Analyze horizontal gaps
    for (let i = 0; i < xPositions.length - 1; i++) {
      const current = xPositions[i];
      const next = xPositions[i + 1];
      const gap = next.start - current.end;

      if (gap > 1) {
        const marker = getMarker("top", "spacing");
        if (marker) {
          marker.x = current.end;
          marker.y = frameBounds.y - 61;
          marker.resize(gap, frame.height + 61);
          setMarkerSizeProps(config.rootSize, gap, marker, config.units);
          marker.name = `.spacing-marker_h${i}`;
          markers.push(marker);
        }
      }
    }
  } else {
    // Analyze vertical gaps
    for (let i = 0; i < yPositions.length - 1; i++) {
      const current = yPositions[i];
      const next = yPositions[i + 1];
      const gap = next.start - current.end;

      if (gap > 1) {
        const marker = getMarker("right", "spacing");
        if (marker) {
          marker.x = frameBounds.x;
          marker.y = current.end;
          marker.resize(frame.width + 40, gap);
          setMarkerSizeProps(config.rootSize, gap, marker, config.units);
          marker.name = `.spacing-marker_v${i}`;
          markers.push(marker);
        }
      }
    }
  }

  return markers;
}
