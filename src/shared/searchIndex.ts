/**
 * Searchable feature index for all plugins
 * Auto-generated from moduleRegistry
 */

import { PluginID } from "./types";
import { moduleRegistry } from "../moduleRegistry";

export interface SearchableFeature {
  id: string;
  label: string;
  pluginId: PluginID;
  pluginLabel: string;
  section?: string; // CSS selector or data attribute for scrolling
  keywords: string[];
}

let cachedSearchIndex: SearchableFeature[] | null = null;

/**
 * Build the search index dynamically from moduleRegistry
 * This ensures search index is always in sync with available plugins
 */
export function buildSearchIndex(): SearchableFeature[] {
  if (cachedSearchIndex) {
    return cachedSearchIndex;
  }

  const features: SearchableFeature[] = [];

  Object.values(moduleRegistry).forEach((module) => {
    // Add plugin-level entry
    features.push({
      id: module.id,
      label: module.label,
      pluginId: module.id,
      pluginLabel: module.label,
      keywords: module.keywords || [],
    });

    // Add feature-level entries (if defined)
    module.features?.forEach((feature) => {
      features.push({
        id: feature.id,
        label: feature.label,
        pluginId: module.id,
        pluginLabel: module.label,
        section: feature.section,
        keywords: feature.keywords,
      });
    });
  });

  cachedSearchIndex = features;
  return features;
}

/**
 * Get the search index (lazy initialized)
 */
export function getSearchIndex(): SearchableFeature[] {
  return buildSearchIndex();
}

/**
 * Legacy static search index - kept for reference during migration
 * TODO: Remove after migration is complete
 */
