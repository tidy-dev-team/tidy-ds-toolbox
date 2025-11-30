import React from "react";
import { ModuleRegistry, ModuleManifest } from "@shared/types";
import {
  IconApps,
  IconComponents,
  IconPalette,
  IconTag,
} from "@tabler/icons-react";
import { DSExplorerUI } from "./plugins/ds-explorer/ui";
import { TokenTrackerUI } from "./plugins/token-tracker/ui";
import { ComponentLabelsUI } from "./plugins/component-labels/ui";
import { TidyIconCareUI } from "./plugins/tidy-icon-care/ui";

// Module handlers
const dsExplorerHandler = async (action: string, payload: any, figma: any) => {
  const { handleGetComponentProperties, handleBuildComponent } = await import(
    "./plugins/ds-explorer/logic"
  );

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
  figma: any
) => {
  const { tokenTrackerHandler: handler } = await import(
    "./plugins/token-tracker/logic"
  );
  return await handler(action, payload, figma);
};

const componentLabelsHandler = async (
  action: string,
  payload: any,
  figma: any
) => {
  const { componentLabelsHandler: handler } = await import(
    "./plugins/component-labels/logic"
  );
  return await handler(action, payload, figma);
};

const tidyIconCareHandler = async (
  action: string,
  payload: any,
  figma: any
) => {
  const { tidyIconCareHandler: handler } = await import(
    "./plugins/tidy-icon-care/logic"
  );
  return await handler(action, payload, figma);
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
};
