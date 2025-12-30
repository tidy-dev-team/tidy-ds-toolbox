/// <reference types="@figma/plugin-typings" />

import {
  TagsConfig,
  TagsSpacingsResult,
  ElementData,
  FrameBounds,
  TagPlacement,
  ElementCoordinates,
  SupportedContainerNode,
} from "../types";
import { DS_ANATOMY_TAGS } from "./constants";
import { getToolComp, validateInternalTools } from "./getToolComp";
import { findAllTaggableNodes } from "./elementResearch";
import {
  loadInterFont,
  loadFontsFromNodes,
  findAllTextNodes,
} from "./fontLoader";
import { generateSmartIndexes, setTextProps } from "./tagHelpers";
import { calculateOptimalTagPlacements } from "./tagPlacement";

/**
 * Get a tag instance for a specific direction
 */
function getTagInstance(
  direction: string,
  tagComp: ComponentSetNode | ComponentNode,
): InstanceNode | null {
  // Map direction to variant name (tags point opposite to placement)
  const variantMap: Record<string, string> = {
    top: "type=bottom line",
    right: "type=left line",
    bottom: "type=top line",
    left: "type=right line",
  };

  const variantName = variantMap[direction];
  if (!variantName) return null;

  const variant = (tagComp as ComponentSetNode).findOne(
    (node) => node.type === "COMPONENT" && node.name === variantName,
  ) as ComponentNode | null;

  if (!variant) {
    console.warn(`Tag variant "${variantName}" not found`);
    return null;
  }

  const instance = variant.createInstance();
  figma.currentPage.appendChild(instance);
  return instance;
}

/**
 * Create an indexes frame to hold the legend
 */
function createIndexesFrame(frame: SupportedContainerNode): FrameNode {
  const indexesFrame = figma.createFrame();
  indexesFrame.name = ".anatomy-indexes";
  indexesFrame.fills = [];
  indexesFrame.layoutMode = "VERTICAL";
  indexesFrame.itemSpacing = 8;
  indexesFrame.primaryAxisSizingMode = "AUTO";
  indexesFrame.counterAxisSizingMode = "AUTO";

  // Position below the frame
  const frameBounds = frame.absoluteBoundingBox!;
  indexesFrame.x = frameBounds.x;
  indexesFrame.y = frameBounds.y + frame.height + 52;

  return indexesFrame;
}

/**
 * Create index label for the legend
 */
function createIndexLabel(
  element: ElementData,
  tagComp: ComponentSetNode | ComponentNode,
  index: string,
  indexesFrame: FrameNode,
): InstanceNode | null {
  // Find the text type variant
  const textVariant = (tagComp as ComponentSetNode).findOne(
    (node) => node.type === "COMPONENT" && node.name === "type=text",
  ) as ComponentNode | null;

  if (!textVariant) {
    console.warn("Tag text variant not found");
    return null;
  }

  const instance = textVariant.createInstance();
  indexesFrame.appendChild(instance);

  // Set index
  setTextProps(instance, "index", index);

  // Set label
  let labelText = element.name;
  if (element.styleName) {
    const fontInfo = element.fontName
      ? ` (${element.fontName.family} ${element.fontName.style} - ${element.fontSize}px)`
      : "";
    labelText = `${element.name}, ${element.styleName}${fontInfo}`;
  }
  if (element.name === "Icon") {
    labelText = `Icon - ${Math.round(element.width)}px`;
  }

  setTextProps(instance, "label", labelText);

  // Clear the link field (not used anymore)
  setTextProps(instance, "link", "");

  instance.name = `.${index}_${element.name}`;

  return instance;
}

/**
 * Transform raw element coordinates to ElementData
 */
function transformToElementData(
  coordinates: ElementCoordinates[],
): ElementData[] {
  return coordinates.map((coord, index) => {
    const [
      x,
      y,
      width,
      height,
      name,
      linkTarget,
      styleName,
      fontName,
      fontSize,
    ] = coord;

    return {
      x,
      y,
      width,
      height,
      name,
      linkTarget: linkTarget ?? undefined,
      styleName,
      fontName,
      fontSize,
      midX: x + width / 2,
      midY: y + height / 2,
      index,
    };
  });
}

