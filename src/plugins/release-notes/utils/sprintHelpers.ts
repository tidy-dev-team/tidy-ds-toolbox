import type { Sprint, SprintSaveResult, SprintsPayload } from "../types";
import {
  PLUGIN_NAMESPACE,
  SPRINT_KEY_PREFIX,
  LAST_SPRINT_ID_KEY,
} from "./constants";
import { migrateSprint } from "./notes";

/**
 * Every sprint stored on this file. A file can hold sprints written by an
 * older build, so each one goes through `migrateSprint` - notes that predate
 * Subject come back as component-set notes.
 */
export function loadAllSprints(figma: PluginAPI): Sprint[] {
  const keys = figma.root.getSharedPluginDataKeys(PLUGIN_NAMESPACE);
  const sprintKeys = keys.filter((key) => key.startsWith(SPRINT_KEY_PREFIX));

  const sprints: Sprint[] = [];
  for (const key of sprintKeys) {
    const data = figma.root.getSharedPluginData(PLUGIN_NAMESPACE, key);
    if (!data) continue;

    try {
      const sprint = migrateSprint(JSON.parse(data));
      if (sprint) sprints.push(sprint);
    } catch (e) {
      console.error(`Failed to parse sprint data for key ${key}:`, e);
    }
  }

  return sprints;
}

/** A failure message that names a size limit rather than a transient error. */
const SIZE_LIMIT_PATTERN = /limit|too large|maximum|exceed/i;

/**
 * Write a sprint, and report whether it actually landed.
 *
 * `setSharedPluginData` can throw - most concretely at Figma's per-entry size
 * limit - and the previous call site had no error handling at all, so a note
 * could appear to save in the panel while nothing was written underneath it.
 * The result names the sprint and says why, so a size-limit failure (trim the
 * sprint) reads differently from any other write failure (retry).
 */
export function saveSprint(figma: PluginAPI, sprint: Sprint): SprintSaveResult {
  const key = `${SPRINT_KEY_PREFIX}${sprint.id}`;
  try {
    figma.root.setSharedPluginData(
      PLUGIN_NAMESPACE,
      key,
      JSON.stringify(sprint),
    );
    return { success: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const tooLarge = SIZE_LIMIT_PATTERN.test(detail);
    return {
      success: false,
      sprintId: sprint.id,
      reason: tooLarge ? "too-large" : "write-failed",
      message: tooLarge
        ? `"${sprint.name}" was not saved: it has grown too large to store. Remove some notes and try again.`
        : `"${sprint.name}" was not saved: ${detail}`,
    };
  }
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
