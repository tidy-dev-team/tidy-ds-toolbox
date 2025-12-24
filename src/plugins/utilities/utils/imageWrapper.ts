/// <reference types="@figma/plugin-typings" />

import { UtilityResult } from "../types";

/**
 * Wraps selected items in a frame container.
 * Each selected item is wrapped in its own frame, preserving position and name.
 */
export async function runImageWrapper(): Promise<UtilityResult> {
  const items = figma.currentPage.selection;

  if (items.length === 0) {
    return {
      success: false,
      message: "Please select one or more items to wrap in frames.",
    };
  }

  const createdFrames: FrameNode[] = [];

  for (const item of items) {
    const xPosition = item.x;
    const yPosition = item.y;
    const width = item.width;
    const height = item.height;
    const name = item.name;

    const frame = figma.createFrame();
    frame.x = xPosition;
    frame.y = yPosition;
    frame.resize(width, height);

    // Get the parent before moving the item
    const parent = item.parent;

    // Append item to the new frame
    frame.appendChild(item);

    // Reset item position within the frame
    item.x = 0;
    item.y = 0;

    // Set frame name to match original item
    frame.name = name;

    // Add frame to the same parent as the original item
    if (parent && "appendChild" in parent) {
      (parent as ChildrenMixin).appendChild(frame);
    }

    createdFrames.push(frame);
  }

  // Select the created frames
  figma.currentPage.selection = createdFrames;

  return {
    success: true,
    message: `Wrapped ${createdFrames.length} item${createdFrames.length > 1 ? "s" : ""} in frames.`,
    count: createdFrames.length,
  };
}
