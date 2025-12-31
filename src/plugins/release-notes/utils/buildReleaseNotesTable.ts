import type { Sprint, ReleaseNote } from "../types";
import { TAG_RGB_COLORS } from "./constants";
import { findParentPage } from "./componentSetHelpers";

export function getOrCreateReleaseNotesPage(figma: PluginAPI): PageNode {
  const existing = figma.root.children.find(
    (child) => child.type === "PAGE" && child.name === "Release notes",
  ) as PageNode | undefined;

  if (existing) {
    return existing;
  }

  const page = figma.createPage();
  page.name = "Release notes";
  return page;
}

export function getOrCreateReleaseNotesFrame(
  figma: PluginAPI,
  page: PageNode,
): FrameNode {
  const existing = page.children.find(
    (child) => child.type === "FRAME" && child.name === "release-notes-frame",
  ) as FrameNode | undefined;

  if (existing) {
    return existing;
  }

  const frame = figma.createFrame();
  frame.name = "release-notes-frame";
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = 20;
  frame.paddingTop = 0;
  frame.paddingRight = 0;
  frame.paddingBottom = 0;
  frame.paddingLeft = 0;
  frame.x = 0;
  frame.y = 0;

  page.appendChild(frame);
  return frame;
}

export function getOrCreateComponentReleaseNotesFrame(
  figma: PluginAPI,
  componentSet: ComponentSetNode,
): FrameNode {
  const page = findParentPage(componentSet);
  if (!page) {
    throw new Error("Component set has no parent page");
  }

  const frameName = `${componentSet.name}-release-notes`;
  const existing = page.children.find(
    (child) => child.type === "FRAME" && child.name === frameName,
  ) as FrameNode | undefined;

  if (existing) {
    return existing;
  }

  const frame = figma.createFrame();
  frame.name = frameName;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = 20;
  frame.paddingTop = 0;
  frame.paddingRight = 0;
  frame.paddingBottom = 0;
  frame.paddingLeft = 0;

  page.appendChild(frame);
  return frame;
}

export async function buildSprintNotesTable(
  figma: PluginAPI,
  sprint: Sprint,
  notes: ReleaseNote[],
): Promise<FrameNode> {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  const table = figma.createFrame();
  table.name = `Release notes – ${sprint.name}`;
  table.layoutMode = "VERTICAL";
  table.primaryAxisSizingMode = "AUTO";
  table.counterAxisSizingMode = "AUTO";
  table.itemSpacing = 8;

  // Header row: sprint name + publish date
  const headerRow = figma.createFrame();
  headerRow.layoutMode = "HORIZONTAL";
  headerRow.primaryAxisSizingMode = "AUTO";
  headerRow.counterAxisSizingMode = "AUTO";
  headerRow.itemSpacing = 16;

  const headerText = figma.createText();
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  headerText.characters = `${sprint.name} – ${formattedDate}`;
  headerText.fontName = { family: "Inter", style: "Bold" };

  headerRow.appendChild(headerText);
  table.appendChild(headerRow);

  // Note rows, newest first
  const sortedNotes = [...notes].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const note of sortedNotes) {
    const row = figma.createFrame();
    row.layoutMode = "HORIZONTAL";
    row.primaryAxisSizingMode = "AUTO";
    row.counterAxisSizingMode = "AUTO";
    row.itemSpacing = 16;

    // Date of adding note
    const dateText = figma.createText();
    dateText.fontName = { family: "Inter", style: "Regular" };
    dateText.characters = new Date(note.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // Component name with hyperlink
    const componentText = figma.createText();
    componentText.fontName = { family: "Inter", style: "Regular" };
    componentText.characters = note.componentSetName;
    componentText.fills = [
      {
        type: "SOLID",
        color: { r: 0x97 / 255, g: 0x47 / 255, b: 0xff / 255 },
      },
    ];

    componentText.setRangeHyperlink(0, componentText.characters.length, {
      type: "NODE",
      value: note.componentSetId,
    });

    // Tag
    const tagText = figma.createText();
    tagText.fontName = { family: "Inter", style: "Regular" };
    tagText.characters = note.tag;
    const tagColor = TAG_RGB_COLORS[note.tag] || { r: 0, g: 0, b: 0 };
    tagText.fills = [{ type: "SOLID", color: tagColor }];

    // Description
    const descriptionText = figma.createText();
    descriptionText.fontName = { family: "Inter", style: "Regular" };
    descriptionText.characters = note.description;

    // Author
    const authorText = figma.createText();
    authorText.fontName = { family: "Inter", style: "Regular" };
    authorText.characters = note.authorName;

    row.appendChild(dateText);
    row.appendChild(componentText);
    row.appendChild(tagText);
    row.appendChild(descriptionText);
    row.appendChild(authorText);

    table.appendChild(row);
  }

  return table;
}

export async function publishSprintNotes(
  figma: PluginAPI,
  sprint: Sprint,
): Promise<void> {
  if (!sprint || sprint.notes.length === 0) {
    return;
  }

  const page = getOrCreateReleaseNotesPage(figma);
  const frame = getOrCreateReleaseNotesFrame(figma, page);

  const table = await buildSprintNotesTable(figma, sprint, sprint.notes);

  if (frame.children.length === 0) {
    frame.appendChild(table);
  } else {
    frame.insertChild(0, table);
  }

  // Build per-component tables
  const notesByComponentSet = new Map<string, ReleaseNote[]>();
  for (const note of sprint.notes) {
    const existing = notesByComponentSet.get(note.componentSetId) || [];
    existing.push(note);
    notesByComponentSet.set(note.componentSetId, existing);
  }

  for (const entry of Array.from(notesByComponentSet.entries())) {
    const componentSetId = entry[0];
    const notes = entry[1];
    const node = figma.getNodeById(componentSetId);
    if (!node || node.type !== "COMPONENT_SET") {
      continue;
    }

    const componentSet = node as ComponentSetNode;
    const componentFrame = getOrCreateComponentReleaseNotesFrame(
      figma,
      componentSet,
    );
    const componentTable = await buildSprintNotesTable(figma, sprint, notes);

    if (componentFrame.children.length === 0) {
      componentFrame.appendChild(componentTable);
    } else {
      componentFrame.insertChild(0, componentTable);
    }

    // Position the frame to the left of the component set, aligned by top, with 100px gap
    componentFrame.x = componentSet.x - componentFrame.width - 100;
    componentFrame.y = componentSet.y;
  }

  // Navigate to the aggregated table
  figma.currentPage = page;
  figma.viewport.scrollAndZoomIntoView([frame]);
}
