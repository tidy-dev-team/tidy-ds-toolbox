/// <reference types="@figma/plugin-typings" />

import {
  SpacingsConfig,
  TagsSpacingsResult,
  SupportedContainerNode,
} from "../types";
import { buildPaddingMarks } from "./paddingMarks";
import { buildSizeMarks } from "./sizeMarks";
import { buildItemSpacingMarks } from "./spacingMarks";
import {
  getOrCreateSizeMarkerComponents,
  getOrCreateSpacingMarkerComponents,
} from "./buildInternalComponents";
import { loadInterFont } from "./fontLoader";

/**
 * Main orchestrator for building spacing marks
 */
export async function buildSpacingMarks(
  config: SpacingsConfig,
): Promise<TagsSpacingsResult> {
  const selection = figma.currentPage.selection;

  // Validate selection
  if (selection.length === 0) {
    return {
      success: false,
      message: "Please select one or more frames to add spacing marks.",
    };
  }

  // Filter for valid container types (frames, components, instances, groups)
  const validFrames = selection.filter(
    (node): node is SupportedContainerNode =>
      node.type === "FRAME" ||
      node.type === "COMPONENT" ||
      node.type === "INSTANCE" ||
      node.type === "GROUP",
  );

  if (validFrames.length === 0) {
    return {
      success: false,
      message: "Please select frames, components, instances, or groups.",
    };
  }

  // Initialize runtime marker components (no Internal Tools dependency)
  if (config.includeSize) {
    await getOrCreateSizeMarkerComponents();
  }
  if (config.includePaddings || config.includeItemSpacing) {
    await getOrCreateSpacingMarkerComponents();
  }

  // Load fonts for markers
  await loadInterFont();

  // Build markers for each frame
  const allMarkers: InstanceNode[] = [];
  let processedCount = 0;

  for (const frame of validFrames) {
    try {
      const frameMarkers: InstanceNode[] = [];

      // Build size markers
      if (config.includeSize) {
        const sizeMarkers = await buildSizeMarks(frame, config);
        frameMarkers.push(...sizeMarkers);
      }

      // Build padding markers
      if (config.includePaddings) {
        const paddingMarkers = await buildPaddingMarks(frame, config);
        frameMarkers.push(...paddingMarkers);
      }

      // Build item spacing markers
      if (config.includeItemSpacing) {
        const spacingMarkers = await buildItemSpacingMarks(frame, config);
        frameMarkers.push(...spacingMarkers);
      }

      // Position markers relative to the frame's parent
      if (frameMarkers.length > 0) {
        allMarkers.push(...frameMarkers);
        processedCount++;
      }
    } catch (error) {
      console.error(`Error building spacing marks for ${frame.name}:`, error);
    }
  }

  if (processedCount === 0) {
    return {
      success: false,
      message:
        "Could not create spacing marks. Check if the frames have content.",
    };
  }

  // Select created markers
  figma.currentPage.selection = allMarkers;
  if (allMarkers.length > 0) {
    figma.viewport.scrollAndZoomIntoView(allMarkers);
  }

  return {
    success: true,
    message: `Created spacing marks for ${processedCount} frame${processedCount > 1 ? "s" : ""}.`,
    count: processedCount,
  };
}
