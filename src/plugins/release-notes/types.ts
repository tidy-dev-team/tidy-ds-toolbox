// ===================
// Data Types
// ===================

/**
 * One entry in the component picker: a component set, or a component that is
 * not a variant inside one.
 */
export interface ComponentInfo {
  id: string;
  name: string;
}

export interface ComponentsPayload {
  components: ComponentInfo[];
  lastSelectedComponentId: string | null;
}

/**
 * How this file's cards are drawn: one font family, one background colour.
 *
 * Stored per file rather than per designer, because a card is a shared artifact
 * on a shared canvas. The four foreground colours are not stored - they follow
 * from the background, so no stored pair can describe an unreadable card. See
 * [ADR-0012](../../../docs/adr/0012-card-appearance-is-a-per-file-setting.md).
 */
export interface CardAppearance {
  /** Family name as Figma reports it. Falls back to Inter if unavailable. */
  fontFamily: string;
  /** Six hex digits, no `#`, matching how tidy-icon-care stores a colour. */
  background: string;
}

/**
 * Answer to `load-appearance`: what the file stores, and what this machine can
 * draw with. Whether the file's font is missing here is not reported, because
 * it follows from the two and the panel would only have to re-ask after every
 * change to keep it true.
 */
export interface CardAppearancePayload {
  appearance: CardAppearance;
  /** Families carrying every style a card draws with, for the picker. */
  availableFonts: string[];
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

/**
 * Which kind of thing a note is about. `component-set` is the stored value for
 * any component subject, including a standalone component; it is never shown.
 */
export type SubjectKind = "component-set" | "foundation-page";

/**
 * The thing a ReleaseNote is about: exactly one component or one Foundation
 * Page, never both. `id` is the Figma node id (a `COMPONENT_SET` node, a
 * standalone `COMPONENT` node, or a `PAGE` node) and `name` is a display copy
 * kept so a note still reads correctly after its node is renamed or deleted.
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
  /** The family the cards were drawn with. */
  fontFamily: string;
  /** The family the file asked for, which differs when `fontFallback`. */
  fontRequested: string;
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
  | "select-component"
  | "load-appearance"
  | "set-appearance"
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
