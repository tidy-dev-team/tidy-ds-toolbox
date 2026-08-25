import type {
  ComponentInfo,
  ComponentsPayload,
  SelectedComponentPayload,
} from "../types";
import { PLUGIN_NAMESPACE, LAST_COMPONENT_ID_KEY } from "./constants";

export function getLastComponentId(figma: PluginAPI): string | null {
  const id = figma.root.getSharedPluginData(
    PLUGIN_NAMESPACE,
    LAST_COMPONENT_ID_KEY,
  );
  return id || null;
}

export function setLastComponentId(figma: PluginAPI, id: string | null): void {
  figma.root.setSharedPluginData(
    PLUGIN_NAMESPACE,
    LAST_COMPONENT_ID_KEY,
    id ?? "",
  );
}

export function getComponentsPayload(
  figma: PluginAPI,
  components: ComponentInfo[],
): ComponentsPayload {
  let lastSelectedComponentId = getLastComponentId(figma);

  // Validate that the last selected component still exists
  if (
    lastSelectedComponentId &&
    !components.find((component) => component.id === lastSelectedComponentId)
  ) {
    lastSelectedComponentId = components.length > 0 ? components[0].id : null;
    setLastComponentId(figma, lastSelectedComponentId);
  }

  return { components, lastSelectedComponentId };
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
export function subjectsFromScan(nodes: ScannedNode[]): ComponentInfo[] {
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
export function scanComponents(figma: PluginAPI): ComponentInfo[] {
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

/**
 * The stored component pointer, resolved without scanning the file.
 *
 * The panel needs one thing on open: the name to show in the picker for the
 * component this file was last working on. `scanComponents` can answer that,
 * but it pays a whole-document walk to do it, and on a large file that walk is
 * seconds of frozen plugin thread before anything is drawn (ADR-0013 names this
 * as the cost legacy whole-document access defers to the first traversal).
 * A stored id resolves in one lookup, so the open costs one.
 *
 * A pointer to a node that is gone, or to something that is no longer a
 * component, answers `null` and is deliberately left in place rather than
 * rewritten: `getComponentsPayload` heals it against the real list when the
 * picker is opened, and healing it here - against no list - could only guess.
 */
export function getSelectedComponentPayload(
  figma: PluginAPI,
): SelectedComponentPayload {
  const id = getLastComponentId(figma);
  if (!id) return { component: null };

  const node = figma.getNodeById(id);
  if (!node || (node.type !== "COMPONENT_SET" && node.type !== "COMPONENT")) {
    return { component: null };
  }
  return { component: { id: node.id, name: node.name } };
}
