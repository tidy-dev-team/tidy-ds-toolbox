import type { Sprint, SprintsPayload } from "../types";
import {
  PLUGIN_NAMESPACE,
  SPRINT_KEY_PREFIX,
  LAST_SPRINT_ID_KEY,
} from "./constants";

export function loadAllSprints(figma: PluginAPI): Sprint[] {
  const keys = figma.root.getSharedPluginDataKeys(PLUGIN_NAMESPACE);
  const sprintKeys = keys.filter((key) => key.startsWith(SPRINT_KEY_PREFIX));

  const sprints: Sprint[] = [];
  for (const key of sprintKeys) {
    const data = figma.root.getSharedPluginData(PLUGIN_NAMESPACE, key);
    if (data) {
      try {
        const sprint = JSON.parse(data) as Sprint;
        sprints.push(sprint);
      } catch (e) {
        console.error(`Failed to parse sprint data for key ${key}:`, e);
      }
    }
  }

  return sprints;
}

export function saveSprint(figma: PluginAPI, sprint: Sprint): void {
  const key = `${SPRINT_KEY_PREFIX}${sprint.id}`;
  figma.root.setSharedPluginData(PLUGIN_NAMESPACE, key, JSON.stringify(sprint));
}

export function deleteSprint(figma: PluginAPI, id: string): void {
  const key = `${SPRINT_KEY_PREFIX}${id}`;
  figma.root.setSharedPluginData(PLUGIN_NAMESPACE, key, "");
}

export function getLastSprintId(figma: PluginAPI): string | null {
  const id = figma.root.getSharedPluginData(
    PLUGIN_NAMESPACE,
    LAST_SPRINT_ID_KEY,
  );
  return id || null;
}

export function setLastSprintId(figma: PluginAPI, id: string | null): void {
  figma.root.setSharedPluginData(
    PLUGIN_NAMESPACE,
    LAST_SPRINT_ID_KEY,
    id ?? "",
  );
}

export function getSprintsPayload(figma: PluginAPI): SprintsPayload {
  const sprints = loadAllSprints(figma);
  let lastSelectedSprintId = getLastSprintId(figma);

  // Validate that last selected sprint still exists
  if (
    lastSelectedSprintId &&
    !sprints.find((s) => s.id === lastSelectedSprintId)
  ) {
    lastSelectedSprintId = sprints.length > 0 ? sprints[0].id : null;
    setLastSprintId(figma, lastSelectedSprintId);
  }

  return { sprints, lastSelectedSprintId };
}
