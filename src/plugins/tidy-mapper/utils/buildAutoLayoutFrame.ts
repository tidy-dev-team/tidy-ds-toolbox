/// <reference types="@figma/plugin-typings" />

/**
 * Creates an auto-layout frame with specified settings
 */
export function buildAutoLayoutFrame(
  name: string,
  direction: "NONE" | "HORIZONTAL" | "VERTICAL",
  paddingHorizontal = 20,
  paddingVertical = 20,
  itemSpacing = 10,
): FrameNode {
  const frame = figma.createFrame();
  frame.layoutMode = direction;
  frame.paddingTop = paddingVertical;
  frame.paddingBottom = paddingVertical;
  frame.paddingLeft = paddingHorizontal;
  frame.paddingRight = paddingHorizontal;
  frame.itemSpacing = itemSpacing;
  frame.counterAxisSizingMode = "AUTO";
  frame.clipsContent = false;
  frame.fills = [];
  frame.name = name;
  return frame;
}
