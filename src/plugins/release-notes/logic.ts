import type {
  ReleaseNotesAction,
  Sprint,
  ReleaseNote,
  AddNotePayload,
  EditNotePayload,
  DeleteNotePayload,
  RenameSprintPayload,
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
        await publishSprintNotes(figma, sprint);
      }

      return { success: true };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
