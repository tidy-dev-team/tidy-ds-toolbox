import buildOneSticker from "./utils/buildOneSticker";
import {
  findAtomPages,
  findStickerSheetPage,
  getComponentsFromPage,
  getStickerSheetPage,
} from "./utils/findAtomPages";
import { loadFonts } from "./utils/loadFonts";
import { lockStickers } from "./utils/lockStickers";
import {
  StickerSheetBuilderAction,
  StickerSheetBuilderContext,
  StickerSheetBuilderResponse,
  STICKER_SHEET_CONTEXT_EVENT,
} from "./types";

let fontsLoaded = false;
let listenersRegistered = false;

export async function stickerSheetBuilderHandler(
  action: StickerSheetBuilderAction,
  _payload?: any,
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
    case "build-one": {
      return await handleBuildSelected();
    }
    case "build-all": {
      return await handleBuildAll();
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
  const context: StickerSheetBuilderContext = {
    selectionValid: isSelectionValid(),
    stickerSheetExists: Boolean(findStickerSheetPage()),
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
  await ensureFontsLoaded();

  const validNodes = figma.currentPage.selection.filter(isStickerEligible);
  if (!validNodes.length) {
    throw new Error(
      "Select an instance, component, or component set to build a sticker.",
    );
  }

  let builtCount = 0;
  for (const node of validNodes) {
    await buildOneSticker(node);
    builtCount += 1;
  }

  const context = broadcastContext();
  return { builtCount, context };
}

async function handleBuildAll(): Promise<StickerSheetBuilderResponse> {
  await ensureFontsLoaded();

  const stickerSheetPage = getStickerSheetPage();
  while (stickerSheetPage.children.length) {
    stickerSheetPage.children[0].remove();
  }

  const atomPages = findAtomPages();
  const components = getComponentsFromPage(atomPages) as (
    | ComponentNode
    | ComponentSetNode
  )[];

  let builtCount = 0;
  for (const component of components) {
    await buildOneSticker(component);
    builtCount += 1;
  }

  const sectionsFrame = stickerSheetPage.findChild(
    (node) => node.type === "FRAME" && node.name === "Sections",
  ) as FrameNode | null;
  if (sectionsFrame) {
    lockStickers(sectionsFrame);
  }

  const context = broadcastContext();
  return { builtCount, context };
}
