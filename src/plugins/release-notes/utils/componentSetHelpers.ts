import type { ComponentSetInfo, ComponentSetsPayload } from "../types";
import {
  PLUGIN_NAMESPACE,
  COMPONENT_SETS_KEY,
  LAST_COMPONENT_SET_ID_KEY,
} from "./constants";

export function getLastComponentSetId(figma: PluginAPI): string | null {
  const id = figma.root.getSharedPluginData(
    PLUGIN_NAMESPACE,
    LAST_COMPONENT_SET_ID_KEY,
  );
  return id || null;
}

export function setLastComponentSetId(
  figma: PluginAPI,
  id: string | null,
): void {
  figma.root.setSharedPluginData(
    PLUGIN_NAMESPACE,
    LAST_COMPONENT_SET_ID_KEY,
    id ?? "",
  );
}

export function getComponentSetsPayload(
  figma: PluginAPI,
  componentSets: ComponentSetInfo[],
): ComponentSetsPayload {
  let lastSelectedComponentSetId = getLastComponentSetId(figma);

  // Validate that last selected component set still exists
  if (
    lastSelectedComponentSetId &&
    !componentSets.find((cs) => cs.id === lastSelectedComponentSetId)
  ) {
    lastSelectedComponentSetId =
      componentSets.length > 0 ? componentSets[0].id : null;
    setLastComponentSetId(figma, lastSelectedComponentSetId);
  }

  return { componentSets, lastSelectedComponentSetId };
}

export function scanComponentSets(figma: PluginAPI): ComponentSetInfo[] {
  const componentSetNodes = figma.root.findAllWithCriteria({
    types: ["COMPONENT_SET"],
  });

  const componentSets: ComponentSetInfo[] = componentSetNodes.map((node) => ({
    id: node.id,
    name: node.name,
  }));

  // Save to shared plugin data
  figma.root.setSharedPluginData(
    PLUGIN_NAMESPACE,
    COMPONENT_SETS_KEY,
    JSON.stringify(componentSets),
  );

  return componentSets;
}

export function loadSavedComponentSets(figma: PluginAPI): ComponentSetInfo[] {
  const savedData = figma.root.getSharedPluginData(
    PLUGIN_NAMESPACE,
    COMPONENT_SETS_KEY,
  );

  let componentSets: ComponentSetInfo[] = [];
  if (savedData) {
    try {
      componentSets = JSON.parse(savedData);
    } catch (e) {
      console.error("Failed to parse saved component sets:", e);
    }
  }

  return componentSets;
}

export function findParentPage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === "PAGE") {
      return current as PageNode;
    }
    current = current.parent;
  }
  return null;
}
