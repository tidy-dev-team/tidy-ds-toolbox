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
  IconPackage,
} from "@tabler/icons-react";
import { DSExplorerUI } from "./plugins/ds-explorer/ui";
import { ComponentLabelsUI } from "./plugins/component-labels/ui";
import { TidyIconCareUI } from "./plugins/tidy-icon-care/ui";
import { StickerSheetBuilderUI } from "./plugins/sticker-sheet-builder/ui";
import { TidyMapperUI } from "./plugins/tidy-mapper/ui";
import { UtilitiesUI } from "./plugins/utilities/ui";
import { AuditUI } from "./plugins/audit/ui";
import { ReleaseNotesUI } from "./plugins/release-notes/ui";
import { OffBoardingUI } from "./plugins/off-boarding/ui";
import { moduleHandlers } from "./moduleHandlers";

export const moduleRegistry: ModuleRegistry = {
  "ds-explorer": {
    id: "ds-explorer",
    label: "DS Explorer",
    state: "stable",
    icon: IconComponents,
    ui: DSExplorerUI,
    handler: moduleHandlers["ds-explorer"],
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
    handler: moduleHandlers["component-labels"],
    permissionRequirements: [],
    keywords: ["label", "annotation", "naming", "component"],
  },
  "tidy-icon-care": {
    id: "tidy-icon-care",
    label: "Tidy Icon Care",
    state: "stable",
    icon: IconIcons,
    ui: TidyIconCareUI,
    handler: moduleHandlers["tidy-icon-care"],
    permissionRequirements: ["activeselection"],
    keywords: ["icon", "svg", "clean", "optimize", "tidy"],
  },
  "sticker-sheet-builder": {
    id: "sticker-sheet-builder",
    label: "Sticker Sheet Builder",
    state: "beta",
    icon: IconSticker,
    ui: StickerSheetBuilderUI,
    handler: moduleHandlers["sticker-sheet-builder"],
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
    handler: moduleHandlers["tidy-mapper"],
    permissionRequirements: [],
    keywords: ["map", "mapping", "library", "swap", "migrate"],
  },
  utilities: {
    id: "utilities",
    label: "Utilities",
    state: "stable",
    icon: IconTool,
    ui: UtilitiesUI,
    handler: moduleHandlers.utilities,
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
      {
        id: "ds-template",
        label: "DS Template",
        keywords: [
          "template",
          "design system",
          "ds",
          "pages",
          "structure",
          "foundation",
          "scaffold",
          "setup",
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
    handler: moduleHandlers.audit,
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
    handler: moduleHandlers["release-notes"],
    permissionRequirements: [],
    keywords: ["release", "notes", "changelog", "version", "update"],
  },
  "off-boarding": {
    id: "off-boarding",
    label: "Off-Boarding",
    state: "beta",
    icon: IconPackage,
    ui: OffBoardingUI,
    handler: moduleHandlers["off-boarding"],
    permissionRequirements: [],
    keywords: [
      "pack",
      "unpack",
      "pages",
      "transfer",
      "copy",
      "move",
      "variables",
      "bound",
    ],
    features: [
      {
        id: "off-boarding-pack",
        label: "Pack Pages",
        keywords: ["pack", "pages", "compress", "bundle"],
      },
      {
        id: "off-boarding-unpack",
        label: "Unpack Pages",
        keywords: ["unpack", "pages", "extract", "restore"],
      },
      {
        id: "off-boarding-variables",
        label: "Find Bound Variables",
        keywords: ["find", "variables", "bound", "scan"],
      },
    ],
  },
};