export const searchIndexLegacy: SearchableFeature[] = [
  // DS Explorer
  {
    id: "ds-explorer",
    label: "DS Explorer",
    pluginId: "ds-explorer",
    pluginLabel: "DS Explorer",
    keywords: [
      "design system",
      "component",
      "preview",
      "configure",
      "properties",
    ],
  },
  {
    id: "ds-explorer-preview",
    label: "Component Preview",
    pluginId: "ds-explorer",
    pluginLabel: "DS Explorer",
    section: "[data-feature='preview']",
    keywords: ["preview", "component", "view"],
  },

  // Component Labels
  {
    id: "component-labels",
    label: "Component Labels",
    pluginId: "component-labels",
    pluginLabel: "Component Labels",
    keywords: ["label", "annotation", "naming", "component"],
  },

  // Tidy Icon Care
  {
    id: "tidy-icon-care",
    label: "Tidy Icon Care",
    pluginId: "tidy-icon-care",
    pluginLabel: "Tidy Icon Care",
    keywords: ["icon", "svg", "clean", "optimize", "tidy"],
  },

  // Sticker Sheet Builder
  {
    id: "sticker-sheet-builder",
    label: "Sticker Sheet Builder",
    pluginId: "sticker-sheet-builder",
    pluginLabel: "Sticker Sheet Builder",
    keywords: ["sticker", "sheet", "build", "variants", "documentation"],
  },
  {
    id: "sticker-sheet-build-all",
    label: "Build All Sticker Sheets",
    pluginId: "sticker-sheet-builder",
    pluginLabel: "Sticker Sheet Builder",
    section: "[data-feature='build-all']",
    keywords: ["build", "all", "sticker", "generate"],
  },

  // Tidy Mapper
  {
    id: "tidy-mapper",
    label: "Tidy Mapper",
    pluginId: "tidy-mapper",
    pluginLabel: "Tidy Mapper",
    keywords: ["map", "mapping", "library", "swap", "migrate"],
  },

  // Utilities
  {
    id: "utilities",
    label: "Utilities",
    pluginId: "utilities",
    pluginLabel: "Utilities",
    keywords: ["utility", "tools", "helper", "misc"],
  },

  // Audit - Main plugin
  {
    id: "audit",
    label: "Audit",
    pluginId: "audit",
    pluginLabel: "Audit",
    keywords: ["audit", "check", "report", "analysis", "quality"],
  },
  // Audit - Features
  {
    id: "audit-add-note",
    label: "Add Note",
    pluginId: "audit",
    pluginLabel: "Audit",
    section: "[data-feature='add-note']",
    keywords: ["note", "add", "annotate", "comment", "severity"],
  },
  {
    id: "audit-generate-report",
    label: "Generate Report",
    pluginId: "audit",
    pluginLabel: "Audit",
    section: "[data-feature='report']",
    keywords: ["report", "generate", "create", "build"],
  },
  {
    id: "audit-export-pdf",
    label: "Export PDF",
    pluginId: "audit",
    pluginLabel: "Audit",
    section: "[data-feature='report']",
    keywords: ["export", "pdf", "download", "save"],
  },
  {
    id: "audit-export-csv",
    label: "Export CSV",
    pluginId: "audit",
    pluginLabel: "Audit",
    section: "[data-feature='report']",
    keywords: ["export", "csv", "spreadsheet", "download", "save"],
  },
  {
    id: "audit-erase-notes",
    label: "Erase Notes on Canvas",
    pluginId: "audit",
    pluginLabel: "Audit",
    section: "[data-feature='manage']",
    keywords: ["erase", "delete", "remove", "notes", "cleanup", "canvas"],
  },
  {
    id: "audit-erase-report",
    label: "Erase Report Data",
    pluginId: "audit",
    pluginLabel: "Audit",
    section: "[data-feature='manage']",
    keywords: ["erase", "delete", "remove", "report", "cleanup", "data"],
  },

  // Tags & Spacings
  {
    id: "tags-spacings",
    label: "Tags & Spacings",
    pluginId: "tags-spacings",
    pluginLabel: "Tags & Spacings",
    keywords: ["tags", "spacing", "anatomy", "measurement", "dimension"],
  },
  {
    id: "tags-spacings-build-tags",
    label: "Build Tags (Anatomy)",
    pluginId: "tags-spacings",
    pluginLabel: "Tags & Spacings",
    section: "[data-feature='tags']",
    keywords: ["tags", "anatomy", "label", "index", "annotate"],
  },
  {
    id: "tags-spacings-build-spacings",
    label: "Build Spacing Marks",
    pluginId: "tags-spacings",
    pluginLabel: "Tags & Spacings",
    section: "[data-feature='spacings']",
    keywords: ["spacing", "padding", "gap", "size", "dimension", "measurement"],
  },
  {
    id: "tags-spacings-internal-tools",
    label: "Build Internal Tools",
    pluginId: "tags-spacings",
    pluginLabel: "Tags & Spacings",
    section: "[data-feature='internal-tools']",
    keywords: ["internal", "tools", "update", "components", "markers"],
  },
  {
    id: "tags-spacings-delete-tools",
    label: "Delete Internal Tools",
    pluginId: "tags-spacings",
    pluginLabel: "Tags & Spacings",
    section: "[data-feature='internal-tools']",
    keywords: ["delete", "remove", "internal", "tools", "cleanup"],
  },

  // Release Notes
  {
    id: "release-notes",
    label: "Release Notes",
    pluginId: "release-notes",
    pluginLabel: "Release Notes",
    keywords: ["release", "notes", "changelog", "version", "update"],
  },
];

/**
 * Get all unique plugin entries (for plugin-level search)
 */
export function getPluginEntries(): SearchableFeature[] {
  const index = getSearchIndex();
  const seen = new Set<PluginID>();
  return index.filter((feature) => {
    if (feature.id === feature.pluginId && !seen.has(feature.pluginId)) {
      seen.add(feature.pluginId);
      return true;
    }
    return false;
  });
}

/**
 * Get all feature entries (for feature-level search)
 */
export function getFeatureEntries(): SearchableFeature[] {
  const index = getSearchIndex();
  return index.filter((feature) => feature.id !== feature.pluginId);
}
