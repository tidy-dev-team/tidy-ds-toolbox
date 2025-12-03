import { ModuleRegistry } from "@shared/types";
import {
  IconApps,
  IconComponents,
  IconLayoutGrid,
  IconPalette,
  IconTag,
} from "@tabler/icons-react";
import { DSExplorerUI } from "./plugins/ds-explorer/ui";
import { TokenTrackerUI } from "./plugins/token-tracker/ui";
import { ComponentLabelsUI } from "./plugins/component-labels/ui";
import { TidyIconCareUI } from "./plugins/tidy-icon-care/ui";
import { StickerSheetBuilderUI } from "./plugins/sticker-sheet-builder/ui";
import type { StickerSheetBuilderAction } from "./plugins/sticker-sheet-builder/types";

// Import all handlers statically
import {
  handleGetComponentProperties,
  handleBuildComponent,
} from "./plugins/ds-explorer/logic";
import { tokenTrackerHandler as tokenTrackerLogic } from "./plugins/token-tracker/logic";
import { componentLabelsHandler as componentLabelsLogic } from "./plugins/component-labels/logic";
import { tidyIconCareHandler as tidyIconCareLogic } from "./plugins/tidy-icon-care/logic";
import { stickerSheetBuilderHandler as stickerSheetBuilderLogic } from "./plugins/sticker-sheet-builder/logic";

// Module handlers - now using static imports
const dsExplorerHandler = async (action: string, payload: any, figma: any) => {
  switch (action) {
    case "get-component-properties":
      return await handleGetComponentProperties(payload, figma);
    case "build-component":
      return await handleBuildComponent(payload, figma);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

const tokenTrackerHandler = async (
  action: string,
  payload: any,
  figma: any,
) => {
  return await tokenTrackerLogic(action, payload, figma);
};

const componentLabelsHandler = async (
  action: string,
  payload: any,
  figma: any,
) => {
  return await componentLabelsLogic(action, payload, figma);
};

const tidyIconCareHandler = async (
  action: string,
  payload: any,
  figma: any,
) => {
  return await tidyIconCareLogic(action, payload, figma);
};

const stickerSheetBuilderHandler = async (
  action: string,
  payload: any,
  figma: any,
) => {
  return await stickerSheetBuilderLogic(
    action as StickerSheetBuilderAction,
    payload,
    figma,
  );
};

export const moduleRegistry: ModuleRegistry = {
  "ds-explorer": {
    id: "ds-explorer",
    label: "DS Explorer",
    icon: IconComponents,
    ui: DSExplorerUI,
    handler: dsExplorerHandler,
    permissionRequirements: ["activeselection"],
  },
  "token-tracker": {
    id: "token-tracker",
    label: "Token Tracker",
    icon: IconPalette,
    ui: TokenTrackerUI,
    handler: tokenTrackerHandler,
    permissionRequirements: [],
  },
  "component-labels": {
    id: "component-labels",
    label: "Component Labels",
    icon: IconTag,
    ui: ComponentLabelsUI,
    handler: componentLabelsHandler,
    permissionRequirements: [],
  },
  "tidy-icon-care": {
    id: "tidy-icon-care",
    label: "Tidy Icon Care",
    icon: IconApps,
    ui: TidyIconCareUI,
    handler: tidyIconCareHandler,
    permissionRequirements: ["activeselection"],
  },
  "sticker-sheet-builder": {
    id: "sticker-sheet-builder",
    label: "Sticker Sheet Builder",
    icon: IconLayoutGrid,
    ui: StickerSheetBuilderUI,
    handler: stickerSheetBuilderHandler,
    permissionRequirements: ["activeselection"],
  },
};