/**
 * Main orchestrator for building tags
 */
export async function buildTags(
  config: TagsConfig,
): Promise<TagsSpacingsResult> {
  const selection = figma.currentPage.selection;

  // Validate selection
  if (selection.length === 0) {
    return {
      success: false,
      message: "Please select one or more frames to add tags.",
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

  // Check for required internal tools
  const validation = validateInternalTools([DS_ANATOMY_TAGS]);
  if (!validation.valid) {
    return {
      success: false,
      message: `Missing internal tools: ${validation.missing.join(", ")}. Please run "Update Internal Tools" first.`,
    };
  }

  // Get tag component
  const tagComp = getToolComp(DS_ANATOMY_TAGS);
  if (!tagComp) {
    return {
      success: false,
      message: "Could not find anatomy tags component in internal tools.",
    };
  }

  // Load fonts
  await loadInterFont();

  // Build tags for each frame
  const allCreatedNodes: SceneNode[] = [];
  let processedCount = 0;

  for (const frame of validFrames) {
    try {
      // Find taggable elements
      const coordinates = findAllTaggableNodes(
        frame,
        config.includeInstances,
        config.includeText,
      );

      if (coordinates.length === 0) {
        continue;
      }

      // Load fonts from text nodes in the frame
      const textNodes = findAllTextNodes(frame);
      await loadFontsFromNodes(textNodes);

      // Transform to ElementData
      const elements = transformToElementData(coordinates);

      // Get frame bounds
      const frameBounds: FrameBounds = {
        x: frame.absoluteBoundingBox!.x,
        y: frame.absoluteBoundingBox!.y,
        width: frame.width,
        height: frame.height,
        centerX: frame.absoluteBoundingBox!.x + frame.width / 2,
        centerY: frame.absoluteBoundingBox!.y + frame.height / 2,
      };

      // Calculate tag placements
      const placements = calculateOptimalTagPlacements(
        elements,
        frameBounds,
        config.tagDirection,
      );

      // Generate indexes
      const indexes = generateSmartIndexes(
        elements.length,
        config.indexingScheme,
        config.startIndex,
      );

      // Create indexes frame (legend)
      const indexesFrame = createIndexesFrame(frame);

      // Create tags and index labels
      const createdTags: SceneNode[] = [];

      for (let i = 0; i < placements.length; i++) {
        const placement = placements[i];
        const index = indexes[i] || String(i + 1);

        // Create tag instance
        const tag = getTagInstance(placement.direction, tagComp);
        if (tag) {
          tag.resize(placement.width, placement.height);
          tag.x = placement.x;
          tag.y = placement.y;
          setTextProps(tag, "index", index);
          tag.name = ".tag";
          createdTags.push(tag);
        }

        // Create index label
        createIndexLabel(placement.element, tagComp, index, indexesFrame);
      }

      // Position indexes frame below all tags
      if (createdTags.length > 0) {
        let maxY = frameBounds.y + frame.height;
        for (const tag of createdTags) {
          maxY = Math.max(maxY, tag.y + tag.height);
        }
        indexesFrame.y = maxY + 52;
      }

      allCreatedNodes.push(...createdTags);
      allCreatedNodes.push(indexesFrame);
      processedCount++;
    } catch (error) {
      console.error(`Error building tags for ${frame.name}:`, error);
    }
  }

  if (processedCount === 0) {
    return {
      success: false,
      message:
        "Could not create tags. Check if the frames have taggable elements.",
    };
  }

  // Select created nodes
  figma.currentPage.selection = allCreatedNodes;
  if (allCreatedNodes.length > 0) {
    figma.viewport.scrollAndZoomIntoView(allCreatedNodes);
  }

  return {
    success: true,
    message: `Created tags for ${processedCount} frame${processedCount > 1 ? "s" : ""}.`,
    count: processedCount,
  };
}
