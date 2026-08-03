import type { ComponentSetInfo, ComponentSetsPayload } from "../types";
import { PLUGIN_NAMESPACE, LAST_COMPONENT_SET_ID_KEY } from "./constants";

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

/** A scanned node, described without the Figma API so the rule can be tested. */
export interface ScannedNode {
  id: string;
  name: string;
  parentType: string | null;
}

/**
 * Which scanned nodes the picker offers: every component set, plus every
 * component that is not a variant inside one.
 *
 * A component with no variants - a Divider, say - is a real subject and has no
 * set to represent it, so scanning for sets alone made it unreachable. A
 * variant is the opposite case: its set already stands for it, and offering it
 * as well would put "Size=Large, State=Hover" in the list beside "Button".
 */
export function subjectsFromScan(nodes: ScannedNode[]): ComponentSetInfo[] {
  return nodes
    .filter((node) => node.parentType !== "COMPONENT_SET")
    .map(({ id, name }) => ({ id, name }));
}

/**
 * The list the picker offers, read from the file every time it is asked for.
 *
 * An earlier version cached this list in shared plugin data and served the
 * cache when the panel opened. The cache outlived the rule that built it: after
 * standalone components became subjects, a file scanned by an older build kept
 * offering the old set-only list, and the only way out was a refresh button
 * with no label. A whole-file walk on open costs less than a list that can be
 * silently wrong.
 */
export function scanComponentSets(figma: PluginAPI): ComponentSetInfo[] {
  const nodes = figma.root.findAllWithCriteria({
    types: ["COMPONENT_SET", "COMPONENT"],
  });

  return subjectsFromScan(
    nodes.map((node) => ({
      id: node.id,
      name: node.name,
      parentType: node.parent?.type ?? null,
    })),
  );
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
