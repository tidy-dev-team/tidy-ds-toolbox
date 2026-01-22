import { ModuleRegistry } from "@shared/types";
import {
  IconIcons,
  IconComponents,
  IconSticker,
  IconTag,
  IconMap,
  IconTool,
  IconZoomCheck,
  IconFileText,
} from "@tabler/icons-react";
import { DSExplorerUI } from "./plugins/ds-explorer/ui";
import { ComponentLabelsUI } from "./plugins/component-labels/ui";
import { TidyIconCareUI } from "./plugins/tidy-icon-care/ui";
import { StickerSheetBuilderUI } from "./plugins/sticker-sheet-builder/ui";
import { TidyMapperUI } from "./plugins/tidy-mapper/ui";
import { UtilitiesUI } from "./plugins/utilities/ui";
import { AuditUI } from "./plugins/audit/ui";
import { ReleaseNotesUI } from "./plugins/release-notes/ui";
import type { StickerSheetBuilderAction } from "./plugins/sticker-sheet-builder/types";
import type { TidyMapperAction } from "./plugins/tidy-mapper/types";
import type { UtilitiesAction } from "./plugins/utilities/types";
import type { AuditAction } from "./plugins/audit/types";
import type { ReleaseNotesAction } from "./plugins/release-notes/types";
import type { BuildData } from "./plugins/ds-explorer/types";

// Import all handlers statically
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

// Module handlers - now using static imports
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

export const moduleRegistry: ModuleRegistry = {
  "ds-explorer": {
    id: "ds-explorer",
    label: "DS Explorer",
    state: "stable",
    icon: IconComponents,
    ui: DSExplorerUI,
    handler: dsExplorerHandler,
    permissionRequirements: ["activeselection"],
    keywords: [
      "design system",
      "component",
      "preview",
      "configure",
      "properties",
    ],
    features: [
      {
        id: "ds-explorer-preview",
        label: "Component Preview",
        section: "[data-feature='preview']",
        keywords: ["preview", "component", "view"],
      },
    ],
  },
  "component-labels": {
    id: "component-labels",
    label: "Component Labels",
    state: "stable",
    icon: IconTag,
    ui: ComponentLabelsUI,
    handler: componentLabelsHandler,
    permissionRequirements: [],
    keywords: ["label", "annotation", "naming", "component"],
  },
  "tidy-icon-care": {
    id: "tidy-icon-care",
    label: "Tidy Icon Care",
    state: "stable",
    icon: IconIcons,
    ui: TidyIconCareUI,
    handler: tidyIconCareHandler,
    permissionRequirements: ["activeselection"],
    keywords: ["icon", "svg", "clean", "optimize", "tidy"],
  },
  "sticker-sheet-builder": {
    id: "sticker-sheet-builder",
    label: "Sticker Sheet Builder",
    state: "beta",
    icon: IconSticker,
    ui: StickerSheetBuilderUI,
    handler: stickerSheetBuilderHandler,
    permissionRequirements: ["activeselection"],
    keywords: ["sticker", "sheet", "build", "variants", "documentation"],
    features: [
      {
        id: "sticker-sheet-build-all",
        label: "Build All Sticker Sheets",
        section: "[data-feature='build-all']",
        keywords: ["build", "all", "sticker", "generate"],
      },
    ],
  },
  "tidy-mapper": {
    id: "tidy-mapper",
    label: "Tidy Mapper",
    state: "stable",
    icon: IconMap,
    ui: TidyMapperUI,
    handler: tidyMapperHandler,
    permissionRequirements: [],
    keywords: ["map", "mapping", "library", "swap", "migrate"],
  },
  utilities: {
    id: "utilities",
    label: "Utilities",
    state: "stable",
    icon: IconTool,
    ui: UtilitiesUI,
    handler: utilitiesHandler,
    permissionRequirements: [],
    keywords: ["utility", "tools", "helper", "misc"],
    features: [
      {
        id: "address-note",
        label: "Address Note",
        keywords: [
          "note",
          "navigation",
          "address",
          "backlink",
          "frame",
          "link",
        ],
      },
      {
        id: "image-wrapper",
        label: "Image Wrapper",
        keywords: ["wrap", "image", "frame", "selected", "items"],
      },
      {
        id: "misprint",
        label: "Misprint",
        keywords: [
          "misprint",
          "scramble",
          "hebrew",
          "text",
          "description",
          "component",
        ],
      },
    ],
  },
  audit: {
    id: "audit",
    label: "Audit",
    state: "stable",
    icon: IconZoomCheck,
    ui: AuditUI,
    handler: auditHandler,
    permissionRequirements: ["activeselection"],
    keywords: ["audit", "check", "report", "analysis", "quality"],
    features: [
      {
        id: "audit-add-note",
        label: "Add Note",
        section: "[data-feature='add-note']",
        keywords: ["note", "add", "annotate", "comment", "severity"],
      },
      {
        id: "audit-generate-report",
        label: "Generate Report",
        section: "[data-feature='report']",
        keywords: ["report", "generate", "create", "build"],
      },
      {
        id: "audit-export-pdf",
        label: "Export PDF",
        section: "[data-feature='report']",
        keywords: ["export", "pdf", "download", "save"],
      },
      {
        id: "audit-export-csv",
        label: "Export CSV",
        section: "[data-feature='report']",
        keywords: ["export", "csv", "spreadsheet", "download", "save"],
      },
      {
        id: "audit-erase-notes",
        label: "Erase Notes on Canvas",
        section: "[data-feature='manage']",
        keywords: ["erase", "delete", "remove", "notes", "cleanup", "canvas"],
      },
      {
        id: "audit-erase-report",
        label: "Erase Report Data",
        section: "[data-feature='manage']",
        keywords: ["erase", "delete", "remove", "report", "cleanup", "data"],
      },
    ],
  },
  // "tags-spacings": {
  //   id: "tags-spacings",
  //   label: "Tags & Spacings",
  //   state: "alpha",
  //   icon: IconRulerMeasure,
  //   ui: TagsSpacingsUI,
  //   handler: tagsSpacingsHandler,
  //   permissionRequirements: ["activeselection"],
  // },
  "release-notes": {
    id: "release-notes",
    label: "Release Notes",
    state: "beta",
    icon: IconFileText,
    ui: ReleaseNotesUI,
    handler: releaseNotesHandler,
    permissionRequirements: [],
    keywords: ["release", "notes", "changelog", "version", "update"],
  },
};
