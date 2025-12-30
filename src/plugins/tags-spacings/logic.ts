/// <reference types="@figma/plugin-typings" />

import {
  TagsSpacingsAction,
  TagsSpacingsResult,
  TagsSpacingsSettings,
  BuildTagsPayload,
  BuildSpacingsPayload,
  SelectionInfo,
} from "./types";
import { buildTags } from "./utils/buildTags";
import { buildSpacingMarks } from "./utils/buildSpacingMarks";
import { ACCEPTED_TYPES } from "./utils/constants";

const STORAGE_KEY = "tags-spacings-settings";

let listenersRegistered = false;

/**
 * Tags & Spacings handler - processes messages from the UI
 */
export async function tagsSpacingsHandler(
  action: string,
  payload: any,
  _figma?: PluginAPI,
): Promise<TagsSpacingsResult | TagsSpacingsSettings | SelectionInfo | null> {
  ensureListeners();

  switch (action as TagsSpacingsAction) {
    case "init":
      return await handleInit();

    case "selection-change":
      return handleSelectionChange();

    case "build-tags":
      return await handleBuildTags(payload as BuildTagsPayload);

    case "build-spacings":
      return await handleBuildSpacings(payload as BuildSpacingsPayload);

    default:
      console.warn(`Unknown tags-spacings action: ${action}`);
      return null;
  }
}

/**
 * Initialize plugin and load saved settings
 */
async function handleInit(): Promise<TagsSpacingsSettings | null> {
  try {
    const savedSettings = await figma.clientStorage.getAsync(STORAGE_KEY);

    if (savedSettings) {
      figma.ui.postMessage({
        type: "settings",
        payload: savedSettings,
      });
      return savedSettings;
    }
  } catch (error) {
    console.warn("Could not load settings:", error);
  }

  return null;
}

/**
 * Ensure event listeners are registered
 */
function ensureListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  figma.on("selectionchange", () => {
    const info = handleSelectionChange();
    figma.ui.postMessage({
      type: "selection-info",
      payload: info,
    });
  });

  figma.on("currentpagechange", () => {
    const info = handleSelectionChange();
    figma.ui.postMessage({
      type: "selection-info",
      payload: info,
    });
  });
}

/**
 * Handle selection change - check for valid frames
 */
function handleSelectionChange(): SelectionInfo {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: "selection-cleared",
    });
    return {
      hasValidSelection: false,
      selectionCount: 0,
      selectionType: "none",
    };
  }

  // Check for valid frame types
  const validFrames = selection.filter((node) =>
    ACCEPTED_TYPES.includes(node.type),
  );

  const info: SelectionInfo = {
    hasValidSelection: validFrames.length > 0,
    selectionCount: validFrames.length,
    selectionType: validFrames.length > 0 ? validFrames[0].type : "none",
  };

  figma.ui.postMessage({
    type: "selection-info",
    payload: info,
  });

  return info;
}

/**
 * Build tags for selected frames
 */
async function handleBuildTags(
  payload: BuildTagsPayload,
): Promise<TagsSpacingsResult> {
  const { config } = payload;

  // Save settings
  await saveSettings({ tags: config });

  // Build tags
  const result = await buildTags(config);

  // Notify user
  if (result.success) {
    figma.notify(`✓ ${result.message}`);
  } else {
    figma.notify(`⚠️ ${result.message}`, { error: true });
  }

  return result;
}

/**
 * Build spacing marks for selected frames
 */
async function handleBuildSpacings(
  payload: BuildSpacingsPayload,
): Promise<TagsSpacingsResult> {
  const { config } = payload;

  // Save settings
  await saveSettings({ spacings: config });

  // Build spacing marks
  const result = await buildSpacingMarks(config);

  // Notify user
  if (result.success) {
    figma.notify(`✓ ${result.message}`);
  } else {
    figma.notify(`⚠️ ${result.message}`, { error: true });
  }

  return result;
}

/**
 * Save settings to client storage
 */
async function saveSettings(
  partialSettings: Partial<TagsSpacingsSettings>,
): Promise<void> {
  try {
    const existingSettings =
      (await figma.clientStorage.getAsync(STORAGE_KEY)) || {};
    const newSettings = { ...existingSettings, ...partialSettings };
    await figma.clientStorage.setAsync(STORAGE_KEY, newSettings);
  } catch (error) {
    console.warn("Could not save settings:", error);
  }
}
