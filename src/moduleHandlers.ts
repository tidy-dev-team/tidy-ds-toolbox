import type { StickerSheetBuilderAction } from "./plugins/sticker-sheet-builder/types";
import type { TidyMapperAction } from "./plugins/tidy-mapper/types";
import type { UtilitiesAction } from "./plugins/utilities/types";
import type { AuditAction } from "./plugins/audit/types";
import type { ReleaseNotesAction } from "./plugins/release-notes/types";
import type { OffBoardingAction } from "./plugins/off-boarding/types";
import type { BuildData } from "./plugins/ds-explorer/types";

import {
  handleGetComponentProperties,
  handleBuildComponent,
} from "./plugins/ds-explorer/logic";
import { componentLabelsHandler as componentLabelsLogic } from "./plugins/component-labels/logic";
import { tidyIconCareHandler as tidyIconCareLogic } from "./plugins/tidy-icon-care/logic";
import { stickerSheetBuilderHandler as stickerSheetBuilderLogic } from "./plugins/sticker-sheet-builder/logic";
import { tidyMapperHandler as tidyMapperLogic } from "./plugins/tidy-mapper/logic";
import { utilitiesHandler as utilitiesLogic } from "./plugins/utilities/logic";
import { auditHandler as auditLogic } from "./plugins/audit/logic";
import { releaseNotesHandler as releaseNotesLogic } from "./plugins/release-notes/logic";
import { offBoardingHandler as offBoardingLogic } from "./plugins/off-boarding/logic";

// Module handlers - static imports only
const dsExplorerHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  switch (action) {
    case "get-component-properties":
      return await handleGetComponentProperties(
        payload as { key: string; name: string; requestId?: string },
        figma,
      );
    case "build-component":
      return await handleBuildComponent(
        payload as BuildData & { requestId?: string },
        figma,
      );
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

const componentLabelsHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await componentLabelsLogic(action, payload, figma);
};

const tidyIconCareHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await tidyIconCareLogic(action, payload, figma);
};

const stickerSheetBuilderHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await stickerSheetBuilderLogic(
    action as StickerSheetBuilderAction,
    payload,
    figma,
  );
};

const tidyMapperHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await tidyMapperLogic(action as TidyMapperAction, payload, figma);
};

const utilitiesHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await utilitiesLogic(action as UtilitiesAction, payload, figma);
};

const auditHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await auditLogic(action as AuditAction, payload, figma);
};

const releaseNotesHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await releaseNotesLogic(action as ReleaseNotesAction, payload, figma);
};

const offBoardingHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await offBoardingLogic(action as OffBoardingAction, payload, figma);
};

export const moduleHandlers: Record<
  string,
  (action: string, payload: unknown, figma: PluginAPI) => Promise<unknown>
> = {
  "ds-explorer": dsExplorerHandler,
  "component-labels": componentLabelsHandler,
  "tidy-icon-care": tidyIconCareHandler,
  "sticker-sheet-builder": stickerSheetBuilderHandler,
  "tidy-mapper": tidyMapperHandler,
  utilities: utilitiesHandler,
  audit: auditHandler,
  "release-notes": releaseNotesHandler,
  "off-boarding": offBoardingHandler,
};
