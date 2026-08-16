/// <reference types="@figma/plugin-typings" />

import { UtilityResult } from "../types";
import {
  createCancellationToken,
  runUntilCancelled,
  type CancellationToken,
} from "../../../shared/cancellation";

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
 * Stamp one page in full: create it, furnish it with frames, and put a header
 * on each frame.
 *
 * A whole page is the unit of work, and that is what makes the run stoppable
 * (#184). The build used to run in two phases - every page created empty, then
 * every page furnished - which meant a run that stopped part way left a tail of
 * pages with nothing on them. Stamping one page completely before starting the
 * next means a stopped run leaves finished pages and no empty ones.
 *
 * The header component is created once, on the first page, and reused; it is
 * passed in and handed back rather than held in module state so the sharing is
 * visible at the call site.
 */
async function stampPage(
  name: string,
  sharedHeader: ComponentNode | null,
): Promise<{ page: PageNode; header: ComponentNode }> {
  const page = figma.createPage();
  page.name = name;

  const frames = createPageFrames(page);
  for (const frame of frames) {
    page.appendChild(frame);
  }

  let header = sharedHeader;
  if (!header) {
    const created = await createHeader(name);
    header = created.component;
    page.appendChild(header);
  }

  const mainFrame = frames[0];
  if (mainFrame) {
    const headerInstance = header.createInstance();
    headerInstance.children.forEach((child) => {
      if (child.type === "TEXT") {
        (child as TextNode).characters = cleanPageName(name);
      }
    });
    mainFrame.appendChild(headerInstance);
    headerInstance.constraints = { horizontal: "STRETCH", vertical: "MIN" };
  }

  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const headerInstance = header.createInstance();
    headerInstance.children.forEach((child) => {
      if (child.type === "TEXT") {
        (child as TextNode).characters = frame.name;
      }
    });
    frame.appendChild(headerInstance);
    headerInstance.constraints = { horizontal: "STRETCH", vertical: "MIN" };
  }

  return { page, header };
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
 * What a run that stopped short should tell the designer, or null if it did
 * not stop short.
 *
 * The audience is the file's owner rather than the agent (#184). By the time a
 * run is asked to stop, the Bridge has already answered the caller that the
 * call timed out, so this sentence is the only account of what happened that
 * reaches anybody - and the pages are already on their canvas.
 *
 * It answers the three questions in order: how far did it get, what is in my
 * file now, and what happens if I run it again. The third matters most and is
 * the least obvious: this Operation is not idempotent, so the instinctive
 * re-run adds a second full template beside the partial one rather than
 * completing it.
 */
export function describeStoppedRun(
  stamped: number,
  total: number,
): string | null {
  if (stamped >= total) return null;
  return (
    `DS Template stopped after ${stamped} of ${total} pages. ` +
    `Those ${stamped} pages are still in the file and were not undone. ` +
    `Running it again stamps a whole new template beside them rather than ` +
    `filling in the missing ${total - stamped} - delete these ${stamped} first ` +
    `if you want one clean set.`
  );
}

/** The outcome of a template run, whether it finished or was stopped. */
export interface DsTemplateBuild {
  /** The pages actually stamped, each one complete. */
  pages: PageNode[];
  /** How many pages a full run stamps - the separators are not pages. */
  totalPages: number;
  /** Whether the run stopped before covering every page. */
  cancelled: boolean;
}

/**
 * Build the DS Template (fonts → pages, one complete page at a time) and
 * report what was stamped. Shared between the designer UI entrypoint
 * (`runDsTemplate`) and the MCP `tidy_ds_template_run` Operation.
 *
 * The token is optional and defaults to one nothing can cancel, so the
 * designer path - which has no Bridge and nobody to ask it to stop - behaves
 * exactly as it did. `runUntilCancelled` owns the check-and-yield pairing.
 */
export async function buildDsTemplate(
  token: CancellationToken = createCancellationToken(),
): Promise<DsTemplateBuild> {
  await loadFonts();
  const pageNames = DS_PAGES.filter((name) => !isSeparator(name));

  let header: ComponentNode | null = null;
  const { completed, cancelled } = await runUntilCancelled(
    pageNames,
    async (name) => {
      const stamped = await stampPage(name, header);
      header = stamped.header;
      return stamped.page;
    },
    token,
  );

  return { pages: completed, totalPages: pageNames.length, cancelled };
}

/**
 * Main function to run DS Template utility
 */
export async function runDsTemplate(): Promise<UtilityResult> {
  try {
    // No token: the panel button has no Bridge behind it and nobody to ask it
    // to stop, so this path is the uncancelled one by construction.
    const { pages } = await buildDsTemplate();
    if (pages.length === 0) {
      return { success: false, message: "No pages were created" };
    }
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
