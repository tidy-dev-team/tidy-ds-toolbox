import type { StickerSheetBuilderAction } from "./plugins/sticker-sheet-builder/types";
import type { TidyMapperAction } from "./plugins/tidy-mapper/types";
import type { UtilitiesAction } from "./plugins/utilities/types";
import type { AuditAction } from "./plugins/audit/types";
import type { ReleaseNotesAction } from "./plugins/release-notes/types";
import type { OffBoardingAction } from "./plugins/off-boarding/types";
import type { TidyColorFinderAction } from "./plugins/color-finder/types";
import type { TidyDocAction } from "./plugins/tidy-doc/types";
import type { BuildData } from "./plugins/ds-explorer/types";

import { dispatch as dispatchOperation } from "./shared/operations/registry";
import type { BridgeRequest } from "./shared/operations/types";
import "./shared/operations/register-all";

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
import { iconFinderHandler as iconFinderLogic } from "./plugins/iconfinder/logic";
import { tidyColorFinderHandler as colorFinderLogic } from "./plugins/color-finder/logic";
import { tidyDocHandler as tidyDocLogic } from "./plugins/tidy-doc/logic";

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

const iconFinderHandler = async (
  action: string,
  payload: unknown,
  _figma: PluginAPI,
) => {
  return await iconFinderLogic(action, payload);
};

const colorFinderHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await colorFinderLogic(
    action as TidyColorFinderAction,
    payload,
    figma,
  );
};

const tidyDocModuleHandler = async (
  action: string,
  payload: unknown,
  figma: PluginAPI,
) => {
  return await tidyDocLogic(action as TidyDocAction, payload, figma);
};

// MCP Bridge handler: the UI iframe holds the WebSocket to the MCP server and
// relays each incoming BridgeRequest envelope here as { action: "dispatch",
// payload: envelope }. We dispatch through the Operation registry and return
// the BridgeResponse; the UI then sends it back over the socket.
const mcpBridgeHandler = async (action: string, payload: unknown) => {
  if (action !== "dispatch") {
    throw new Error(`Unknown mcp-bridge action: ${action}`);
  }
  return await dispatchOperation(payload as BridgeRequest);
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
  iconfinder: iconFinderHandler,
  "color-finder": colorFinderHandler,
  "tidy-doc": tidyDocModuleHandler,
  "mcp-bridge": mcpBridgeHandler,
};
