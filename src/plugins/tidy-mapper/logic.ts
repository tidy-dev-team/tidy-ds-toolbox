/// <reference types="@figma/plugin-typings" />

import {
  TidyMapperAction,
  SetSliceNamePayload,
  ShowTrailsPayload,
  ShowChosenPayload,
  GrabSlicesResult,
  TrailNamesResult,
  CurrentNameResult,
} from "./types";
import { makeRasters, renameSelection } from "./utils/sliceProcessor";
import {
  setTrailsVisibility,
  showTrailsByName,
  getTrailNames,
} from "./utils/trailMarker";
import {
  buildFrameWithLink,
  appendFramesToPage,
} from "./utils/createMappingPage";

// Module state - current slice name for auto-naming
let currentSliceName = "Avatar";

/**
 * Tidy Mapper handler - processes messages from the UI
 */
export async function tidyMapperHandler(
  action: TidyMapperAction,
  payload: any,
  figma: any,
): Promise<any> {
  switch (action) {
    case "grab-slices":
      return await handleGrabSlices(figma);

    case "set-slice-name":
      return handleSetSliceName(payload as SetSliceNamePayload, figma);

    case "show-trails":
      return handleShowTrails(payload as ShowTrailsPayload, figma);

    case "show-chosen":
      return handleShowChosen(payload as ShowChosenPayload, figma);

    case "get-trail-names":
      return handleGetTrailNames(figma);

    case "get-current-name":
      return handleGetCurrentName();

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Grabs all slices on the current page, processes them, and organizes into mapping pages
 */
async function handleGrabSlices(figma: any): Promise<GrabSlicesResult> {
  try {
    // Process all slices (rasterize and create trails)
    const sliceData = await makeRasters();

    if (sliceData.length === 0) {
      figma.notify("No slices found on the current page");
      return {
        success: false,
        count: 0,
        message: "No slices found on the current page",
      };
    }

    // Build frames with links
    const framesWithLinks = await buildFrameWithLink(sliceData);

    // Append frames to mapping pages
    await appendFramesToPage(framesWithLinks);

    figma.notify("🎉 Exported slices!");

    // Send trail names update to UI
    const names = getTrailNames(figma.currentPage);
    figma.ui.postMessage({
      type: "trail-names-update",
      names,
    });

    return {
      success: true,
      count: sliceData.length,
      message: `Successfully exported ${sliceData.length} slices`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error grabbing slices:", error);
    figma.notify(`Error: ${errorMessage}`, { error: true });
    return {
      success: false,
      count: 0,
      message: errorMessage,
    };
  }
}

/**
 * Sets the current slice name and applies it to selected slices
 */
function handleSetSliceName(
  payload: SetSliceNamePayload,
  figma: any,
): CurrentNameResult {
  currentSliceName = payload.name;

  // Clear selection after naming
  figma.currentPage.selection = [];

  return { name: currentSliceName };
}

/**
 * Shows or hides all trail markers
 */
function handleShowTrails(
  payload: ShowTrailsPayload,
  figma: any,
): { count: number } {
  const count = setTrailsVisibility(figma.currentPage, payload.visible);
  return { count };
}

/**
 * Shows only trails matching the specified name
 */
function handleShowChosen(
  payload: ShowChosenPayload,
  figma: any,
): { count: number } {
  const count = showTrailsByName(figma.currentPage, payload.name);
  return { count };
}

/**
 * Gets all unique trail names from the current page
 */
function handleGetTrailNames(figma: any): TrailNamesResult {
  const names = getTrailNames(figma.currentPage);
  return { names };
}

/**
 * Gets the current slice name
 */
function handleGetCurrentName(): CurrentNameResult {
  return { name: currentSliceName };
}

/**
 * Sets up event listeners for selection changes
 * Called when the module is initialized
 */
export function setupSelectionListener(figma: any): void {
  figma.on("selectionchange", () => {
    // Auto-name new slices with current name
    renameSelection(currentSliceName);
  });

  figma.on("documentchange", (event: DocumentChangeEvent) => {
    for (const change of event.documentChanges) {
      if (change.type === "CREATE" && change.node.type === "SLICE") {
        // Notify UI that a new slice was created
        figma.ui.postMessage({
          type: "slice-created",
        });
      }
    }
  });
}

/**
 * Initialize the plugin - called on first load
 */
export function initializePlugin(figma: any): void {
  // Set up selection listener
  setupSelectionListener(figma);

  // Auto-name slices on run
  renameSelection(currentSliceName);
}
