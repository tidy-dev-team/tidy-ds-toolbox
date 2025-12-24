/**
 * Add highlight frame around selected element
 */

import { SEVERITY_STROKE_COLORS } from "./constants";
import type { SeverityLevel } from "../types";

/**
 * Computes the bounding box of a node including any children
 */
function computeBounds(node: SceneNode): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
    return {
      x: node.absoluteBoundingBox.x,
      y: node.absoluteBoundingBox.y,
      width: node.absoluteBoundingBox.width,
      height: node.absoluteBoundingBox.height,
    };
  }
  // Fallback for nodes without absoluteBoundingBox
  return {
    x: node.x,
    y: node.y,
    width: "width" in node ? node.width : 100,
    height: "height" in node ? node.height : 100,
  };
}

export function addFrame(element: SceneNode, type: SeverityLevel): FrameNode {
  const bounds = computeBounds(element);

  const frame = figma.createFrame();
  element.parent?.appendChild(frame);
  frame.name = `${element.id}-highlight`;
  frame.x = bounds.x;
  frame.y = bounds.y;
  frame.resize(bounds.width, bounds.height);

  frame.strokeWeight = 14;
  frame.strokeAlign = "OUTSIDE";
  frame.fills = [];

  const color = SEVERITY_STROKE_COLORS[type];
  if (color) {
    frame.strokes = [
      {
        type: "SOLID",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        color,
      },
    ];
  }

  return frame;
}
