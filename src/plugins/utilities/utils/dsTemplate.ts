/// <reference types="@figma/plugin-typings" />

import { UtilityResult } from "../types";

/**
 * DS Template - Build a template for an empty Design System file
 * Creates pages, frames with headers based on DS structure
 */

// Page names for DS template
const DS_PAGES = [
  "⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯",
  "🟣 ---> Start Here",
  "🟣 ---> Stickersheet",
  "🟣 ---> Dev cheat sheet",
  "🕐 Waiting Room",
  "⎯⎯⎯⎯ 🛠 Foundation ⎯⎯⎯⎯",
  "     ↪ 🟣 Breakpoints",
  "     ↪ 🟣 Colors",
  "     ↪ 🟣 Elevation",
  "     ↪ 🟣 Icons",
  "     ↪ 🟣 Illustrations",
  "     ↪ 🟣 Layout",
  "     ↪ 🟣 Logo",
  "     ↪ 🟣 Naming",
  "     ↪ 🟣 Rounded corners",
  "     ↪ 🟣 Spacing and Grids",
  "     ↪ 🟣 Tokens",
  "     ↪ 🟣 Typography",
  "⎯⎯⎯⎯ 🧰 Components ⎯⎯⎯⎯",
  "🟣 Alert",
  "🟣 Action Bar",
  "🟣 Avatar",
  "🟣 Background",
  "🟣 Border",
  "🟣 Buttons",
  "🟣 Checkbox",
  "🟣 Cards",
  "🟣 Date Picker",
  "🟣 Dropdown",
  "🟣 Filter bar",
  "🟣 Header",
  "🟣 Input",
  "🟣 KPI",
  "🟣 List",
  "🟣 Menu",
  "🟣 Modal (Dialogue)",
  "🟣 Panels",
  "🟣 Pagination",
  "🟣 Pop-up",
  "🟣 Radio Button",
  "🟣 Scroll Bar",
  "🟣 Search",
  "🟣 Side Menu (Nav)",
  "🟣 Slider",
  "🟣 Slot",
  "🟣 Snackbar",
  "🟣 Status",
  "🟣 Steps",
  "🟣 Table",
  "🟣 Tabs",
  "🟣 Tags (Chip)",
  "🟣 Text editor",
  "🟣 Toast",
  "🟣 Toggle",
  "🟣 Toolbar",
  "🟣 Tooltips",
  "⎯⎯⎯⎯ 🖥 Patterns / sections ⎯⎯⎯⎯",
  "🟣 Templates",
  "⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯",
  "❖ .Admin components",
  ".Archive",
  "🗺 Mapping",
  "🟣 Cover",
  "⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯",
];

// Color constants (hex values as RGB 0-1)
const COLORS = {
  // Header orange: #FC5000
  headerOrange: { r: 0.9882352948188782, g: 0.3137255012989044, b: 0 },
  // Internal tools red: #A60404
  internalToolsRed: {
    r: 0.6509804129600525,
    g: 0.01568627543747425,
    b: 0.01568627543747425,
  },
  // White
  white: { r: 1, g: 1, b: 1 },
};

/**
 * Clean page name for display (remove emojis and arrows)
 */
function cleanPageName(name: string): string {
  return name
    .replace(/[\W_]+/g, " ")
    .trim()
    .replace(/^\s*/, "");
}

/**
 * Check if page name is a separator (not a real page)
 */
function isSeparator(name: string): boolean {
  return name.startsWith("⎯") || name.startsWith("⋯");
}

/**
 * Check if page is a foundation subpage (should have fewer frames)
 */
function isFoundationSubpage(name: string): boolean {
  return name.startsWith("     ↪");
}

/**
 * Create a single frame with specified properties
 */
function createFrame(
  name: string,
  width: number,
  height: number,
  x: number,
  y: number,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);
  frame.x = x;
  frame.y = y;
  return frame;
}

/**
 * Create header component for a page
 */
