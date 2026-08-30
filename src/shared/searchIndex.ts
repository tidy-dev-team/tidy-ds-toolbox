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
