import type {
  ReleaseNotesAction,
  Sprint,
  ReleaseNote,
  AddNotePayload,
  EditNotePayload,
  DeleteNotePayload,
  RenameSprintPayload,
  ReleaseNotesExportData,
  CsvExportResult,
  ClearCanvasPreviewPayload,
  ClearCanvasDeletionPayload,
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
  scanComponents,
  getComponentsPayload,
  getSelectedComponentPayload,
  setLastComponentId,
  findParentPage,
} from "./utils/componentHelpers";

import {
  getFileContext,
  getFoundationPagesPayload,
  setFileKeyFromInput,
  setLastFoundationPageId,
} from "./utils/pageHelpers";

import {
  getCardAppearancePayload,
  setCardAppearance,
} from "./utils/appearanceHelpers";

import { buildSprintCsv, csvFileName } from "./utils/csv";
import { migrateSprint } from "./utils/notes";
import {
  deleteSelectedCards,
  previewClearCanvas,
  publishNotes,
} from "./render/publish";

export async function releaseNotesHandler(
  action: ReleaseNotesAction,
  payload: unknown,
  figma: PluginAPI,
): Promise<unknown> {
  switch (action) {
    case "scan-components": {
      const components = scanComponents(figma);
      return getComponentsPayload(figma, components);
    }

    // The panel's open path. Deliberately not "scan-components": the picker's
    // list is only needed once the picker is opened, and paying for it here
    // froze the plugin thread for the whole of a large file's walk before the
    // panel drew anything.
    case "load-selected-component": {
      return getSelectedComponentPayload(figma);
    }

    case "select-component": {
      const id = payload as string | null;
      setLastComponentId(figma, id);
      return { success: true };
    }

    case "load-appearance": {
      return getCardAppearancePayload(figma);
    }

    case "set-appearance": {
      // Nothing echoed back. The panel already holds this value, and two saves
      // answering out of order would let the older one overwrite the newer.
      setCardAppearance(figma, payload);
      return { success: true };
    }

    case "load-foundation-pages": {
      return getFoundationPagesPayload(figma);
    }

    case "select-foundation-page": {
      const id = payload as string | null;
      setLastFoundationPageId(figma, id);
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
          subject: data.subject,
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

    case "view-subject": {
      // A Subject is a component or a page: jump to whichever it is.
      const subjectId = payload as string;
      const node = figma.getNodeById(subjectId);
      if (!node) return { success: false };

      if (node.type === "PAGE") {
        figma.currentPage = node;
        return { success: true };
      }

      const page = findParentPage(node);
      if (page && figma.currentPage !== page) {
        figma.currentPage = page;
      }
      if ("visible" in node) {
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
      return { success: true };
    }

    case "publish-notes": {
      const sprintId = payload as string;
      const sprints = loadAllSprints(figma);
      const sprint = sprints.find((s) => s.id === sprintId);

      if (!sprint || sprint.notes.length === 0) {
        return { success: false, message: "This sprint has no notes yet." };
      }

      // The sprint decides only whether there is anything to publish. A publish
      // then redraws every card in the file, not just this sprint's.
      return publishNotes(figma, sprints);
    }

    case "preview-clear-canvas": {
      return previewClearCanvas(figma, payload as ClearCanvasPreviewPayload);
    }

    case "clear-canvas": {
      const deletionPayload = payload as ClearCanvasDeletionPayload;
      return deleteSelectedCards(figma, deletionPayload);
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

    case "export-csv": {
      const sprintId = payload as string;
      const sprint = loadAllSprints(figma).find((s) => s.id === sprintId);
      if (!sprint) {
        throw new Error("Sprint not found");
      }

      const { fileKey } = getFileContext(figma);
      const result: CsvExportResult = {
        fileName: csvFileName(sprint.name),
        csv: buildSprintCsv(sprint, fileKey),
        linksMissing: fileKey === null,
      };
      return result;
    }

    case "get-file-context": {
      return getFileContext(figma);
    }

    case "set-file-key": {
      const input = payload as string;
      const fileKey = setFileKeyFromInput(figma, input);
      if (!fileKey) {
        return {
          success: false,
          message: "That does not look like a Figma file URL.",
        };
      }
      return { success: true, fileKey };
    }

    case "import-notes": {
      try {
        const data = payload as ReleaseNotesExportData;
        if (!data || !Array.isArray(data.sprints)) {
          throw new Error("Invalid data format: sprints array is missing");
        }

        // Imported files may have been exported by an older build, so the
        // incoming sprints go through the same migration as stored ones.
        const importedSprints = data.sprints
          .map(migrateSprint)
          .filter((sprint): sprint is Sprint => sprint !== null);

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
