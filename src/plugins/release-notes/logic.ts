import type {
  ReleaseNotesAction,
  Sprint,
  ReleaseNote,
  AddNotePayload,
  EditNotePayload,
  DeleteNotePayload,
  RenameSprintPayload,
  ReleaseNotesExportData,
} from "./types";

import {
  loadAllSprints,
  saveSprint,
  deleteSprint as deleteSprintFromData,
  getLastSprintId,
  setLastSprintId,
  getSprintsPayload,
} from "./utils/sprintHelpers";

import {
  scanComponentSets,
  loadSavedComponentSets,
  getComponentSetsPayload,
  setLastComponentSetId,
  findParentPage,
} from "./utils/componentSetHelpers";

import { publishSprintNotes } from "./utils/buildReleaseNotesTable";

export async function releaseNotesHandler(
  action: ReleaseNotesAction,
  payload: unknown,
  figma: PluginAPI,
): Promise<unknown> {
  switch (action) {
    case "scan-components": {
      const componentSets = scanComponentSets(figma);
      return getComponentSetsPayload(figma, componentSets);
    }

    case "load-components": {
      const componentSets = loadSavedComponentSets(figma);
      return getComponentSetsPayload(figma, componentSets);
    }

    case "select-component": {
      const id = payload as string | null;
      setLastComponentSetId(figma, id);
      return { success: true };
    }

    case "load-sprints": {
      return getSprintsPayload(figma);
    }

    case "create-sprint": {
      const name = payload as string;
      const id = Date.now().toString();
      const sprint: Sprint = {
        id,
        name,
        notes: [],
      };

      saveSprint(figma, sprint);
      setLastSprintId(figma, id); // Auto-select newly created sprint

      return getSprintsPayload(figma);
    }

    case "rename-sprint": {
      const data = payload as RenameSprintPayload;
      const sprints = loadAllSprints(figma);
      const sprint = sprints.find((s) => s.id === data.id);

      if (sprint) {
        sprint.name = data.name;
        saveSprint(figma, sprint);
      }

      return getSprintsPayload(figma);
    }

    case "delete-sprint": {
      const id = payload as string;
      deleteSprintFromData(figma, id);

      // If deleted sprint was last selected, clear or move selection
      const lastId = getLastSprintId(figma);
      if (lastId === id) {
        const remainingSprints = loadAllSprints(figma);
        const newLastId =
          remainingSprints.length > 0 ? remainingSprints[0].id : null;
        setLastSprintId(figma, newLastId);
      }

      return getSprintsPayload(figma);
    }

    case "select-sprint": {
      const id = payload as string | null;
      setLastSprintId(figma, id);
      return { success: true };
    }

    case "add-note": {
      const data = payload as AddNotePayload;
      const sprints = loadAllSprints(figma);
      const sprint = sprints.find((s) => s.id === data.sprintId);

      if (sprint) {
        const note: ReleaseNote = {
          id: Date.now().toString(),
          description: data.description,
          tag: data.tag,
          componentSetId: data.componentSetId,
          componentSetName: data.componentSetName,
          createdAt: new Date().toISOString(),
          authorId: figma.currentUser?.id ?? "unknown",
          authorName: figma.currentUser?.name ?? "Unknown User",
        };

        sprint.notes.push(note);
        saveSprint(figma, sprint);
      }

      return getSprintsPayload(figma);
    }

    case "edit-note": {
      const data = payload as EditNotePayload;
      const sprints = loadAllSprints(figma);
      const sprint = sprints.find((s) => s.id === data.sprintId);

      if (sprint) {
        const note = sprint.notes.find((n) => n.id === data.noteId);
        if (note) {
          note.description = data.description;
          note.tag = data.tag;
          saveSprint(figma, sprint);
        }
      }

      return getSprintsPayload(figma);
    }

    case "delete-note": {
      const data = payload as DeleteNotePayload;
      const sprints = loadAllSprints(figma);
      const sprint = sprints.find((s) => s.id === data.sprintId);

      if (sprint) {
        sprint.notes = sprint.notes.filter((n) => n.id !== data.noteId);
        saveSprint(figma, sprint);
      }

      return getSprintsPayload(figma);
    }

    case "view-component": {
      const componentSetId = payload as string;
      const node = figma.getNodeById(componentSetId);
      if (node && node.type === "COMPONENT_SET") {
        // Navigate to the page containing the component set
        const page = findParentPage(node);
        if (page && figma.currentPage !== page) {
          figma.currentPage = page;
        }
        // Zoom and scroll viewport to the component set
        figma.viewport.scrollAndZoomIntoView([node]);
      }
      return { success: true };
    }

    case "publish-notes": {
      const sprintId = payload as string;
      const sprints = loadAllSprints(figma);
      const sprint = sprints.find((s) => s.id === sprintId);

      if (sprint) {
        await publishSprintNotes(figma, sprints, sprint);
      }

      return { success: true };
    }

    case "clear-canvas": {
      let removedCount = 0;

      // Iterate through all pages
      for (const page of figma.root.children) {
        if (page.type !== "PAGE") continue;

        // Find and remove component release notes frames (ending with -release-notes)
        const framesToRemove: FrameNode[] = [];
        for (const child of page.children) {
          if (child.type === "FRAME" && child.name.endsWith("-release-notes")) {
            framesToRemove.push(child);
          }
        }

        for (const frame of framesToRemove) {
          frame.remove();
          removedCount++;
        }

        // If this is the Release notes page, clear the release-notes-frame contents
        if (page.name === "Release notes") {
          const releaseNotesFrame = page.children.find(
            (child) =>
              child.type === "FRAME" && child.name === "release-notes-frame",
          ) as FrameNode | undefined;

          if (releaseNotesFrame) {
            while (releaseNotesFrame.children.length > 0) {
              releaseNotesFrame.children[0].remove();
              removedCount++;
            }
          }
        }
      }

      return { success: true, removedCount };
    }

    case "export-notes": {
      const sprints = loadAllSprints(figma);
      const exportData: ReleaseNotesExportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        sprints,
      };
      return exportData;
    }

    case "import-notes": {
      try {
        const data = payload as ReleaseNotesExportData;
        if (!data || !Array.isArray(data.sprints)) {
          throw new Error("Invalid data format: sprints array is missing");
        }

        const importedSprints = data.sprints.filter(
          (sprint) => sprint.id && sprint.name && Array.isArray(sprint.notes),
        );

        const existingSprints = loadAllSprints(figma);
        const mergedMap = new Map<string, Sprint>();
        for (const sprint of existingSprints) {
          mergedMap.set(sprint.id, sprint);
        }

        const newlyAdded: Sprint[] = [];
        for (const sprint of importedSprints) {
          if (!mergedMap.has(sprint.id)) {
            mergedMap.set(sprint.id, sprint);
            newlyAdded.push(sprint);
          }
        }

        const mergedSprints = Array.from(mergedMap.values());
        for (const sprint of mergedSprints) {
          saveSprint(figma, sprint);
        }

        let targetSprintId = getLastSprintId(figma);
        if (!targetSprintId || !mergedMap.has(targetSprintId)) {
          const newestImported = newlyAdded
            .slice()
            .sort((a, b) => parseInt(b.id) - parseInt(a.id))[0];
          targetSprintId = newestImported?.id ?? mergedSprints[0]?.id ?? null;
        }
        setLastSprintId(figma, targetSprintId);

        return {
          success: true,
          message: `Imported ${newlyAdded.length} new sprint(s)`,
          payload: getSprintsPayload(figma),
        };
      } catch (error) {
        return {
          success: false,
          message: `Import failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
