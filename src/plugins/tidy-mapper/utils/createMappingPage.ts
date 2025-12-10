/// <reference types="@figma/plugin-typings" />

import { SliceData } from "../types";
import { buildAutoLayoutFrame } from "./buildAutoLayoutFrame";
import { LINK_COLOR, BORDER_COLOR } from "./constants";

/**
 * Load fonts required for mapping page text
 */
async function loadFontsAsync(textNodes: TextNode[]): Promise<void> {
  await Promise.all(
    textNodes.map((text) => {
      if (text.fontName !== figma.mixed) {
        return figma.loadFontAsync(text.fontName);
      }
      return Promise.resolve();
    }),
  );
}

/**
 * Creates the mapping page header with title
 */
async function buildTitle(name: string): Promise<FrameNode> {
  const title = figma.createText();
  await loadFontsAsync([title]);
  title.characters = `${name} Mapping`;
  title.fontSize = 80;

  const titleRow = buildAutoLayoutFrame("titleRow", "HORIZONTAL", 0, 0, 0);
  titleRow.appendChild(title);
  titleRow.counterAxisAlignItems = "CENTER";
  titleRow.primaryAxisAlignItems = "SPACE_BETWEEN";

  return titleRow;
}

/**
 * Creates the top-level mapping frame for a specific name
 */
export async function buildTopLevelFrame(name: string): Promise<FrameNode> {
  const frame = buildAutoLayoutFrame(
    `${name} mapping`,
    "VERTICAL",
    80,
    80,
    120,
  );
  frame.fills = [];

  const title = await buildTitle(name);
  frame.appendChild(title);

  const content = buildAutoLayoutFrame("content", "VERTICAL", 0, 0, 40);
  frame.appendChild(content);

  return frame;
}

/**
 * Creates a hyperlink text node pointing to a trail marker
 */
async function buildLinkText(frame: FrameNode): Promise<TextNode> {
  const link = frame.id;
  const text = figma.createText();
  await loadFontsAsync([text]);
  text.characters = "🔗 Link";
  text.fills = [
    {
      type: "SOLID",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      color: LINK_COLOR,
    },
  ];
  text.hyperlink = { type: "NODE", value: `${link}` };
  return text;
}

/**
 * Creates a mapping row containing the rasterized image and link
 */
export async function buildFrameWithLink(
  rastersWithLinks: SliceData[],
): Promise<FrameNode[]> {
  const framesWithLinks: FrameNode[] = [];

  await Promise.all(
    rastersWithLinks.map(async (sliceData) => {
      const raster = sliceData.raster;
      const trail = sliceData.trail;

      // Rename slices starting with "Slice" to "Other"
      if (raster.name.startsWith("Slice")) {
        raster.name = "Other";
      }

      if (!(trail.type === "FRAME" || raster.type === "FRAME")) {
        return;
      }

      const frame = buildAutoLayoutFrame(
        `${raster.name}`,
        "HORIZONTAL",
        0,
        0,
        16,
      );

      const wrapper = buildAutoLayoutFrame("wrapper", "VERTICAL", 40, 40, 0);
      wrapper.appendChild(raster);

      wrapper.strokes = [
        {
          type: "SOLID",
          visible: true,
          opacity: 1,
          blendMode: "NORMAL",
          color: BORDER_COLOR,
        },
      ];
      wrapper.cornerRadius = 4;
      wrapper.dashPattern = [2, 2];

      const link = await buildLinkText(trail);
      frame.appendChild(wrapper);
      frame.appendChild(link);
      frame.counterAxisAlignItems = "CENTER";

      framesWithLinks.push(frame);
    }),
  );

  return framesWithLinks;
}

/**
 * Creates a numbered row for the mapping page
 */
function createRow(frame: FrameNode, contentFrame: FrameNode): FrameNode {
  const row = buildAutoLayoutFrame("row", "HORIZONTAL", 0, 0, 56);
  const number = figma.createText();

  // Get current row count for numbering
  const currentCount = contentFrame.children.length;
  number.characters = `${currentCount + 1}`;
  number.fontSize = 48;

  row.appendChild(number);
  row.appendChild(frame);
  row.counterAxisAlignItems = "CENTER";

  return row;
}

/**
 * Appends processed frames to their respective mapping pages
 */
export async function appendFramesToPage(frames: FrameNode[]): Promise<void> {
  const namesSet = new Set(frames.map((frame) => frame.name));
  const namesArray = Array.from(namesSet);

  for (const name of namesArray) {
    const foundFrames = frames.filter((frame) => frame.name === name);

    // Find or create page for this name
    let foundPage = figma.root.findChild(
      (node) => node.type === "PAGE" && node.name === name,
    ) as PageNode | null;

    if (!foundPage) {
      const page = figma.createPage();
      page.name = foundFrames[0].name;
      foundPage = page;
    }

    // Find or create mapping frame
    let mappingFrame = foundPage.findChild(
      (node) => node.type === "FRAME" && node.name.endsWith("mapping"),
    ) as FrameNode | null;

    if (!mappingFrame) {
      mappingFrame = await buildTopLevelFrame(foundFrames[0].name);
      foundPage.appendChild(mappingFrame);
    }

    if (!(mappingFrame && mappingFrame.type === "FRAME")) {
      continue;
    }

    // Set white background
    mappingFrame.fills = [
      {
        type: "SOLID",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        color: { r: 1, g: 1, b: 1 },
      },
    ];

    // Find content frame
    const contentFrame = mappingFrame.findChild(
      (node) => node.type === "FRAME" && node.name === "content",
    ) as FrameNode | null;

    if (!(contentFrame && contentFrame.type === "FRAME")) {
      continue;
    }

    // Add each frame as a numbered row
    foundFrames.forEach((frame) => {
      if (!mappingFrame || mappingFrame.type !== "FRAME") {
        return;
      }
      const row = createRow(frame, contentFrame);
      contentFrame.appendChild(row);
    });
  }
}
