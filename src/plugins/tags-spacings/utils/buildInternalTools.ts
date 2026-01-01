/// <reference types="@figma/plugin-typings" />

import { INTERNAL_TOOLS_PAGE } from "./constants";
import { buildTagComponents } from "./buildTagComponents";
import { buildSizeMarkers } from "./buildSizeMarkers";
import { buildSpacingMarkers } from "./buildSpacingMarkers";
import { getColorStyles } from "./colorStyles";

interface BuildResult {
  success: boolean;
  message: string;
  action: "created" | "replaced";
  componentCount: number;
}

async function loadFonts() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
}

async function buildInternalTools(): Promise<BuildResult> {
  try {
    await loadFonts();

    const existingPage = figma.root.findChild(
      (node) => node.name === INTERNAL_TOOLS_PAGE,
    ) as PageNode;

    const action = existingPage ? "replaced" : "created";

    if (existingPage) {
      existingPage.remove();
    }

    const toolsPage = figma.createPage();
    toolsPage.name = INTERNAL_TOOLS_PAGE;

    buildTagComponents();
    buildSizeMarkers();
    buildSpacingMarkers();

    const colors = getColorStyles();
    const versionText = figma.createText();
    versionText.name = "tools-version";
    versionText.characters = `Internal tools page. Version 1.0.0 - ${new Date().toLocaleDateString()}`;
    versionText.fontSize = 12;
    versionText.fontName = { family: "Inter", style: "Regular" };
    versionText.fillStyleId = colors.dsGray900.id;
    versionText.x = 0;
    versionText.y = 0;
    toolsPage.appendChild(versionText);
    versionText.locked = true;

    const warningText = figma.createText();
    warningText.name = "warning";
    warningText.characters =
      "don't change components names, properties names or values names on this page!!!!!";
    warningText.fontSize = 12;
    warningText.fontName = { family: "Inter", style: "Bold" };
    warningText.fillStyleId = colors.dsGray900.id;
    warningText.x = 0;
    warningText.y = 20;
    toolsPage.appendChild(warningText);
    warningText.locked = true;

    return {
      success: true,
      message: `Internal tools page ${action} successfully`,
      action,
      componentCount: 3,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to build internal tools: ${error}`,
      action: "created",
      componentCount: 0,
    };
  }
}

export { buildInternalTools };
