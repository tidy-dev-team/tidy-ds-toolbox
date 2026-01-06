// ===================
// Data Types
// ===================

export interface ComponentSetInfo {
  id: string;
  name: string;
}

export interface ComponentSetsPayload {
  componentSets: ComponentSetInfo[];
  lastSelectedComponentSetId: string | null;
}

export type NoteTag =
  | "bug_fix"
  | "enhancement"
  | "new_component"
  | "deprecation"
  | "deleted";

export interface ReleaseNote {
  id: string;
  description: string;
  tag: NoteTag;
  componentSetId: string;
  componentSetName: string;
  createdAt: string; // ISO date string
  authorId: string;
  authorName: string;
}

export interface Sprint {
  id: string;
  name: string;
  notes: ReleaseNote[];
}

export interface SprintsPayload {
  sprints: Sprint[];
  lastSelectedSprintId: string | null;
}

// ===================
// Action Types
// ===================

export type ReleaseNotesAction =
  | "scan-components"
  | "load-components"
  | "select-component"
  | "load-sprints"
  | "create-sprint"
  | "rename-sprint"
  | "delete-sprint"
  | "select-sprint"
  | "add-note"
  | "edit-note"
  | "delete-note"
  | "view-component"
  | "publish-notes"
  | "clear-canvas";

// ===================
// Payload Types
// ===================

export interface AddNotePayload {
  sprintId: string;
  description: string;
  tag: NoteTag;
  componentSetId: string;
  componentSetName: string;
}

export interface EditNotePayload {
  sprintId: string;
  noteId: string;
  description: string;
  tag: NoteTag;
}

export interface DeleteNotePayload {
  sprintId: string;
  noteId: string;
}

export interface RenameSprintPayload {
  id: string;
  name: string;
}
