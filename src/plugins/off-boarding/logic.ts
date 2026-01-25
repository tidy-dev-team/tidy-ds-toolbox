/// <reference types="@figma/plugin-typings" />

import {
  OffBoardingAction,
  OffBoardingResult,
  PackPagesPayload,
  PageInfo,
} from "./types";

const TEMP_PAGE_NAME = "__TCC_TEMP__";

function isTempPage(page: PageNode): boolean {
  return page.name.trim() === TEMP_PAGE_NAME;
}

function getOrCreateTempPage(): PageNode {
  const existingTempPage = figma.root.children.find((page) => isTempPage(page));
  if (existingTempPage !== undefined) {
    return existingTempPage;
  }
  const page = figma.createPage();
  page.name = TEMP_PAGE_NAME;
  figma.root.insertChild(figma.root.children.length, page);
  return page;
}

function clearPage(page: PageNode): void {
  const children = [...page.children];
  for (const child of children) {
    child.remove();
  }
}

function calculateBoundingBox(nodes: ReadonlyArray<SceneNode>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Clones a single node, handling SectionNodes specially.
 * Sections cannot be parented under frames, so we convert them to frames
 * and clone their children instead, preserving metadata for later restoration.
 */
function cloneNodeForPacking(
  node: SceneNode,
  targetFrame: FrameNode,
): SceneNode {
  if (node.type === "SECTION") {
    const sectionFrame = figma.createFrame();
    sectionFrame.name = node.name;
    sectionFrame.x = node.x;
    sectionFrame.y = node.y;
    sectionFrame.resize(node.width, node.height);

    sectionFrame.setPluginData("tcc:wasSection", "true");
    sectionFrame.setPluginData("tcc:sectionName", node.name);

    for (const child of node.children) {
      cloneNodeForPacking(child, sectionFrame);
    }

    targetFrame.appendChild(sectionFrame);
    return sectionFrame;
  } else {
    const cloned = node.clone();
    targetFrame.appendChild(cloned);
    return cloned;
  }
}

function cloneTopLevelNodesIntoFrame(
  sourcePage: PageNode,
  targetFrame: FrameNode,
): void {
  const clonedNodes: Array<SceneNode> = [];
  for (const node of sourcePage.children) {
    const cloned = cloneNodeForPacking(node, targetFrame);
    clonedNodes.push(cloned);
  }

  const bounds = calculateBoundingBox(clonedNodes);
  const padding = 50;

  for (const node of clonedNodes) {
    node.x = node.x - bounds.x + padding;
    node.y = node.y - bounds.y + padding;
  }

  targetFrame.resize(bounds.width + padding * 2, bounds.height + padding * 2);
}

function stackFramesVertically(
  frames: Array<FrameNode>,
  spacing: number,
): void {
  let y = 0;
  for (const frame of frames) {
    frame.x = 0;
    frame.y = y;
    y += frame.height + spacing;
  }
}

function isNodeWithChildren(
  node: SceneNode,
): node is SceneNode & ChildrenMixin {
  return "children" in node;
}

type NodeWithBoundVariables = SceneNode & {
  boundVariables?: Record<string, unknown>;
};

function hasBoundVariables(node: SceneNode): boolean {
  const candidate = node as NodeWithBoundVariables;
  if (candidate.boundVariables === undefined) {
    return false;
  }
  return Object.keys(candidate.boundVariables).length > 0;
}

function collectNodesWithBoundVariables(
  nodes: ReadonlyArray<SceneNode>,
): Array<SceneNode> {
  const matches: Array<SceneNode> = [];
  const stack: Array<SceneNode> = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (hasBoundVariables(node)) {
      matches.push(node);
    }
    if (isNodeWithChildren(node)) {
      for (const child of node.children) {
        stack.push(child);
      }
    }
  }

  return matches;
}

function getPagesList(): PageInfo[] {
  return figma.root.children
    .filter((page) => !isTempPage(page))
    .map((page) => ({ id: page.id, name: page.name }));
}

