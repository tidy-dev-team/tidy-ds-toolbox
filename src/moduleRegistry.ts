import { ModuleRegistry } from "@shared/types";
import {
  IconIcons,
  IconComponents,
  IconSticker,
  IconTag,
  IconMap,
} from "@tabler/icons-react";
import { DSExplorerUI } from "./plugins/ds-explorer/ui";
import { ComponentLabelsUI } from "./plugins/component-labels/ui";
import { TidyIconCareUI } from "./plugins/tidy-icon-care/ui";
import { StickerSheetBuilderUI } from "./plugins/sticker-sheet-builder/ui";
import { TidyMapperUI } from "./plugins/tidy-mapper/ui";
import type { StickerSheetBuilderAction } from "./plugins/sticker-sheet-builder/types";
import type { TidyMapperAction } from "./plugins/tidy-mapper/types";

// Import all handlers statically
import {
  handleGetComponentProperties,
  handleBuildComponent,
} from "./plugins/ds-explorer/logic";
import { componentLabelsHandler as componentLabelsLogic } from "./plugins/component-labels/logic";
import { tidyIconCareHandler as tidyIconCareLogic } from "./plugins/tidy-icon-care/logic";
import { stickerSheetBuilderHandler as stickerSheetBuilderLogic } from "./plugins/sticker-sheet-builder/logic";
import { tidyMapperHandler as tidyMapperLogic } from "./plugins/tidy-mapper/logic";

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

const tidyMapperHandler = async (action: string, payload: any, figma: any) => {
  return await tidyMapperLogic(action as TidyMapperAction, payload, figma);
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
    icon: IconIcons,
    ui: TidyIconCareUI,
    handler: tidyIconCareHandler,
    permissionRequirements: ["activeselection"],
  },
  "sticker-sheet-builder": {
    id: "sticker-sheet-builder",
    label: "Sticker Sheet Builder",
    icon: IconSticker,
    ui: StickerSheetBuilderUI,
    handler: stickerSheetBuilderHandler,
    permissionRequirements: ["activeselection"],
  },
  "tidy-mapper": {
    id: "tidy-mapper",
    label: "Tidy Mapper",
    icon: IconMap,
    ui: TidyMapperUI,
    handler: tidyMapperHandler,
    permissionRequirements: [],
  },
};
