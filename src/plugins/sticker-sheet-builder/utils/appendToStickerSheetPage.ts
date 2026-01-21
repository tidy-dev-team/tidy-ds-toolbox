import { addToIndex } from "./buildOneSticker";
import { placeResultTopRight } from "./utilityFunctions";
import { buildAutoLayoutFrame } from "./utilityFunctions";
import { SECTION_FILL } from "./constants";
import { findDescriptionSection } from "./findDescriptionSection";
import { ComponentDescription } from "./parseDescription";
import { GroupingMode } from "../types";

export function appendToStickerSheetPage(
  stickerSheetPage: PageNode,
  stickerFrame: FrameNode,
  element: ComponentNode | ComponentSetNode,
  raster: FrameNode,
  description: ComponentDescription,
  groupingMode: GroupingMode = "section",
  sourcePageName?: string,
) {
  figma.currentPage = stickerSheetPage;

  addToIndex(stickerSheetPage, element.name, stickerFrame, raster);

  if (groupingMode === "none") {
    // No grouping - organize by source page:
    // - Horizontal: elements from the same page
    // - Vertical: groups from different pages
    const flatContainer = findOrCreateFlatContainer();
    const pageRow = findOrCreatePageRow(
      flatContainer,
      sourcePageName ?? "Unknown page",
    );
    pageRow.appendChild(stickerFrame);
  } else {
    // Group by section or page
    const sectionName =
      groupingMode === "page"
        ? (sourcePageName ?? "Unknown page")
        : findDescriptionSection("🗂️", description, "Unknown section");
    const currentSectionFrame = findOrCreateCurrentSectionFrame(sectionName);
    currentSectionFrame.appendChild(stickerFrame);
  }
}

function findOrCreateFlatContainer(): FrameNode {
  let flatContainer = figma.currentPage.findChild(
    (frame) => frame.name === "All Stickers",
  );
  if (!flatContainer) {
    // Vertical container to stack page rows
    flatContainer = buildAutoLayoutFrame(
      "All Stickers",
      "VERTICAL",
      24,
      24,
      24,
    );
    (flatContainer as FrameNode).fills = [];
    figma.currentPage.appendChild(flatContainer);
    placeResultTopRight(flatContainer as FrameNode, figma.currentPage);
  }
  return flatContainer as FrameNode;
}

function findOrCreatePageRow(
  container: FrameNode,
  pageName: string,
): FrameNode {
  // Look for existing row for this page
  const existingRow = container.findChild(
    (node): node is FrameNode =>
      node.type === "FRAME" && node.name === `Row: ${pageName}`,
  );

  if (existingRow) {
    return existingRow;
  }

  // Create new horizontal row for this page
  const pageRow = buildAutoLayoutFrame(
    `Row: ${pageName}`,
    "HORIZONTAL",
    24,
    24,
    24,
  );
  pageRow.fills = SECTION_FILL;
  pageRow.cornerRadius = 56;
  container.appendChild(pageRow);

  return pageRow;
}

function findOrCreateAllSectionsFrame() {
  let allSectionsFrame = figma.currentPage.findChild(
    (frame) => frame.name === "Sections",
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
      node.type === "FRAME" && node.name === sectionName,
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
    24,
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
    24,
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
