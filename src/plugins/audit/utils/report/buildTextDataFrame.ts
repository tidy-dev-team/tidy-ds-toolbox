/**
 * Build text data frame for report element
 */

import { buildAutoLayoutFrame } from "./buildAutoLayoutFrame";
import { ERROR_COLOR, TEXT_WIDTH } from "../constants";

export function buildTextDataFrame(
  _key: string,
  title: string | undefined,
  selectedNote: string | undefined,
  note: string | undefined,
  noteCharacters: string,
  nodeId: string,
  isQuickWin: boolean,
): FrameNode {
  const textDataFrame = buildAutoLayoutFrame("text-data", "VERTICAL", 0, 0, 24);

  if (title) {
    const noteTitle = figma.createText();
    noteTitle.characters = `•. ${title} 🔗 ${isQuickWin ? "🏆" : ""}`;
    noteTitle.fontName = {
      family: "Inter",
      style: "Regular",
    };
    noteTitle.fontSize = 50;

    try {
      noteTitle.hyperlink = {
        type: "NODE",
        value: nodeId,
      };
    } catch (error) {
      noteTitle.characters = `${noteTitle.characters} (no element with id ${nodeId} found)`;
      noteTitle.fills = ERROR_COLOR as readonly Paint[];
    }

    noteTitle.resize(TEXT_WIDTH, noteTitle.height);
    textDataFrame.appendChild(noteTitle);
  }

  if (selectedNote || note) {
    const noteText = figma.createText();
    noteText.fontName = {
      family: "Inter",
      style: "Regular",
    };
    noteText.fontSize = 35;
    noteText.characters = noteCharacters;
    noteText.resize(TEXT_WIDTH, noteText.height);
    textDataFrame.appendChild(noteText);
  }

  return textDataFrame;
}
