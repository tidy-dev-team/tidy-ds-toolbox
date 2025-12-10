/// <reference types="@figma/plugin-typings" />

import { TRAIL_SUFFIX, TRAIL_COLOR } from "./constants";

/**
 * Creates a trail marker frame at the slice's position
 * Trail markers show where slices were located after they're processed
 */
export function buildTrail(slice: SliceNode): FrameNode {
  const trail = figma.createFrame();
  trail.name = slice.name + TRAIL_SUFFIX;

  // Position at slice location
  if (slice.absoluteBoundingBox) {
    trail.x = slice.absoluteBoundingBox.x;
    trail.y = slice.absoluteBoundingBox.y;
  }

  trail.resize(slice.width, slice.height);

  // Style: magenta dashed border, no fill
  trail.strokes = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: TRAIL_COLOR,
    },
  ];
  trail.fills = [];
  trail.cornerRadius = 4;
  trail.strokeWeight = 1;
  trail.strokeAlign = "INSIDE";
  trail.dashPattern = [8, 8];
  trail.visible = false;

  return trail;
}

/**
 * Shows or hides all trail markers on the current page
 */
export function setTrailsVisibility(page: PageNode, visible: boolean): number {
  const trails = page.findChildren(
    (node) => node.name.endsWith(TRAIL_SUFFIX) && node.type === "FRAME",
  );

  trails.forEach((trail) => {
    trail.visible = visible;
  });

  return trails.length;
}

/**
 * Shows only trails that match the given name prefix
 */
export function showTrailsByName(page: PageNode, name: string): number {
  const trails = page.findChildren(
    (node) => node.name.endsWith(TRAIL_SUFFIX) && node.type === "FRAME",
  );

  let visibleCount = 0;
  trails.forEach((trail) => {
    if (trail.name.startsWith(name)) {
      trail.visible = true;
      visibleCount++;
    } else {
      trail.visible = false;
    }
  });

  return visibleCount;
}

/**
 * Gets all unique trail names on the current page
 */
export function getTrailNames(page: PageNode): string[] {
  const trails = page.findChildren(
    (node) => node.name.endsWith(TRAIL_SUFFIX) && node.type === "FRAME",
  );

  const names = new Set<string>();
  trails.forEach((trail) => {
    const baseName = trail.name.replace(TRAIL_SUFFIX, "");
    names.add(baseName);
  });

  return Array.from(names).sort();
}
