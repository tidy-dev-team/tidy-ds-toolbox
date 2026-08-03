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

/** A page offered by the Foundation section. */
export interface FoundationPageInfo {
  id: string;
  name: string;
}

/**
 * Where the Foundation list came from. `foundation-divider` means the file has
 * a real Foundation area (ADR-0011); `all-pages` means it does not and every
 * page is being offered instead, which the panel says out loud.
 */
export type FoundationPageSource = "foundation-divider" | "all-pages";

export interface FoundationPagesPayload {
  pages: FoundationPageInfo[];
  lastSelectedPageId: string | null;
  source: FoundationPageSource;
}

export type NoteTag =
  | "bug_fix"
  | "enhancement"
  | "new_component"
  | "deprecation"
  | "deleted";

/** Which kind of thing a note is about. */
export type SubjectKind = "component-set" | "foundation-page";

/**
 * The thing a ReleaseNote is about: exactly one Component Set or one
 * Foundation Page, never both. `id` is the Figma node id (a `COMPONENT_SET`
 * node, or a `PAGE` node) and `name` is a display copy kept so a note still
 * reads correctly after its node is renamed or deleted.
 */
export interface Subject {
  kind: SubjectKind;
  id: string;
  name: string;
}

export interface ReleaseNote {
  id: string;
  description: string;
  tag: NoteTag;
  subject: Subject;
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

export interface ReleaseNotesExportData {
  version: string;
  exportedAt: string;
  sprints: Sprint[];
}

/** Result of a CSV export: the UI turns this into a download. */
export interface CsvExportResult {
  fileName: string;
  csv: string;
  /** True when links could not be built because no file key is known. */
  linksMissing: boolean;
}

/** What a publish actually did, so the panel can report it. */
export interface PublishResult {
  success: true;
  fontFamily: string;
  fontFallback: boolean;
  cardsBuilt: number;
}

export interface FileContext {
  /** From `figma.fileKey`, or the key parsed from a URL the designer pasted. */
  fileKey: string | null;
  /** True when the key came from Figma rather than from a pasted URL. */
  fromFigma: boolean;
}

// ===================
// Action Types
// ===================

export type ReleaseNotesAction =
  | "scan-components"
  | "load-components"
  | "select-component"
  | "load-foundation-pages"
  | "select-foundation-page"
  | "load-sprints"
  | "create-sprint"
  | "rename-sprint"
  | "delete-sprint"
  | "select-sprint"
  | "add-note"
  | "edit-note"
  | "delete-note"
  | "view-subject"
  | "publish-notes"
  | "clear-canvas"
  | "export-notes"
  | "export-csv"
  | "get-file-context"
  | "set-file-key"
  | "import-notes";

// ===================
// Payload Types
// ===================

export interface AddNotePayload {
  sprintId: string;
  description: string;
  tag: NoteTag;
  subject: Subject;
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
