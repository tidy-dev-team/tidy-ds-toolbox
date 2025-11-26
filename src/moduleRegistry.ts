import React from "react";
import { ModuleRegistry, ModuleManifest } from "@shared/types";
import {
  IconShape,
  IconTypography,
  IconPalette,
  IconComponents,
} from "@tabler/icons-react";
import { ShapeShifterUI } from "./plugins/shape-shifter/ui";
import { handleShapeShifter } from "./plugins/shape-shifter/logic";
import { TextMasterUI } from "./plugins/text-master/ui";
import { handleTextMaster } from "./plugins/text-master/logic";
import { DSExplorerUI } from "./plugins/ds-explorer/ui";

// Placeholder components for modules
const ColorLabComponent = () =>
  React.createElement("div", null, "Color Lab - Coming Soon");

// Module handlers
const shapeShifterHandler = handleShapeShifter;

const textMasterHandler = handleTextMaster;

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

const colorLabHandler = async (action: string, payload: any, figma: any) => {
  // Color lab logic
};

export const moduleRegistry: ModuleRegistry = {
  "shape-shifter": {
    id: "shape-shifter",
    label: "Shape Shifter",
    icon: IconShape,
    ui: ShapeShifterUI,
    handler: shapeShifterHandler,
    permissionRequirements: ["activeselection"],
  },
  "text-master": {
    id: "text-master",
    label: "Text Master",
    icon: IconTypography,
    ui: TextMasterUI,
    handler: textMasterHandler,
    permissionRequirements: ["activeselection"],
  },
  "ds-explorer": {
    id: "ds-explorer",
    label: "DS Explorer",
    icon: IconComponents,
    ui: DSExplorerUI,
    handler: dsExplorerHandler,
    permissionRequirements: ["activeselection"],
  },
  "color-lab": {
    id: "color-lab",
    label: "Color Lab",
    icon: IconPalette,
    ui: ColorLabComponent,
    handler: colorLabHandler,
    permissionRequirements: ["activeselection"],
  },
};
