import { addToIndex } from "./buildOneSticker";
import { placeResultTopRight } from "./utilityFunctions";
import { buildAutoLayoutFrame } from "./utilityFunctions";
import { SECTION_FILL } from "./constants";
import { findDescriptionSection } from "./findDescriptionSection";
import { ComponentDescription } from "./parseDescription";

export function appendToStickerSheetPage(
  stickerSheetPage: PageNode,
  stickerFrame: FrameNode,
  element: ComponentNode | ComponentSetNode,
  raster: FrameNode,
  description: ComponentDescription
) {
  figma.currentPage = stickerSheetPage;

  addToIndex(stickerSheetPage, element.name, stickerFrame, raster);

  const currentSectionName = findDescriptionSection(
    "🗂️",
    description,
    "Unknown section"
  );
  const currentSectionFrame =
    findOrCreateCurrentSectionFrame(currentSectionName);
  currentSectionFrame.appendChild(stickerFrame);

  // placeResultTopRight(stickerFrame, stickerSheetPage);
}

function findOrCreateAllSectionsFrame() {
  let allSectionsFrame = figma.currentPage.findChild(
    (frame) => frame.name === "Sections"
  );
  if (!allSectionsFrame) {
    allSectionsFrame = buildAutoLayoutFrame("Sections", "VERTICAL", 24, 24, 24);
    allSectionsFrame.fills = [];
    figma.currentPage.appendChild(allSectionsFrame);
    placeResultTopRight(allSectionsFrame as FrameNode, figma.currentPage);
  }
  return allSectionsFrame as FrameNode;
}

function findOrCreateCurrentSectionFrame(sectionName: string): FrameNode {
  const allSectionsFrame = findOrCreateAllSectionsFrame();

  const foundSection = figma.currentPage.findOne(
    (node): node is FrameNode =>
      node.type === "FRAME" && node.name === sectionName
  );

  if (foundSection && foundSection.type === "FRAME") {
    return foundSection;
  }

  const sectonTitle = buildSectionTitle(sectionName);
  const sectionContent = buildSectionContent(sectionName);

  const sectionWithTitle = buildAutoLayoutFrame(
    sectionName + " section",
    "VERTICAL",
    24,
    24,
    24
  );
  sectionWithTitle.fills = [];
  sectionWithTitle.appendChild(sectonTitle);
  sectionWithTitle.appendChild(sectionContent);

  allSectionsFrame.appendChild(sectionWithTitle);

  return sectionContent;
}

function buildSectionContent(sectionName: string) {
  const newSection = buildAutoLayoutFrame(
    sectionName,
    "HORIZONTAL",
    24,
    24,
    24
  );
  newSection.name = sectionName;
  newSection.fills = SECTION_FILL;
  newSection.cornerRadius = 56;
  return newSection;
}

function buildSectionTitle(sectionName: string) {
  const newSectionTitle = figma.createText();
  newSectionTitle.characters = sectionName;
  newSectionTitle.fontName = {
    family: "Inter",
    style: "Bold",
  };
  newSectionTitle.fontSize = 64;
  newSectionTitle.fills = SECTION_FILL;
  newSectionTitle.textCase = "UPPER";
  return newSectionTitle;
}
//
// function findCurrentSectionName(
//   node: ComponentNode | ComponentSetNode,
//   description: ComponentDescription
// ): string {
//   const descriptionArray = node.description.split("\n");
//   const docIndex = descriptionArray.findIndex((line) => line.startsWith("🗂️"));
//   const currentSection = descriptionArray[docIndex + 1];
//   return currentSection;
// }
