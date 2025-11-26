import React from "react";
import { ModuleRegistry, ModuleManifest } from "@shared/types";
import { IconShape, IconTypography, IconPalette } from "@tabler/icons-react";
import { ShapeShifterUI } from "./plugins/shape-shifter/ui";
import { handleShapeShifter } from "./plugins/shape-shifter/logic";
import { TextMasterUI } from "./plugins/text-master/ui";
import { handleTextMaster } from "./plugins/text-master/logic";

// Placeholder components for modules
const ColorLabComponent = () =>
  React.createElement("div", null, "Color Lab - Coming Soon");

// Module handlers
const shapeShifterHandler = handleShapeShifter;

const textMasterHandler = handleTextMaster;

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
  "color-lab": {
    id: "color-lab",
    label: "Color Lab",
    icon: IconPalette,
    ui: ColorLabComponent,
    handler: colorLabHandler,
    permissionRequirements: ["activeselection"],
  },
};
