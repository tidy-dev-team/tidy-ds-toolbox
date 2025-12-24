/**
 * Add annotation note below selected element
 */

import { buildAutoLayoutFrame } from "./buildAutoLayoutFrame";
import { SEVERITY_FILL_COLORS } from "./constants";
import type { SeverityLevel } from "../types";

export function addNote(element: SceneNode, type: SeverityLevel): FrameNode {
  const note = buildAutoLayoutFrame("admin-note", "VERTICAL", 20, 20, 16);
  note.name = `${element.id}-note`;
  note.resize(element.width, 200);
  note.x = element.x;
  note.y = element.y + element.height + 32;

  const color = SEVERITY_FILL_COLORS[type];
  if (color) {
    note.fills = [
      {
        type: "SOLID",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        color,
      },
    ];
  }

  return note;
}
