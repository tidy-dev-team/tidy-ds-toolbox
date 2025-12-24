/**
 * Build notes element for report
 */

import { buildAutoLayoutFrame } from "./buildAutoLayoutFrame";

export function buildNotesElement(): FrameNode {
  const notesFrame = buildAutoLayoutFrame("notes", "VERTICAL", 0, 0, 12);

  const tagFrame = buildAutoLayoutFrame("notes-tag", "HORIZONTAL", 48, 12, 0);
  tagFrame.strokes = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.4821479916572571,
        g: 0.2813958525657654,
        b: 0.9505696892738342,
      },
    },
  ];
  tagFrame.cornerRadius = 22;
  tagFrame.strokeWeight = 2;

  const notesTag = figma.createText();
  notesTag.fontName = {
    family: "Inter",
    style: "Regular",
  };
  notesTag.fontSize = 20;
  notesTag.characters = "To Do";
  notesTag.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: {
        r: 0.4821479916572571,
        g: 0.2813958525657654,
        b: 0.9505696892738342,
      },
    },
  ];
  tagFrame.appendChild(notesTag);
  notesFrame.appendChild(tagFrame);

  const notesTitle = figma.createText();
  notesTitle.fontName = {
    family: "Inter",
    style: "Regular",
  };
  notesTitle.fontSize = 50;
  notesTitle.characters = "Notes";
  notesFrame.appendChild(notesTitle);

  const notesContent = figma.createText();
  notesContent.fontName = {
    family: "Inter",
    style: "Regular",
  };
  notesContent.fontSize = 20;
  notesContent.characters = "Your notes here...";
  notesFrame.appendChild(notesContent);

  return notesFrame;
}
