import buildOneSticker from "./utils/buildOneSticker";
import {
  findAtomPages,
  findStickerSheetPage,
  getComponentsFromPage,
  getStickerSheetPage,
  getAllPages,
} from "./utils/findAtomPages";
import { loadFonts } from "./utils/loadFonts";
import { lockStickers } from "./utils/lockStickers";
import {
  StickerSheetBuilderAction,
  StickerSheetBuilderContext,
  StickerSheetBuilderResponse,
  StickerSheetConfig,
  BuildProgress,
  STICKER_SHEET_CONTEXT_EVENT,
  STICKER_SHEET_PROGRESS_EVENT,
  STICKER_SHEET_CONFIG_KEY,
  DEFAULT_STICKER_SHEET_CONFIG,
} from "./types";

let fontsLoaded = false;
let listenersRegistered = false;
let cancelRequested = false;

// Yield control back to the event loop to keep UI responsive
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Load config from plugin data
function loadConfig(): StickerSheetConfig {
  try {
    const stored = figma.root.getPluginData(STICKER_SHEET_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored) as StickerSheetConfig;
    }
  } catch (e) {
    console.error("Failed to load sticker sheet config:", e);
  }
  return DEFAULT_STICKER_SHEET_CONFIG;
}

// Save config to plugin data
function saveConfig(config: StickerSheetConfig): void {
  figma.root.setPluginData(STICKER_SHEET_CONFIG_KEY, JSON.stringify(config));
}

// Broadcast build progress to the UI
function broadcastProgress(
  current: number,
  total: number,
  componentName: string,
): void {
  const progress: BuildProgress = {
    current,
    total,
    currentComponentName: componentName,
  };
  figma.ui?.postMessage({
    type: STICKER_SHEET_PROGRESS_EVENT,
    payload: progress,
  });
}

export async function stickerSheetBuilderHandler(
  action: StickerSheetBuilderAction,
  payload?: any,
  _figma?: PluginAPI,
): Promise<StickerSheetBuilderResponse> {
  ensureEventListeners();

  switch (action) {
    case "init": {
      await ensureFontsLoaded();
      const context = broadcastContext();
      return { context };
    }
    case "load-context": {
      const context = broadcastContext();
      return { context };
    }
    case "update-config": {
      const newConfig = payload as StickerSheetConfig;
      saveConfig(newConfig);
      const context = broadcastContext();
      return { context };
    }
    case "build-one": {
      return await handleBuildSelected();
    }
    case "build-all": {
      return await handleBuildAll();
    }
    case "cancel-build": {
      cancelRequested = true;
      return { cancelled: true };
    }
    default:
      throw new Error(`Unknown sticker-sheet-builder action: ${action}`);
  }
}

async function ensureFontsLoaded() {
  if (fontsLoaded) return;
  await loadFonts();
  fontsLoaded = true;
}

function ensureEventListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  const notify = () => broadcastContext();

  figma.on("run", notify);
  figma.on("selectionchange", notify);
  figma.on("currentpagechange", notify);
}

function broadcastContext(): StickerSheetBuilderContext {
  const config = loadConfig();
  const context: StickerSheetBuilderContext = {
    selectionValid: isSelectionValid(),
    stickerSheetExists: Boolean(findStickerSheetPage()),
    config,
    availablePages: getAllPages(),
  };

  figma.ui?.postMessage({
    type: STICKER_SHEET_CONTEXT_EVENT,
    payload: context,
  });

  return context;
}

function isSelectionValid(): boolean {
  const { selection } = figma.currentPage;
  if (selection.length !== 1) return false;
  return isStickerEligible(selection[0]);
}

function isStickerEligible(
  node: SceneNode,
): node is InstanceNode | ComponentNode | ComponentSetNode {
  return (
    node.type === "INSTANCE" ||
    node.type === "COMPONENT" ||
    node.type === "COMPONENT_SET"
  );
}

async function handleBuildSelected(): Promise<StickerSheetBuilderResponse> {
  cancelRequested = false;
  await ensureFontsLoaded();

  const config = loadConfig();
  const sourcePageName = figma.currentPage.name;

  const validNodes = figma.currentPage.selection.filter(isStickerEligible);
  if (!validNodes.length) {
    throw new Error(
      "Select an instance, component, or component set to build a sticker.",
    );
  }

  const total = validNodes.length;
  let builtCount = 0;

  for (const node of validNodes) {
    if (cancelRequested) {
      const context = broadcastContext();
      return { builtCount, context, cancelled: true };
    }

    broadcastProgress(builtCount + 1, total, node.name);
    await buildOneSticker(node, {
      groupingMode: config.groupingMode,
      sourcePageName,
    });
    builtCount += 1;

    // Yield to keep UI responsive
    await yieldToMain();
  }

  const context = broadcastContext();
  return { builtCount, context };
}

async function handleBuildAll(): Promise<StickerSheetBuilderResponse> {
  cancelRequested = false;
  await ensureFontsLoaded();

  const config = loadConfig();

  const stickerSheetPage = getStickerSheetPage();
  while (stickerSheetPage.children.length) {
    stickerSheetPage.children[0].remove();
  }

  const atomPages = findAtomPages(config.startMarker, config.endMarker);

  if (atomPages.length === 0) {
    throw new Error(
      "No pages found between the configured markers. Please configure start and end markers.",
    );
  }

  const componentsWithPages = getComponentsFromPage(
    atomPages,
    config.requireDescription,
  );

  if (componentsWithPages.length === 0) {
    throw new Error(
      "No components found in the selected pages. Check your marker configuration and description filter settings.",
    );
  }

  const total = componentsWithPages.length;
  let builtCount = 0;

  for (const { component, pageName } of componentsWithPages) {
    if (cancelRequested) {
      const context = broadcastContext();
      return { builtCount, context, cancelled: true };
    }

    broadcastProgress(builtCount + 1, total, component.name);
    await buildOneSticker(component, {
      includeInfo: config.requireDescription,
      groupingMode: config.groupingMode,
      sourcePageName: pageName,
    });
    builtCount += 1;

    // Yield to keep UI responsive
    await yieldToMain();
  }

  const sectionsFrame = stickerSheetPage.findChild(
    (node) => node.type === "FRAME" && node.name === "Sections",
  ) as FrameNode | null;
  if (sectionsFrame) {
    lockStickers(sectionsFrame);
  }

  // Also lock "All Stickers" container for "none" grouping mode
  const allStickersFrame = stickerSheetPage.findChild(
    (node) => node.type === "FRAME" && node.name === "All Stickers",
  ) as FrameNode | null;
  if (allStickersFrame) {
    lockStickers(allStickersFrame);
  }

  const context = broadcastContext();
  return { builtCount, context };
}
