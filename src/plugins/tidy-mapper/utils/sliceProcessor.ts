/// <reference types="@figma/plugin-typings" />

import { SliceData } from "../types";
import { buildTrail } from "./trailMarker";

/**
 * Rasterizes a slice to a PNG image frame
 * Exports at 2x scale for high quality
 */
async function getRaster(element: SliceNode): Promise<FrameNode> {
  const bytes = await element.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 2 },
  });

  const image = figma.createImage(bytes);
  const frame = figma.createFrame();

  frame.x = 200; // Offset from original position
  frame.resize(element.width, element.height);
  frame.fills = [
    {
      imageHash: image.hash,
      scaleMode: "FILL",
      scalingFactor: 1,
      type: "IMAGE",
    },
  ];

  return frame;
}

/**
 * Processes all slices on the current page
 * Creates rasterized images and trail markers for each slice
 */
export async function makeRasters(): Promise<SliceData[]> {
  const slices = figma.currentPage.findAll(
    (node) => node.type === "SLICE",
  ) as SliceNode[];

  const rasters: SliceData[] = [];

  for (const slice of slices) {
    if (slice.type !== "SLICE") continue;

    try {
      const raster = await getRaster(slice);
      raster.name = slice.name;

      const trail = buildTrail(slice);

      // Remove original slice after processing
      slice.remove();

      rasters.push({ raster, trail });
    } catch (error) {
      console.error(`Error processing slice "${slice.name}":`, error);
    }
  }

  return rasters;
}

/**
 * Renames all selected slices with the given name
 */
export function renameSelection(currentName: string): void {
  const selection = figma.currentPage.selection;
  if (!selection.length) return;

  if (selection[0].type === "SLICE" && selection.length === 1) {
    selection[0].name = currentName;
  } else if (selection && selection.length > 1) {
    selection.forEach((node) => {
      if (node.type === "SLICE") {
        node.name = currentName;
      }
    });
  }
}

/**
 * Gets all slice nodes from current selection
 */
export function getSelectedSlices(): SliceNode[] {
  return figma.currentPage.selection.filter(
    (node) => node.type === "SLICE",
  ) as SliceNode[];
}