async function createHeader(
  pageName: string,
): Promise<{ component: ComponentNode; text: TextNode }> {
  const header = figma.createComponent();
  header.name = "Header";
  header.fills = [{ type: "SOLID", color: COLORS.headerOrange }];

  const textElement = figma.createText();
  textElement.characters = cleanPageName(pageName).toUpperCase();
  textElement.fontSize = 82;
  textElement.fills = [{ type: "SOLID", color: COLORS.white }];
  textElement.textCase = "UPPER";
  textElement.fontName = { family: "Inter", style: "Bold" };

  header.appendChild(textElement);
  textElement.x = 50;
  textElement.y = 50;

  // Set up auto-layout
  header.layoutMode = "HORIZONTAL";
  header.counterAxisAlignItems = "CENTER";
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.paddingLeft = 100;
  header.paddingRight = 100;
  header.resize(3000, 200);

  return { component: header, text: textElement };
}

/**
 * Create frames for a page (Main, QA, Documentation, Mapping)
 */
function createPageFrames(page: PageNode): FrameNode[] {
  const isFoundation = isFoundationSubpage(page.name);
  const frameName = cleanPageName(page.name);

  const main = createFrame(frameName, 3000, 3000, 0, 0);
  const frames = [main];

  // Foundation subpages only get the Main frame
  if (!isFoundation) {
    const qa = createFrame("QA", 3000, 3000, 3080, 0);
    const docs = createFrame("Documentation", 3000, 3000, 6160, 0);
    const mapping = createFrame("Mapping", 3000, 3000, -3080, 0);
    frames.push(qa, docs, mapping);
  }

  return frames;
}

/**
 * Build pages from name list
 */
function buildPages(pageNames: string[]): PageNode[] {
  const pages: PageNode[] = [];

  for (const name of pageNames) {
    if (!isSeparator(name)) {
      const page = figma.createPage();
      page.name = name;
      pages.push(page);
    }
  }

  return pages;
}

/**
 * Build frames and headers for all pages
 */
async function buildFramesForPages(pages: PageNode[]): Promise<void> {
  // We'll create the header component on the first real page
  let headerComponent: ComponentNode | null = null;

  for (const page of pages) {
    const frames = createPageFrames(page);

    // Append frames to page
    for (const frame of frames) {
      page.appendChild(frame);
    }

    // Create or use header
    if (!headerComponent) {
      const { component } = await createHeader(page.name);
      headerComponent = component;
      page.appendChild(headerComponent);
    }

    // Add header instances to frames
    const mainFrame = frames[0];
    if (mainFrame) {
      const headerInstance = headerComponent.createInstance();
      headerInstance.children.forEach((child) => {
        if (child.type === "TEXT") {
          (child as TextNode).characters = cleanPageName(page.name);
        }
      });
      mainFrame.appendChild(headerInstance);
      headerInstance.constraints = { horizontal: "STRETCH", vertical: "MIN" };
    }

    // Add headers to other frames
    for (let i = 1; i < frames.length; i++) {
      const frame = frames[i];
      const headerInstance = headerComponent.createInstance();
      headerInstance.children.forEach((child) => {
        if (child.type === "TEXT") {
          (child as TextNode).characters = frame.name;
        }
      });
      frame.appendChild(headerInstance);
      headerInstance.constraints = { horizontal: "STRETCH", vertical: "MIN" };
    }
  }
}

/**
 * Load required fonts
 */
async function loadFonts(): Promise<void> {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
}

/**
 * Main function to run DS Template utility
 */
export async function runDsTemplate(): Promise<UtilityResult> {
  try {
    // Load fonts first
    await loadFonts();

    // Build pages
    const pages = buildPages(DS_PAGES);

    if (pages.length === 0) {
      return {
        success: false,
        message: "No pages were created",
      };
    }

    // Build frames and headers for each page
    await buildFramesForPages(pages);

    return {
      success: true,
      message: `DS Template created with ${pages.length} pages`,
      count: pages.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to create DS Template: ${errorMessage}`,
    };
  }
}