function packPages(pageIds: string[]): OffBoardingResult {
  const allPages = figma.root.children.filter((page) => !isTempPage(page));

  const sourcePages =
    pageIds.length > 0
      ? allPages.filter((page) => pageIds.includes(page.id))
      : allPages;

  if (sourcePages.length === 0) {
    return {
      success: false,
      message: "No pages selected to pack.",
    };
  }

  const tempPage = getOrCreateTempPage();
  clearPage(tempPage);
  figma.currentPage = tempPage;

  const frames: Array<FrameNode> = [];

  for (const page of sourcePages) {
    const frame = figma.createFrame();
    frame.name = page.name;
    frame.setPluginData("tcc:pageName", page.name);

    tempPage.appendChild(frame);

    cloneTopLevelNodesIntoFrame(page, frame);
    frames.push(frame);
  }

  stackFramesVertically(frames, 200);

  figma.currentPage.selection = frames;
  figma.viewport.scrollAndZoomIntoView(frames);

  return {
    success: true,
    message: `Packed ${frames.length} page${frames.length === 1 ? "" : "s"} into ${TEMP_PAGE_NAME}. Copy selection (Cmd/Ctrl+C).`,
    count: frames.length,
  };
}

/**
 * Recursively restores nodes that were originally sections.
 */
function restoreSectionsRecursively(
  node: SceneNode,
  targetParent: PageNode | SectionNode,
): void {
  if (
    node.type === "FRAME" &&
    node.getPluginData("tcc:wasSection") === "true"
  ) {
    const sectionName = node.getPluginData("tcc:sectionName") || node.name;

    const section = figma.createSection();
    section.name = sectionName;
    section.x = node.x;
    section.y = node.y;
    section.resizeWithoutConstraints(node.width, node.height);

    const children = [...node.children];
    for (const child of children) {
      restoreSectionsRecursively(child, section);
    }

    targetParent.appendChild(section);
    node.remove();
  } else {
    targetParent.appendChild(node);
  }
}

function unpackPages(): OffBoardingResult {
  let sourcePage: PageNode;
  const tempPage = figma.root.children.find((page) => isTempPage(page));

  if (tempPage === undefined) {
    sourcePage = figma.currentPage;
  } else {
    sourcePage = tempPage;
    if (figma.currentPage.id !== tempPage.id) {
      figma.currentPage = tempPage;
    }
  }

  const frames = sourcePage.children.filter(
    (node): node is FrameNode => node.type === "FRAME",
  );

  if (frames.length === 0) {
    return {
      success: false,
      message: `No top-level frames found on page "${sourcePage.name}".`,
    };
  }

  let createdPagesCount = 0;

  for (const frame of frames) {
    const pageName = frame.getPluginData("tcc:pageName") || frame.name;

    const page = figma.createPage();
    page.name = pageName;
    figma.root.insertChild(figma.root.children.length, page);

    const children = [...frame.children];
    for (const child of children) {
      restoreSectionsRecursively(child, page);
    }

    frame.remove();
    createdPagesCount += 1;
  }

  figma.currentPage = figma.root.children[figma.root.children.length - 1];

  return {
    success: true,
    message: `Unpacked ${createdPagesCount} page${createdPagesCount === 1 ? "" : "s"}.`,
    count: createdPagesCount,
  };
}

function findBoundVariables(): OffBoardingResult {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      success: false,
      message: "Select at least one node to scan for bound variables.",
    };
  }

  const matches = collectNodesWithBoundVariables(selection);

  if (matches.length === 0) {
    return {
      success: true,
      message: "No bound variables found in selection.",
      count: 0,
    };
  }

  figma.currentPage.selection = matches;
  figma.viewport.scrollAndZoomIntoView(matches);

  return {
    success: true,
    message: `Found ${matches.length} node${matches.length === 1 ? "" : "s"} with bound variables.`,
    count: matches.length,
  };
}

/**
 * Off-Boarding handler - processes messages from the UI
 */
export async function offBoardingHandler(
  action: string,
  payload: any,
  _figma?: PluginAPI,
): Promise<OffBoardingResult> {
  switch (action as OffBoardingAction) {
    case "get-pages":
      return {
        success: true,
        message: "Pages retrieved",
        pages: getPagesList(),
      };

    case "pack-pages":
      const packPayload = payload as PackPagesPayload;
      return packPages(packPayload?.pageIds || []);

    case "unpack-pages":
      return unpackPages();

    case "find-bound-variables":
      return findBoundVariables();

    default:
      return {
        success: false,
        message: `Unknown off-boarding action: ${action}`,
      };
  }
}
