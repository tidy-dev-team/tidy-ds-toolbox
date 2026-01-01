/// <reference types="@figma/plugin-typings" />

import {
  INTERNAL_TOOLS_PAGE,
  DS_ANATOMY_TAGS,
  DS_SPACING_MARKER,
  DS_SIZE_MARKER,
} from "./constants";
import { buildTagComponents } from "./buildTagComponents";
import { buildSpacingMarkers } from "./buildSpacingMarkers";
import { buildSizeMarkers } from "./buildSizeMarkers";

/**
 * Runtime caches for generated components
 */
let anatomyTagsComponents: Map<string, ComponentNode> | null = null;
let spacingMarkerComponents: Map<string, ComponentNode> | null = null;
let sizeMarkerComponents: Map<string, ComponentNode> | null = null;

function ensureToolsPage(): PageNode {
  const existing = figma.root.findChild(
    (node) => node.name === INTERNAL_TOOLS_PAGE,
  ) as PageNode | null;

  if (existing) return existing;

  const page = figma.createPage();
  page.name = INTERNAL_TOOLS_PAGE;
  return page;
}

function mapComponentSet(set: ComponentSetNode): Map<string, ComponentNode> {
  const map = new Map<string, ComponentNode>();
  set.children.forEach((child) => {
    if (child.type === "COMPONENT") {
      map.set(child.name, child);
    }
  });
  return map;
}

export async function getOrCreateAnatomyTagsComponents(): Promise<Map<
  string,
  ComponentNode
> | null> {
  if (anatomyTagsComponents) return anatomyTagsComponents;

  const toolsPage = ensureToolsPage();

  let tagSet = toolsPage.findOne(
    (node) => node.type === "COMPONENT_SET" && node.name === DS_ANATOMY_TAGS,
  ) as ComponentSetNode | null;

  if (!tagSet) {
    tagSet = buildTagComponents();
  }

  if (!tagSet) return null;

  anatomyTagsComponents = mapComponentSet(tagSet);
  return anatomyTagsComponents;
}

export async function getOrCreateSpacingMarkerComponents(): Promise<Map<
  string,
  ComponentNode
> | null> {
  if (spacingMarkerComponents) return spacingMarkerComponents;

  const toolsPage = ensureToolsPage();

  let markerSet = toolsPage.findOne(
    (node) => node.type === "COMPONENT_SET" && node.name === DS_SPACING_MARKER,
  ) as ComponentSetNode | null;

  if (!markerSet) {
    markerSet = buildSpacingMarkers();
  }

  if (!markerSet) return null;

  spacingMarkerComponents = mapComponentSet(markerSet);
  return spacingMarkerComponents;
}

export async function getOrCreateSizeMarkerComponents(): Promise<Map<
  string,
  ComponentNode
> | null> {
  if (sizeMarkerComponents) return sizeMarkerComponents;

  const toolsPage = ensureToolsPage();

  let markerSet = toolsPage.findOne(
    (node) => node.type === "COMPONENT_SET" && node.name === DS_SIZE_MARKER,
  ) as ComponentSetNode | null;

  if (!markerSet) {
    markerSet = buildSizeMarkers();
  }

  if (!markerSet) return null;

  sizeMarkerComponents = mapComponentSet(markerSet);
  return sizeMarkerComponents;
}
