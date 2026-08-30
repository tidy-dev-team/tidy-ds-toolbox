/// <reference types="@figma/plugin-typings" />

import {
  ApplyPackPayload,
  ApplyUnpackPayload,
  OffBoardingAction,
  OffBoardingResult,
  PageInfo,
  PlanPackPayload,
} from "./types";
import {
  createCancellationToken,
  yieldToMain,
} from "../../shared/cancellation";
import { describeFonts, loadFontsUnder, type FontRef } from "./fonts";
import {
  collectInventory,
  isOurTempPage,
  markAsOurTempPage,
  PACKED_FRAME_PAGE_NAME_KEY,
  writeManifest,
} from "./collect";
import {
  describePlan,
  PackPlan,
  planPack,
  planUnpack,
  TEMP_PAGE_NAME,
  UnpackPlan,
} from "./plan";

/**
 * The temporary page named by a plan, or null.
 *
 * Ownership is re-checked here and not taken from the plan, because the plan was
 * built before the designer confirmed it and a page can have been renamed,
 * removed or replaced in between. A page that is no longer ours is not cleared.
 */
function resolvePlannedTempPage(plan: PackPlan): PageNode | null {
  if (plan.tempPage.action === "create") {
    const page = figma.createPage();
    page.name = TEMP_PAGE_NAME;
    markAsOurTempPage(page);
    figma.root.insertChild(figma.root.children.length, page);
    return page;
  }

  const wanted = plan.tempPage.id;
  const existing = figma.root.children.find((page) => page.id === wanted);
  if (!existing || !isOurTempPage(existing)) return null;
  return existing;
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

const FIGMA_MAX_Y = 60000; // Safe max Y to stay within pasteboard
const FIGMA_MIN_Y = -60000; // Safe min Y to stay within pasteboard
const COLUMN_SPACING = 200; // Spacing between columns

function arrangeFramesInGrid(frames: Array<FrameNode>, spacing: number): void {
  if (frames.length === 0) return;

  // Find the widest frame to determine column width
  let maxWidth = 0;
  for (const frame of frames) {
    if (frame.width > maxWidth) {
      maxWidth = frame.width;
    }
  }
  const columnWidth = maxWidth + COLUMN_SPACING;

  let currentColumn = 0;
  let currentY = FIGMA_MIN_Y;

  for (const frame of frames) {
    // Check if this frame would exceed the available height
    if (currentY + frame.height > FIGMA_MAX_Y && currentY !== FIGMA_MIN_Y) {
      // Move to next column
      currentColumn++;
      currentY = FIGMA_MIN_Y;
    }

    frame.x = currentColumn * columnWidth;
    frame.y = currentY;
    currentY += frame.height + spacing;
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
  return collectInventory().pages.map((page) => ({
    id: page.id,
    name: page.name,
  }));
}

/** A page that could not be packed, kept so the run can name it instead of dying on it. */
interface SkippedPage {
  name: string;
  unloadableFonts: FontRef[];
  reason: string;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeSkippedPages(skipped: ReadonlyArray<SkippedPage>): string {
  const parts = skipped.map((skip) =>
    skip.unloadableFonts.length > 0
      ? `"${skip.name}" (${describeFonts(skip.unloadableFonts)} not available on this machine)`
      : `"${skip.name}" (${skip.reason})`,
  );
  return `Could not finish ${skipped.length} page${skipped.length === 1 ? "" : "s"}: ${parts.join("; ")}.`;
}

// #167: the token backing pack-pages' stop control. Recreated at the start
// of each pack so an earlier cancellation doesn't leak into the next one.
let packToken = createCancellationToken();

async function packPages(plan: PackPlan): Promise<OffBoardingResult> {
  packToken = createCancellationToken();

  // Re-resolved rather than carried: the plan holds ids the designer confirmed,
  // and a page can have been removed while the dialog was open.
  const sourcePages = plan.pages
    .map((planned) => figma.root.children.find((p) => p.id === planned.id))
    .filter((page): page is PageNode => page !== undefined);

  if (sourcePages.length === 0) {
    return {
      success: false,
      message: "None of the pages in this plan are still in the file.",
    };
  }

  const tempPage = resolvePlannedTempPage(plan);
  if (tempPage === null) {
    return {
      success: false,
      message: `The page named "${TEMP_PAGE_NAME}" is no longer the one this plan was built for, so nothing was cleared. Try packing again.`,
    };
  }

  clearPage(tempPage);
  figma.currentPage = tempPage;

  const frames: Array<FrameNode> = [];
  const skipped: Array<SkippedPage> = [];
  // Not frames.length: a skipped page is finished with, but produced no frame.
  let processed = 0;

  const buildStoppedResult = (): OffBoardingResult => {
    const remainingPageNames = sourcePages.slice(processed).map((p) => p.name);

    if (frames.length > 0) {
      arrangeFramesInGrid(frames, 200);
      figma.currentPage.selection = frames;
      figma.viewport.scrollAndZoomIntoView(frames);
    }

    const stoppedMessage = `Stopped by you after packing ${frames.length} of ${sourcePages.length} page${sourcePages.length === 1 ? "" : "s"}.`;

    return {
      success: true,
      message:
        skipped.length > 0
          ? `${stoppedMessage} ${describeSkippedPages(skipped)}`
          : stoppedMessage,
      count: frames.length,
      stopped: true,
      remainingPageNames,
    };
  };

  for (const page of sourcePages) {
    if (packToken.isCancelled) {
      return buildStoppedResult();
    }

    // Cloning a page moves its text nodes under a new parent, and Figma rejects
    // that for any font it has not loaded - the fault behind the reported
    // "in appendChild: unloaded font" (see fonts.ts). Loading is best effort:
    // a font missing from this machine cannot be loaded at all, and the run
    // reports it by name instead of failing with Figma's blank-font message.
    const unloadableFonts = await loadFontsUnder([page]);

    const frame = figma.createFrame();
    frame.name = page.name;
    frame.setPluginData(PACKED_FRAME_PAGE_NAME_KEY, page.name);

    tempPage.appendChild(frame);

    try {
      cloneTopLevelNodesIntoFrame(page, frame);
      frames.push(frame);
    } catch (error) {
      // Leave no half-packed frame behind: it would look packed and unpack wrong.
      frame.remove();
      skipped.push({
        name: page.name,
        unloadableFonts,
        reason: errorText(error),
      });
    }

    processed += 1;

    // Yield so a "cancel-pack" message sent while this loop is running has
    // a chance to be processed before the next page starts.
    await yieldToMain();
  }

  // A stop requested while the last page's yield was pending arrives here,
  // after the loop already exited — check again before treating the run as
  // a plain success, so that request is still honoured (#167).
  if (packToken.isCancelled) {
    return buildStoppedResult();
  }

  if (frames.length === 0) {
    return {
      success: false,
      message: `Packed no pages. ${describeSkippedPages(skipped)}`,
      count: 0,
    };
  }

  arrangeFramesInGrid(frames, 200);

  figma.currentPage.selection = frames;
  figma.viewport.scrollAndZoomIntoView(frames);

  // Stored WITH the packed content, so unpack in a different file still knows
  // the original page names rather than reading them off the frames.
  writeManifest(tempPage, {
    version: 1,
    packedAt: new Date().toISOString(),
    pages: frames.map((frame) => ({
      name: frame.getPluginData(PACKED_FRAME_PAGE_NAME_KEY) || frame.name,
    })),
  });

  const packedMessage = `Packed ${frames.length} page${frames.length === 1 ? "" : "s"} into ${TEMP_PAGE_NAME}. Copy selection (Cmd/Ctrl+C).`;

  return {
    success: true,
    message:
      skipped.length > 0
        ? `${packedMessage} ${describeSkippedPages(skipped)}`
        : packedMessage,
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

async function unpackPages(plan: UnpackPlan): Promise<OffBoardingResult> {
  // Never a fallback to the current page. That fallback is what took a working
  // page apart when a designer deleted the temporary page by hand and clicked
  // Unpack to undo. Ownership is re-checked here rather than trusted from the
  // plan, because the plan was built before the designer confirmed it.
  const sourcePage = figma.root.children.find(
    (page) => page.id === plan.tempPageId,
  );

  if (sourcePage === undefined || !isOurTempPage(sourcePage)) {
    return {
      success: false,
      message:
        "The packed page this plan was built for is gone, so nothing was taken apart. Try unpacking again.",
    };
  }

  if (figma.currentPage.id !== sourcePage.id) {
    figma.currentPage = sourcePage;
  }

  const frames = sourcePage.children.filter(
    (node): node is FrameNode => node.type === "FRAME",
  );

  if (frames.length === 0) {
    return {
      success: false,
      message: `No packed frames found on page "${sourcePage.name}".`,
    };
  }

  // Restoring moves text out of the packed frames onto new pages, which Figma
  // rejects for unloaded fonts exactly as packing does. A file packed on one
  // machine is often unpacked on another, so this is the more likely half to
  // meet a font the machine does not have; those are named, not swallowed.
  const unloadableFonts = await loadFontsUnder(frames);

  let createdPagesCount = 0;
  const skipped: Array<SkippedPage> = [];

  for (const [index, frame] of frames.entries()) {
    // The plan's names are what the confirmation promised, so they are what is
    // restored. The frame's own record is the fallback for a frame the plan does
    // not reach, which means the packed page changed after the plan was built.
    const pageName =
      plan.pageNames[index] ||
      frame.getPluginData(PACKED_FRAME_PAGE_NAME_KEY) ||
      frame.name;

    const page = figma.createPage();
    page.name = pageName;
    figma.root.insertChild(figma.root.children.length, page);

    try {
      const children = [...frame.children];
      for (const child of children) {
        restoreSectionsRecursively(child, page);
      }
    } catch (error) {
      // Both halves are kept: the new page holds what was already restored, the
      // packed frame holds the rest. Nothing is copied here, only moved, so
      // keeping both loses nothing - whereas removing the page would delete the
      // designer's own content along with it.
      skipped.push({
        name: pageName,
        unloadableFonts,
        reason: errorText(error),
      });
      continue;
    }

    frame.remove();
    createdPagesCount += 1;
  }

  if (createdPagesCount === 0) {
    return {
      success: false,
      message: `Unpacked no pages. ${describeSkippedPages(skipped)}`,
      count: 0,
    };
  }

  figma.currentPage = figma.root.children[figma.root.children.length - 1];

  const unpackedMessage = `Unpacked ${createdPagesCount} page${createdPagesCount === 1 ? "" : "s"}.`;

  return {
    success: true,
    message:
      skipped.length > 0
        ? `${unpackedMessage} ${describeSkippedPages(skipped)}`
        : unpackedMessage,
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

type NodeWithGridStyleId = SceneNode & {
  gridStyleId?: string;
};

function hasGridStyleId(node: SceneNode): boolean {
  const candidate = node as NodeWithGridStyleId;
  if (candidate.gridStyleId === undefined || candidate.gridStyleId === "") {
    return false;
  }
  return true;
}

function collectNodesWithGridStyles(
  nodes: ReadonlyArray<SceneNode>,
): Array<SceneNode> {
  const matches: Array<SceneNode> = [];
  const stack: Array<SceneNode> = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (hasGridStyleId(node)) {
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

function findHiddenStyles(): OffBoardingResult {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      success: false,
      message: "Select at least one node to scan for hidden styles.",
    };
  }

  const matches = collectNodesWithGridStyles(selection);

  if (matches.length === 0) {
    return {
      success: true,
      message: "No hidden layout grid styles found in selection.",
      count: 0,
    };
  }

  figma.currentPage.selection = matches;
  figma.viewport.scrollAndZoomIntoView(matches);

  return {
    success: true,
    message: `Found ${matches.length} node${matches.length === 1 ? "" : "s"} with hidden layout grid styles.`,
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

    case "plan-pack": {
      const ids = (payload as PlanPackPayload)?.pageIds ?? [];
      const plan = planPack(collectInventory(), ids);
      return plan.ok
        ? { success: true, message: describePlan(plan), plan }
        : { success: false, message: plan.message, refusalCode: plan.code };
    }

    case "plan-unpack": {
      const plan = planUnpack(collectInventory());
      return plan.ok
        ? { success: true, message: describePlan(plan), plan }
        : { success: false, message: plan.message, refusalCode: plan.code };
    }

    case "pack-pages": {
      const plan = (payload as ApplyPackPayload)?.plan;
      if (!plan || plan.kind !== "pack") {
        return { success: false, message: "Pack was asked for with no plan." };
      }
      return await packPages(plan);
    }

    case "unpack-pages": {
      const plan = (payload as ApplyUnpackPayload)?.plan;
      if (!plan || plan.kind !== "unpack") {
        return {
          success: false,
          message: "Unpack was asked for with no plan.",
        };
      }
      return await unpackPages(plan);
    }

    case "find-bound-variables":
      return findBoundVariables();

    case "find-hidden-styles":
      return findHiddenStyles();

    case "cancel-pack":
      packToken.cancel();
      return { success: true, message: "Cancelling…", stopped: true };

    default:
      return {
        success: false,
        message: `Unknown off-boarding action: ${action}`,
      };
  }
}
