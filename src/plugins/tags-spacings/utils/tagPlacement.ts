/// <reference types="@figma/plugin-typings" />

import { TagDirection, TagPlacement, ElementData, FrameBounds } from "../types";
import {
  TAG_DISTANCE_FROM_OBJECT,
  TAG_MICRO_SHIFT,
  TAG_LENGTH_EXTENSION,
  COLLISION_THRESHOLD,
  BASE_TAG_SIZE,
  EXTENSION_LENGTH,
} from "./constants";

/**
 * Determine optimal tag direction based on element position relative to frame
 */
export function determineOptimalDirection(
  element: ElementData,
  frameBounds: FrameBounds,
  userDirection: TagDirection,
): Exclude<TagDirection, "auto"> {
  if (userDirection !== "auto") {
    return userDirection;
  }

  // Calculate distances to each side of the frame
  const distanceToLeft = element.midX - frameBounds.x;
  const distanceToRight = frameBounds.x + frameBounds.width - element.midX;
  const distanceToTop = element.midY - frameBounds.y;
  const distanceToBottom = frameBounds.y + frameBounds.height - element.midY;

  // Check proximity to edges
  const isNearLeftEdge = distanceToLeft < frameBounds.width * 0.3;
  const isNearRightEdge = distanceToRight < frameBounds.width * 0.3;
  const isNearTopEdge = distanceToTop < frameBounds.height * 0.3;
  const isNearBottomEdge = distanceToBottom < frameBounds.height * 0.3;

  // Prioritize horizontal placement for elements near left/right edges
  if (isNearLeftEdge && !isNearTopEdge && !isNearBottomEdge) {
    return "left";
  }
  if (isNearRightEdge && !isNearTopEdge && !isNearBottomEdge) {
    return "right";
  }

  // Prioritize vertical placement for elements near top/bottom edges
  if (isNearTopEdge && !isNearLeftEdge && !isNearRightEdge) {
    return "top";
  }
  if (isNearBottomEdge && !isNearLeftEdge && !isNearRightEdge) {
    return "bottom";
  }

  // Find the closest side
  const distances = {
    left: distanceToLeft,
    right: distanceToRight,
    top: distanceToTop,
    bottom: distanceToBottom,
  };

  return Object.entries(distances).reduce((a, b) =>
    a[1] < b[1] ? a : b,
  )[0] as Exclude<TagDirection, "auto">;
}

/**
 * Calculate tag placement dimensions and position
 */
export function calculateTagPlacement(
  element: ElementData,
  frameBounds: FrameBounds,
  direction: Exclude<TagDirection, "auto">,
): TagPlacement {
  let tagX: number, tagY: number, tagWidth: number, tagHeight: number;
  let stemX: number, stemY: number;

  switch (direction) {
    case "top":
      tagHeight = Math.abs(element.y - frameBounds.y) + EXTENSION_LENGTH;
      tagWidth = BASE_TAG_SIZE;
      tagX = element.midX - tagWidth / 2;
      tagY = element.y - tagHeight - TAG_DISTANCE_FROM_OBJECT;
      stemX = element.midX;
      stemY = element.y;
      break;

    case "right":
      tagWidth =
        Math.abs(
          frameBounds.x + frameBounds.width - (element.x + element.width),
        ) + EXTENSION_LENGTH;
      tagHeight = BASE_TAG_SIZE;
      tagX = element.x + element.width + TAG_DISTANCE_FROM_OBJECT;
      tagY = element.midY - tagHeight / 2;
      stemX = element.x + element.width;
      stemY = element.midY;
      break;

    case "bottom":
      tagHeight =
        Math.abs(
          frameBounds.y + frameBounds.height - (element.y + element.height),
        ) + EXTENSION_LENGTH;
      tagWidth = BASE_TAG_SIZE;
      tagX = element.midX - tagWidth / 2;
      tagY = element.y + element.height + TAG_DISTANCE_FROM_OBJECT;
      stemX = element.midX;
      stemY = element.y + element.height;
      break;

    case "left":
      tagWidth = Math.abs(element.x - frameBounds.x) + EXTENSION_LENGTH;
      tagHeight = BASE_TAG_SIZE;
      tagX = element.x - tagWidth - TAG_DISTANCE_FROM_OBJECT;
      tagY = element.midY - tagHeight / 2;
      stemX = element.x;
      stemY = element.midY;
      break;
  }

  return {
    direction,
    x: tagX,
    y: tagY,
    width: tagWidth,
    height: tagHeight,
    stemX,
    stemY,
    element,
  };
}

/**
 * Calculate all tag placements with collision resolution
 */
export function calculateOptimalTagPlacements(
  elements: ElementData[],
  frameBounds: FrameBounds,
  userTagDirection: TagDirection,
): TagPlacement[] {
  const placements: TagPlacement[] = [];

  // Calculate initial placements
  for (const element of elements) {
    const direction = determineOptimalDirection(
      element,
      frameBounds,
      userTagDirection,
    );
    const placement = calculateTagPlacement(element, frameBounds, direction);
    placements.push(placement);
  }

  // Resolve overlaps within direction groups
  resolveOverlaps(placements);

  return placements;
}

/**
 * Resolve overlapping tags by applying micro-shifts
 */
function resolveOverlaps(placements: TagPlacement[]): void {
  // Group by direction
  const groups: Record<string, TagPlacement[]> = {
    top: [],
    right: [],
    bottom: [],
    left: [],
  };

  for (const placement of placements) {
    groups[placement.direction].push(placement);
  }

  // Resolve overlaps in each group
  for (const direction of Object.keys(groups)) {
    const group = groups[direction];
    if (group.length < 2) continue;

    const isVertical = direction === "top" || direction === "bottom";

    if (isVertical) {
      // Sort by x position
      group.sort((a, b) => a.x - b.x);

      for (let i = 1; i < group.length; i++) {
        const current = group[i];
        const previous = group[i - 1];

        if (Math.abs(current.x - previous.x) < current.width) {
          // Apply micro-shift
          const shiftDirection =
            current.element.midX > previous.element.midX ? 1 : -1;
          current.microShift = {
            x: TAG_MICRO_SHIFT * shiftDirection,
            y: 0,
          };
          current.x += current.microShift.x;

          // Extend tag length
          current.lengthExtension = TAG_LENGTH_EXTENSION;
          if (direction === "top") {
            current.height += current.lengthExtension;
            current.y -= current.lengthExtension;
          } else {
            current.height += current.lengthExtension;
          }
        }
      }
    } else {
      // Horizontal tags - sort by y position
      group.sort((a, b) => a.y - b.y);

      for (let i = 1; i < group.length; i++) {
        const current = group[i];
        const previous = group[i - 1];

        if (Math.abs(current.y - previous.y) < current.height) {
          // Apply micro-shift
          const shiftDirection =
            current.element.midY > previous.element.midY ? 1 : -1;
          current.microShift = {
            x: 0,
            y: TAG_MICRO_SHIFT * shiftDirection,
          };
          current.y += current.microShift.y;

          // Extend tag length
          current.lengthExtension = TAG_LENGTH_EXTENSION;
          if (direction === "left") {
            current.width += current.lengthExtension;
            current.x -= current.lengthExtension;
          } else {
            current.width += current.lengthExtension;
          }
        }
      }
    }
  }
}
