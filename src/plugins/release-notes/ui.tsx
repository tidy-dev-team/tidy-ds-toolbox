import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Card, FormControl, SuggestInput } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import {
  IconFocus2,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconNote,
  IconComponents,
  IconArrowIteration,
  IconPlus,
  IconPalette,
  IconBrush,
} from "@tabler/icons-react";
import type {
  CardAppearance,
  CardAppearancePayload,
  ComponentInfo,
  ComponentsPayload,
  CsvExportResult,
  FileContext,
  FoundationPageInfo,
  FoundationPageSource,
  FoundationPagesPayload,
  SelectedComponentPayload,
  PublishResult,
  Sprint,
  SprintsPayload,
  ReleaseNote,
  NoteTag,
  Subject,
  AddNotePayload,
  EditNotePayload,
  DeleteNotePayload,
  RenameSprintPayload,
  ReleaseNotesExportData,
  ReleaseNotesAction,
  ClearCanvasCandidate,
  ClearCanvasDeletionPayload,
  ClearCanvasDeletionResult,
  ClearCanvasPreviewPayload,
  ClearCanvasPreviewResult,
} from "./types";
import { TAG_OPTIONS, TAG_COLORS, TAG_LABELS } from "./utils/constants";
import { DEFAULT_CARD_APPEARANCE } from "./utils/appearance";
import {
  clearCanvasOwnershipLabel,
  defaultClearCanvasSelection,
} from "./utils/clearCanvas";

interface PendingRequest {
  onSuccess?: (result: unknown) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

// ===================
// Note Card Component
// ===================

interface NoteCardProps {
  note: ReleaseNote;
  onView: (note: ReleaseNote) => void;
  onEdit: (note: ReleaseNote) => void;
  onDelete: (noteId: string) => void;
  deleteDisabled?: boolean;
}

function NoteCard({
  note,
  onView,
  onEdit,
  onDelete,
  deleteDisabled = false,
}: NoteCardProps) {
  const tagColor = TAG_COLORS[note.tag];
  const tagLabel = TAG_LABELS[note.tag];

  return (
    <div className="note">
      {/* Tag Badge */}
      <div
        style={{
          display: "inline-block",
          backgroundColor: tagColor,
          color: "white",
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: "bold",
          marginBottom: "var(--pixel-8, 8px)",
        }}
      >
        {tagLabel}
      </div>

      {/* Description */}
      <div style={{ marginBottom: "var(--pixel-8, 8px)", fontSize: "13px" }}>
        {truncateText(note.description, 100)}
      </div>

      {/* Subject */}
      <div style={{ marginBottom: "4px", fontSize: "12px" }}>
        <span style={{ opacity: 0.6 }}>
          {note.subject.kind === "foundation-page"
            ? "Foundation: "
            : "Component: "}
        </span>
        <span style={{ color: "#9747FF" }}>{note.subject.name}</span>
      </div>

      {/* Date & Author */}
      <div
        style={{
          marginBottom: "var(--pixel-8, 8px)",
          fontSize: "11px",
          opacity: 0.6,
        }}
      >
        {formatDate(note.createdAt)} • {note.authorName}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--pixel-4, 4px)" }}>
        <button
          onClick={() => onView(note)}
          style={{
            flex: 1,
            padding: "var(--pixel-6, 6px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "transparent",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--pixel-4, 4px)",
            cursor: "pointer",
            color: "var(--figma-color-text, #333)",
          }}
          tool-tip="View component"
        >
          <IconFocus2 size={16} />
        </button>
        <button
          onClick={() => onEdit(note)}
          style={{
            flex: 1,
            padding: "var(--pixel-6, 6px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "transparent",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--pixel-4, 4px)",
            cursor: "pointer",
            color: "var(--figma-color-text, #333)",
          }}
          tool-tip="Edit note"
        >
          <IconEdit size={16} />
        </button>
        <button
          onClick={() => onDelete(note.id)}
          disabled={deleteDisabled}
          style={{
            flex: 1,
            padding: "var(--pixel-6, 6px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "transparent",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--pixel-4, 4px)",
            cursor: "pointer",
            color: "var(--figma-color-text, #333)",
          }}
          tool-tip="Delete note"
        >
          <IconTrash size={16} />
        </button>
      </div>
    </div>
  );
}

// ===================
// Modal Component
// ===================

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ isOpen, title, onClose, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog" onMouseDown={onClose}>
      <div className="inner-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 var(--pixel-16, 16px) 0" }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ===================
// Main Plugin UI
// ===================

export function ReleaseNotesUI() {
  // ===================
  // Component Sets State
  // ===================
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [appearance, setAppearance] = useState<CardAppearance>(
    DEFAULT_CARD_APPEARANCE,
  );
  const [availableFonts, setAvailableFonts] = useState<string[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(
    null,
  );
  const [componentSearchValue, setComponentSearchValue] = useState<string>("");
  // The picker's list is scanned on first use, not on open. `null` is "not
  // asked for yet", which is what lets the input say so instead of claiming the
  // file has no components in it.
  const [componentsScan, setComponentsScan] = useState<
    "idle" | "scanning" | "done"
  >("idle");
  // The component this file was last working on, resolved on open without a
  // scan. Held apart from `components` because that list is empty until the
  // picker is first used, and the selection has to survive that gap: it is what
  // "Add note" needs to know there is a subject.
  const [restoredComponent, setRestoredComponent] =
    useState<ComponentInfo | null>(null);

  // ===================
  // Foundation State
  // ===================
  const [foundationPages, setFoundationPages] = useState<FoundationPageInfo[]>(
    [],
  );
  const [foundationSource, setFoundationSource] =
    useState<FoundationPageSource>("foundation-divider");
  const [selectedFoundationPageId, setSelectedFoundationPageId] = useState<
    string | null
  >(null);

  /**
   * Which section owns the Subject of the next note. A note is about a
   * component or a Foundation page, never both, so picking in one section
   * releases the other.
   */
  const [subjectKind, setSubjectKind] = useState<
    "component-set" | "foundation-page" | null
  >(null);

  // ===================
  // Sprint State
  // ===================
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [newSprintName, setNewSprintName] = useState<string>("");
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [renameSprintName, setRenameSprintName] = useState<string>("");
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] =
    useState<boolean>(false);

  // ===================
  // Note State
  // ===================
  const [isNoteModalOpen, setIsNoteModalOpen] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<ReleaseNote | null>(null);
  const [noteDescription, setNoteDescription] = useState<string>("");
  const [noteTag, setNoteTag] = useState<NoteTag>("enhancement");
  const [isDeleteNoteConfirmOpen, setIsDeleteNoteConfirmOpen] =
    useState<boolean>(false);
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(
    null,
  );
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isClearingCanvas, setIsClearingCanvas] = useState<boolean>(false);
  const [isClearCanvasReviewOpen, setIsClearCanvasReviewOpen] =
    useState<boolean>(false);
  const [clearCanvasCandidates, setClearCanvasCandidates] = useState<
    ClearCanvasCandidate[]
  >([]);
  const [selectedClearCanvasIds, setSelectedClearCanvasIds] = useState<
    string[]
  >([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // ===================
  // UI State
  // ===================
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Shown when a publish had to fall back from the file's font to Inter. */
  const [fontNotice, setFontNotice] = useState<string | null>(null);
  /** Shown when a publish found pre-stamp frames it deliberately left alone. */
  const [legacyNotice, setLegacyNotice] = useState<string | null>(null);
  const [fileContext, setFileContext] = useState<FileContext | null>(null);
  const [fileUrlInput, setFileUrlInput] = useState<string>("");
  const [isFileUrlPromptOpen, setIsFileUrlPromptOpen] =
    useState<boolean>(false);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  // ===================
  // Derived State
  // ===================
  const selectedSprint = useMemo(
    () => sprints.find((s) => s.id === selectedSprintId),
    [sprints, selectedSprintId],
  );

  // The scanned list is authoritative once it exists, because it carries the
  // current name. Before it does, the pointer resolved on open stands in, so
  // the panel opens with a usable subject instead of one that appears only
  // after the user touches the picker.
  const selectedComponent = useMemo(() => {
    const fromScan = components.find(
      (component) => component.id === selectedComponentId,
    );
    if (fromScan) return fromScan;
    return restoredComponent?.id === selectedComponentId
      ? restoredComponent
      : undefined;
  }, [components, selectedComponentId, restoredComponent]);

  const currentSprintNotes = useMemo(() => {
    if (!selectedSprint) return [];
    return [...selectedSprint.notes].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [selectedSprint]);

  const filteredComponents = useMemo(() => {
    return components
      .filter((cs) => !cs.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [components]);

  const componentOptions = useMemo(
    () => filteredComponents.map((component) => component.name),
    [filteredComponents],
  );

  const selectedFoundationPage = useMemo(
    () => foundationPages.find((page) => page.id === selectedFoundationPageId),
    [foundationPages, selectedFoundationPageId],
  );

  /** The Subject the next note will be about, or null if nothing is picked. */
  const activeSubject = useMemo<Subject | null>(() => {
    if (subjectKind === "foundation-page" && selectedFoundationPage) {
      return {
        kind: "foundation-page",
        id: selectedFoundationPage.id,
        name: selectedFoundationPage.name,
      };
    }
    if (subjectKind === "component-set" && selectedComponent) {
      return {
        kind: "component-set",
        id: selectedComponent.id,
        name: selectedComponent.name,
      };
    }
    return null;
  }, [subjectKind, selectedFoundationPage, selectedComponent]);

  const canAddNote = Boolean(selectedSprintId && activeSubject);
  const isDestructiveActionBusy =
    isPublishing || isClearingCanvas || isClearCanvasReviewOpen;

  // ===================
  // Request Helper
  // ===================
  const sendRequest = useCallback(
    (
      action: ReleaseNotesAction,
      payload: unknown,
      handlers: PendingRequest = {},
    ) => {
      const requestId = `release-notes-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: "release-notes",
        action,
        payload,
        requestId,
      });
      return requestId;
    },
    [],
  );

  /**
   * The file's stored appearance and this machine's font list, read once on
   * open. The list cannot change while the panel is up, so a save never needs
   * to fetch it again.
   */
  const applyAppearance = useCallback((payload: CardAppearancePayload) => {
    setAppearance(payload.appearance);
    setAvailableFonts(payload.availableFonts);
  }, []);

  // ===================
  // Initialization
  // ===================
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message) return;

      // Handle request responses
      if (message.requestId) {
        const handlers = pendingRequests.current.get(message.requestId);
        if (handlers) {
          pendingRequests.current.delete(message.requestId);
          if (message.type === "error") {
            handlers.onError?.(message.error ?? "Unknown error");
          } else {
            handlers.onSuccess?.(message.result);
          }
          handlers.onFinally?.();
        }
      }
    };

    window.addEventListener("message", handleMessage);

    // Load data on startup. Note what this does NOT do: scan the file.
    //
    // It used to open with "scan-components", a whole-document walk on the
    // plugin thread, and that walk is what made opening the panel freeze Figma
    // for seconds on a large file - the thread that runs it is the one that
    // draws the UI and answers the Bridge, so nothing else moved until it
    // finished. The list it fetched was not needed yet either: it fills a
    // picker the user has not opened.
    //
    // So the open path asks only for the stored component, which is one node
    // lookup, and the walk moves to the first use of the picker
    // (`ensureComponentsScanned`). The list is still scanned rather than
    // cached, so it can never describe the file as an older build saw it -
    // that rule is unchanged, only its timing is.
    sendRequest(
      "load-selected-component",
      {},
      {
        onSuccess: (result) => {
          const { component } = result as SelectedComponentPayload;
          if (!component) return;
          setRestoredComponent(component);
          setSelectedComponentId(component.id);
          setComponentSearchValue(component.name);
          setSubjectKind((current) => current ?? "component-set");
        },
      },
    );

    sendRequest(
      "load-appearance",
      {},
      {
        onSuccess: (result) => applyAppearance(result as CardAppearancePayload),
      },
    );

    sendRequest(
      "load-foundation-pages",
      {},
      {
        onSuccess: (result) => {
          const payload = result as FoundationPagesPayload;
          setFoundationPages(payload.pages);
          setFoundationSource(payload.source);
          setSelectedFoundationPageId(payload.lastSelectedPageId);
        },
      },
    );

    sendRequest(
      "load-sprints",
      {},
      {
        onSuccess: (result) => {
          const payload = result as SprintsPayload;
          setSprints(payload.sprints);
          setSelectedSprintId(payload.lastSelectedSprintId);
        },
      },
    );

    sendRequest(
      "get-file-context",
      {},
      {
        onSuccess: (result) => setFileContext(result as FileContext),
      },
    );

    return () => window.removeEventListener("message", handleMessage);
  }, [sendRequest, applyAppearance]);

  // ===================
  // Card Appearance Handlers
  // ===================
  /**
   * The panel holds the value; the save is fire and report-on-failure.
   *
   * Deliberately not applied from the response. Two saves in quick succession
   * can return in either order, and applying them would let the older one land
   * last: the field would read the previous background while the file, and so
   * the next publish, held the newer one. Nothing in the response is news
   * anyway. `set-appearance` only echoes what was just sent, and the plugin
   * normalises it exactly as the panel already has, since the panel only ever
   * sends a family from `availableFonts` or a six-digit hex.
   */
  const saveAppearance = useCallback(
    (next: CardAppearance) => {
      setAppearance(next);
      sendRequest("set-appearance", next, {
        onError: (error) => setErrorMessage(error),
      });
    },
    [sendRequest],
  );

  /**
   * What the field shows while it is being typed in. Separate from `appearance`
   * so the panel can never claim a font the file does not hold: a datalist is a
   * suggestion list on a plain text input, so it accepts anything typed, and
   * echoing that into `appearance` would show Arial beside cards published in
   * Inter.
   */
  const [fontDraft, setFontDraft] = useState<string | null>(null);

  const handleFontChange = useCallback(
    (value: string) => {
      setFontDraft(value);
      // A real family saves immediately, which is what picking from the list
      // does. Anything else is still being typed.
      if (availableFonts.includes(value)) {
        setFontDraft(null);
        saveAppearance({ ...appearance, fontFamily: value });
      }
    },
    [appearance, availableFonts, saveAppearance],
  );

  /** Leaving the field on a name that is not a usable family abandons it. */
  const handleFontBlur = useCallback(() => setFontDraft(null), []);

  /**
   * Derived, not reported by the plugin. Asking the plugin again after every
   * save is what made two saves able to answer out of order; the font list is a
   * property of this machine and the answer follows from it.
   */
  const fontMissingHere =
    availableFonts.length > 0 &&
    !availableFonts.includes(appearance.fontFamily);

  /** As above: a half-typed hex shows in the field but never in `appearance`. */
  const [backgroundDraft, setBackgroundDraft] = useState<string | null>(null);

  const handleBackgroundChange = useCallback(
    (value: string) => {
      const hex = value.replace("#", "").slice(0, 6).toUpperCase();
      // Six digits is the first point the colour means anything.
      if (/^[0-9A-F]{6}$/.test(hex)) {
        setBackgroundDraft(null);
        saveAppearance({ ...appearance, background: hex });
        return;
      }
      setBackgroundDraft(hex);
    },
    [appearance, saveAppearance],
  );

  const handleBackgroundBlur = useCallback(() => setBackgroundDraft(null), []);

  // ===================
  // Component Set Handlers
  // ===================
  /**
   * Scan the file for the picker's list.
   *
   * This is the expensive call in this panel - a whole-document walk on the
   * plugin thread, which freezes Figma for its duration on a large file. It is
   * kept out of the open path and run when the list is actually wanted, so the
   * cost lands on someone who has asked for it and is looking at a spinner.
   *
   * `announce` separates the two callers: the refresh button reports what it
   * found, the picker opening itself does not, because a status line nobody
   * asked for reads as an error when it says "Found 0".
   */
  const runComponentScan = useCallback(
    ({ announce }: { announce: boolean }) => {
      setComponentsScan("scanning");
      sendRequest(
        "scan-components",
        {},
        {
          onSuccess: (result) => {
            const payload = result as ComponentsPayload;
            setComponents(payload.components);
            setSelectedComponentId(payload.lastSelectedComponentId);
            if (payload.lastSelectedComponentId) {
              const selected = payload.components.find(
                (component) => component.id === payload.lastSelectedComponentId,
              );
              if (selected) {
                setComponentSearchValue(selected.name);
              }
            }
            if (announce) {
              setStatusMessage(`Found ${payload.components.length} components`);
            }
          },
          onError: (error) => setErrorMessage(error),
          onFinally: () => setComponentsScan("done"),
        },
      );
    },
    [sendRequest],
  );

  /** The refresh button: always rescans, and says what it found. */
  const handleScanComponents = useCallback(
    () => runComponentScan({ announce: true }),
    [runComponentScan],
  );

  /**
   * The picker's first use. Idempotent, so focusing the input repeatedly does
   * not queue a second walk behind the first - and a rescan after that is the
   * refresh button's job, which is the one the user can see.
   */
  const ensureComponentsScanned = useCallback(() => {
    if (componentsScan !== "idle") return;
    runComponentScan({ announce: false });
  }, [componentsScan, runComponentScan]);

  const handleComponentSelect = useCallback(
    (id: string | null) => {
      const nextId = id || null;
      setSelectedComponentId(nextId);
      const selected = components.find((component) => component.id === nextId);
      if (selected) {
        setComponentSearchValue(selected.name);
      } else if (!nextId) {
        setComponentSearchValue("");
      }
      sendRequest("select-component", nextId);

      // One Subject at a time: picking a component releases the page.
      if (nextId) {
        setSubjectKind("component-set");
        setSelectedFoundationPageId(null);
        sendRequest("select-foundation-page", null);
      } else {
        setSubjectKind((current) =>
          current === "component-set" ? null : current,
        );
      }
    },
    [components, sendRequest],
  );

  // ===================
  // Foundation Handlers
  // ===================
  const handleReloadFoundationPages = useCallback(() => {
    sendRequest(
      "load-foundation-pages",
      {},
      {
        onSuccess: (result) => {
          const payload = result as FoundationPagesPayload;
          setFoundationPages(payload.pages);
          setFoundationSource(payload.source);
          setSelectedFoundationPageId(payload.lastSelectedPageId);
          setStatusMessage(`Found ${payload.pages.length} page(s)`);
        },
        onError: (error) => setErrorMessage(error),
      },
    );
  }, [sendRequest]);

  const handleFoundationSelect = useCallback(
    (id: string | null) => {
      const nextId = id || null;
      setSelectedFoundationPageId(nextId);
      sendRequest("select-foundation-page", nextId);

      if (nextId) {
        setSubjectKind("foundation-page");
        setSelectedComponentId(null);
        setComponentSearchValue("");
        sendRequest("select-component", null);
      } else {
        setSubjectKind((current) =>
          current === "foundation-page" ? null : current,
        );
      }
    },
    [sendRequest],
  );

  const handleComponentSearch = useCallback(
    (value: string) => {
      setComponentSearchValue(value);

      if (!value) {
        handleComponentSelect(null);
        return;
      }

      const match = filteredComponents.find(
        (component) => component.name.toLowerCase() === value.toLowerCase(),
      );
      if (match) {
        handleComponentSelect(match.id);
      }
    },
    [filteredComponents, handleComponentSelect],
  );

  // ===================
  // Sprint Handlers
  // ===================
  const handleSprintSelect = useCallback(
    (id: string) => {
      setSelectedSprintId(id);
      sendRequest("select-sprint", id);
    },
    [sendRequest],
  );

  const handleCreateSprint = useCallback(() => {
    const trimmedName = newSprintName.trim();
    if (!trimmedName) return;

    sendRequest("create-sprint", trimmedName, {
      onSuccess: (result) => {
        const payload = result as SprintsPayload;
        setSprints(payload.sprints);
        setSelectedSprintId(payload.lastSelectedSprintId);
        setNewSprintName("");
        setStatusMessage(`Created sprint: ${trimmedName}`);
      },
      onError: (error) => setErrorMessage(error),
    });
  }, [newSprintName, sendRequest]);

  const handleStartRename = useCallback(() => {
    if (selectedSprint) {
      setRenameSprintName(selectedSprint.name);
      setIsRenaming(true);
    }
  }, [selectedSprint]);

  const handleConfirmRename = useCallback(() => {
    const trimmedName = renameSprintName.trim();
    if (!trimmedName || !selectedSprintId) return;

    const payload: RenameSprintPayload = {
      id: selectedSprintId,
      name: trimmedName,
    };
    sendRequest("rename-sprint", payload, {
      onSuccess: (result) => {
        const sprintsPayload = result as SprintsPayload;
        setSprints(sprintsPayload.sprints);
        setIsRenaming(false);
        setRenameSprintName("");
        setStatusMessage(`Renamed sprint to: ${trimmedName}`);
      },
      onError: (error) => setErrorMessage(error),
    });
  }, [renameSprintName, selectedSprintId, sendRequest]);

  const handleCancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameSprintName("");
  }, []);

  const handleConfirmDeleteSprint = useCallback(() => {
    if (!selectedSprintId) return;

    sendRequest("delete-sprint", selectedSprintId, {
      onSuccess: (result) => {
        const payload = result as SprintsPayload;
        setSprints(payload.sprints);
        setSelectedSprintId(payload.lastSelectedSprintId);
        setIsDeleteConfirmOpen(false);
        setStatusMessage("Sprint deleted");
      },
      onError: (error) => setErrorMessage(error),
    });
  }, [selectedSprintId, sendRequest]);

  const handlePublishNotes = useCallback(() => {
    if (!selectedSprintId || isClearingCanvas || isClearCanvasReviewOpen)
      return;

    setIsPublishing(true);
    sendRequest("publish-notes", selectedSprintId, {
      onSuccess: (result) => {
        const publish = result as
          | PublishResult
          | { success: false; message: string };
        if (!publish.success) {
          setErrorMessage(publish.message);
          return;
        }
        setFontNotice(
          publish.fontFallback
            ? `${publish.fontRequested} is not available here, so the cards were drawn with ${publish.fontFamily}. Install ${publish.fontRequested}, or publish from the Figma desktop app, for the intended type.`
            : null,
        );
        setLegacyNotice(
          publish.legacyCardsFound > 0
            ? `${publish.legacyCardsFound} unverified legacy-name match(es) were left on the canvas. Use Delete from canvas to review each candidate. A match may be a designer-owned frame.`
            : null,
        );
        setStatusMessage(
          `Published ${publish.cardsBuilt} card(s) in ${publish.fontFamily}`,
        );
      },
      onError: (error) => setErrorMessage(error),
      onFinally: () => setIsPublishing(false),
    });
  }, [
    selectedSprintId,
    isClearingCanvas,
    isClearCanvasReviewOpen,
    sendRequest,
  ]);

  const handleClearCanvas = useCallback(() => {
    if (isPublishing || isClearingCanvas || isClearCanvasReviewOpen) return;

    const payload: ClearCanvasPreviewPayload = {};
    setIsClearingCanvas(true);
    sendRequest("preview-clear-canvas", payload, {
      onSuccess: (result) => {
        const preview = result as ClearCanvasPreviewResult;
        setClearCanvasCandidates(preview.candidates);
        setSelectedClearCanvasIds(
          defaultClearCanvasSelection(preview.candidates),
        );

        if (preview.candidates.length === 0) {
          setIsClearCanvasReviewOpen(false);
          setStatusMessage(
            "No release note card candidates found on the canvas.",
          );
          return;
        }

        setIsClearCanvasReviewOpen(true);
      },
      onError: (error) => {
        setClearCanvasCandidates([]);
        setSelectedClearCanvasIds([]);
        setIsClearCanvasReviewOpen(false);
        setErrorMessage(error);
      },
      onFinally: () => setIsClearingCanvas(false),
    });
  }, [isPublishing, isClearingCanvas, isClearCanvasReviewOpen, sendRequest]);

  const handleCloseClearCanvasReview = useCallback(() => {
    if (isClearingCanvas) return;
    setIsClearCanvasReviewOpen(false);
    setClearCanvasCandidates([]);
    setSelectedClearCanvasIds([]);
  }, [isClearingCanvas]);

  const handleViewClearCanvasCandidate = useCallback(
    (nodeId: string) => {
      if (isClearingCanvas) return;

      sendRequest("view-subject", nodeId, {
        onSuccess: (result) => {
          const view = result as { success: boolean };
          if (!view.success) {
            setErrorMessage("This frame is no longer available.");
          }
        },
        onError: (error) => setErrorMessage(error),
      });
    },
    [isClearingCanvas, sendRequest],
  );

  const handleToggleClearCanvasCandidate = useCallback(
    (nodeId: string, checked: boolean) => {
      setSelectedClearCanvasIds((current) => {
        if (checked) {
          return current.includes(nodeId) ? current : [...current, nodeId];
        }
        return current.filter((id) => id !== nodeId);
      });
    },
    [],
  );

  const handleConfirmClearCanvas = useCallback(() => {
    if (isClearingCanvas || selectedClearCanvasIds.length === 0) return;

    const payload: ClearCanvasDeletionPayload = {
      nodeIds: [...selectedClearCanvasIds],
    };
    setIsClearingCanvas(true);
    sendRequest("clear-canvas", payload, {
      onSuccess: (result) => {
        const deletion = result as ClearCanvasDeletionResult;
        setIsClearCanvasReviewOpen(false);
        setClearCanvasCandidates([]);
        setSelectedClearCanvasIds([]);
        setStatusMessage(
          deletion.skippedCount > 0
            ? `Removed ${deletion.removedCount} frame(s). ${deletion.skippedCount} selected candidate(s) were no longer eligible.`
            : `Removed ${deletion.removedCount} frame(s) from the canvas.`,
        );
      },
      onError: (error) => setErrorMessage(error),
      onFinally: () => setIsClearingCanvas(false),
    });
  }, [isClearingCanvas, selectedClearCanvasIds, sendRequest]);

  const downloadFile = useCallback(
    (contents: string, mimeType: string, fileName: string) => {
      const blob = new Blob([contents], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [],
  );

  const handleExportCsv = useCallback(() => {
    if (!selectedSprintId) return;

    setIsExportingCsv(true);
    sendRequest("export-csv", selectedSprintId, {
      onSuccess: (result) => {
        const data = result as CsvExportResult;
        // A BOM so Excel opens the emoji and accents in page names correctly.
        downloadFile("﻿" + data.csv, "text/csv;charset=utf-8", data.fileName);
        setStatusMessage(
          data.linksMissing
            ? `Exported ${data.fileName} without links - no file key yet`
            : `Exported ${data.fileName}`,
        );
        if (data.linksMissing) setIsFileUrlPromptOpen(true);
      },
      onError: (error) => setErrorMessage(error),
      onFinally: () => setIsExportingCsv(false),
    });
  }, [downloadFile, selectedSprintId, sendRequest]);

  const handleSaveFileKey = useCallback(() => {
    const input = fileUrlInput.trim();
    if (!input) return;

    sendRequest("set-file-key", input, {
      onSuccess: (result) => {
        const response = result as
          | { success: true; fileKey: string }
          | { success: false; message: string };
        if (!response.success) {
          setErrorMessage(response.message);
          return;
        }
        setFileContext({ fileKey: response.fileKey, fromFigma: false });
        setFileUrlInput("");
        setIsFileUrlPromptOpen(false);
        setStatusMessage("File link saved. CSV exports will include links.");
      },
      onError: (error) => setErrorMessage(error),
    });
  }, [fileUrlInput, sendRequest]);

  const handleExportNotes = useCallback(() => {
    setIsExporting(true);
    sendRequest("export-notes", null, {
      onSuccess: (result) => {
        const data = result as ReleaseNotesExportData;
        downloadFile(
          JSON.stringify(data, null, 2),
          "application/json",
          `release-notes-${new Date().toISOString().slice(0, 10)}.json`,
        );
        setStatusMessage("Release notes exported");
      },
      onError: (error) => setErrorMessage(error),
      onFinally: () => setIsExporting(false),
    });
  }, [downloadFile, sendRequest]);

  const handleImportNotes = useCallback(() => {
    setIsImporting(true);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.oncancel = () => {
      setIsImporting(false);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        setIsImporting(false);
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text) as ReleaseNotesExportData;
        sendRequest("import-notes", data, {
          onSuccess: (result) => {
            const response = result as {
              success: boolean;
              message: string;
              payload?: SprintsPayload;
            };
            if (!response.success) {
              setErrorMessage(response.message);
              return;
            }
            if (response.payload) {
              setSprints(response.payload.sprints);
              setSelectedSprintId(response.payload.lastSelectedSprintId);
            }
            setStatusMessage(response.message);
          },
          onError: (error) => setErrorMessage(error),
          onFinally: () => setIsImporting(false),
        });
      } catch (error) {
        setIsImporting(false);
        setErrorMessage(
          error instanceof Error ? error.message : "Invalid JSON file",
        );
      }
    };
    input.click();
  }, [sendRequest]);

  // ===================
  // Note Handlers
  // ===================
  const handleOpenAddNote = useCallback(() => {
    setEditingNote(null);
    setNoteDescription("");
    setNoteTag("enhancement");
    setIsNoteModalOpen(true);
  }, []);

  const handleOpenEditNote = useCallback((note: ReleaseNote) => {
    setEditingNote(note);
    setNoteDescription(note.description);
    setNoteTag(note.tag);
    setIsNoteModalOpen(true);
  }, []);

  const handleCloseNoteModal = useCallback(() => {
    setIsNoteModalOpen(false);
    setEditingNote(null);
    setNoteDescription("");
    setNoteTag("enhancement");
  }, []);

  const handleViewNoteSubject = useCallback(
    (note: ReleaseNote) => {
      sendRequest("view-subject", note.subject.id);
    },
    [sendRequest],
  );

  const handleSaveNote = useCallback(() => {
    const trimmedDescription = noteDescription.trim();
    if (!trimmedDescription || !selectedSprintId) return;
    if (!editingNote && !activeSubject) return;

    if (editingNote) {
      const payload: EditNotePayload = {
        sprintId: selectedSprintId,
        noteId: editingNote.id,
        description: trimmedDescription,
        tag: noteTag,
      };
      sendRequest("edit-note", payload, {
        onSuccess: (result) => {
          const sprintsPayload = result as SprintsPayload;
          setSprints(sprintsPayload.sprints);
          handleCloseNoteModal();
          setStatusMessage("Note updated");
        },
        onError: (error) => setErrorMessage(error),
      });
    } else {
      const payload: AddNotePayload = {
        sprintId: selectedSprintId,
        description: trimmedDescription,
        tag: noteTag,
        subject: activeSubject as Subject,
      };
      sendRequest("add-note", payload, {
        onSuccess: (result) => {
          const sprintsPayload = result as SprintsPayload;
          setSprints(sprintsPayload.sprints);
          handleCloseNoteModal();
          setStatusMessage("Note added");
        },
        onError: (error) => setErrorMessage(error),
      });
    }
  }, [
    noteDescription,
    noteTag,
    selectedSprintId,
    activeSubject,
    editingNote,
    handleCloseNoteModal,
    sendRequest,
  ]);

  const handleOpenDeleteNoteConfirm = useCallback((noteId: string) => {
    setPendingDeleteNoteId(noteId);
    setIsDeleteNoteConfirmOpen(true);
  }, []);

  const handleConfirmDeleteNote = useCallback(() => {
    if (!pendingDeleteNoteId || !selectedSprintId) return;

    const payload: DeleteNotePayload = {
      sprintId: selectedSprintId,
      noteId: pendingDeleteNoteId,
    };
    sendRequest("delete-note", payload, {
      onSuccess: (result) => {
        const sprintsPayload = result as SprintsPayload;
        setSprints(sprintsPayload.sprints);
        setIsDeleteNoteConfirmOpen(false);
        setPendingDeleteNoteId(null);
        setStatusMessage("Note deleted");
      },
      onError: (error) => setErrorMessage(error),
    });
  }, [pendingDeleteNoteId, selectedSprintId, sendRequest]);

  const handleCancelDeleteNote = useCallback(() => {
    setIsDeleteNoteConfirmOpen(false);
    setPendingDeleteNoteId(null);
  }, []);

  // ===================
  // Styles
  // ===================
  const selectStyle = {
    width: "100%",
    padding: "var(--pixel-8, 8px) var(--pixel-12, 12px)",
    border: "var(--pixel-1, 1px) solid var(--border-light)",
    borderRadius: "var(--pixel-6, 6px)",
    fontSize: "13px",
    backgroundColor: "var(--light-color)",
  };

  const inputStyle = {
    width: "100%",
    padding: "var(--pixel-8, 8px) var(--pixel-12, 12px)",
    border: "var(--pixel-1, 1px) solid var(--border-light)",
    borderRadius: "var(--pixel-6, 6px)",
    fontSize: "13px",
  };

  const buttonRowStyle = {
    display: "flex",
    gap: "var(--pixel-4, 4px)",
  };

  // ===================
  // Render
  // ===================
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--pixel-16, 16px)",
        padding: "var(--pixel-16, 16px)",
      }}
    >
      {/* Sprint Management Section */}
      <Card title="Sprints">
        <IconArrowIteration className="card-icon" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          {/* Create Sprint */}
          <div style={{ display: "flex", gap: "var(--pixel-8, 8px)" }}>
            <input
              type="text"
              value={newSprintName}
              onChange={(e) => setNewSprintName(e.target.value)}
              placeholder="New sprint name"
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === "Enter" && handleCreateSprint()}
            />
            <button
              onClick={handleCreateSprint}
              disabled={!newSprintName.trim()}
            >
              Create
            </button>
          </div>

          {/* Sprint Dropdown */}
          {sprints.length > 0 ? (
            <select
              value={selectedSprintId || ""}
              onChange={(e) => handleSprintSelect(e.target.value)}
              style={selectStyle}
            >
              <option value="" disabled>
                Select a sprint
              </option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              No sprints yet. Create one above.
            </div>
          )}

          {/* Sprint Actions */}
          {selectedSprintId && !isRenaming && (
            <>
              <div style={buttonRowStyle}>
                <button
                  onClick={handleStartRename}
                  className="secondary"
                  style={{ flex: 1 }}
                >
                  Edit sprint
                </button>
                <button
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  disabled={isDestructiveActionBusy}
                  className="secondary"
                  style={{ flex: 1 }}
                >
                  Delete sprint
                </button>
              </div>

              <button
                onClick={handleExportCsv}
                disabled={isExportingCsv || currentSprintNotes.length === 0}
                className="secondary"
                style={{ width: "100%" }}
              >
                Export CSV · this sprint
              </button>

              <div style={buttonRowStyle}>
                <button
                  onClick={handleExportNotes}
                  disabled={isExporting || sprints.length === 0}
                  className="secondary"
                  style={{ flex: 1 }}
                >
                  Export JSON · all
                </button>
                <button
                  onClick={handleImportNotes}
                  disabled={isImporting}
                  className="secondary"
                  style={{ flex: 1 }}
                >
                  Import notes
                </button>
              </div>

              {/* Figma withholds the file key on some installs, so CSV links
                  need a URL pasted once per file. */}
              {(isFileUrlPromptOpen ||
                (fileContext !== null && fileContext.fileKey === null)) && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--pixel-6, 6px)",
                    padding: "var(--pixel-8, 8px)",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--pixel-6, 6px)",
                  }}
                >
                  <div style={{ fontSize: "11px", opacity: 0.7 }}>
                    Figma does not expose this file's key here, so CSV links are
                    empty. Paste the file URL once to fix every later export.
                  </div>
                  <div style={{ display: "flex", gap: "var(--pixel-4, 4px)" }}>
                    <input
                      type="text"
                      value={fileUrlInput}
                      onChange={(e) => setFileUrlInput(e.target.value)}
                      placeholder="https://www.figma.com/design/…"
                      style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSaveFileKey()
                      }
                    />
                    <button
                      onClick={handleSaveFileKey}
                      disabled={!fileUrlInput.trim()}
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              <div style={buttonRowStyle}>
                <button
                  onClick={handlePublishNotes}
                  disabled={
                    isDestructiveActionBusy || currentSprintNotes.length === 0
                  }
                  className="secondary"
                  style={{ flex: 1 }}
                >
                  Publish to canvas
                </button>
                <button
                  onClick={handleClearCanvas}
                  disabled={isDestructiveActionBusy}
                  className="secondary"
                  style={{ flex: 1 }}
                >
                  Delete from canvas
                </button>
              </div>
            </>
          )}

          {/* Rename Inline UI */}
          {isRenaming && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--pixel-8, 8px)",
              }}
            >
              <input
                type="text"
                value={renameSprintName}
                onChange={(e) => setRenameSprintName(e.target.value)}
                placeholder="New name"
                style={inputStyle}
              />
              <div style={{ display: "flex", gap: "var(--pixel-8, 8px)" }}>
                <button
                  onClick={handleConfirmRename}
                  disabled={!renameSprintName.trim()}
                  style={{ flex: 1 }}
                >
                  Save
                </button>
                <button
                  onClick={handleCancelRename}
                  style={{
                    flex: 1,
                    backgroundColor: "transparent",
                    border: "1px solid var(--border-light)",
                    color: "var(--figma-color-text, #333)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Foundation Section */}
      <Card title="Foundation" className="relative-element">
        <IconPalette className="card-icon" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <button
            onClick={handleReloadFoundationPages}
            className="secondary win-button"
            tool-tip="Rescan pages"
          >
            <IconRefresh size={16} />
          </button>

          {foundationSource === "all-pages" && (
            <div style={{ fontSize: "11px", opacity: 0.7 }}>
              No Foundation divider in this file, so every non-divider page is
              listed. Name a divider page "———— Foundation ————" to narrow it.
            </div>
          )}

          {foundationPages.length > 0 ? (
            <select
              value={
                subjectKind === "foundation-page"
                  ? (selectedFoundationPageId ?? "")
                  : ""
              }
              onChange={(e) => handleFoundationSelect(e.target.value || null)}
              style={selectStyle}
            >
              <option value="">No page selected</option>
              {foundationPages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              The Foundation area of this file is empty.
            </div>
          )}
        </div>
      </Card>

      {/* Components Section */}
      <Card title="Components" className="relative-element">
        <IconComponents className="card-icon" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <button
            onClick={handleScanComponents}
            className="secondary win-button"
            tool-tip="Scan for new components"
          >
            <IconRefresh size={16} />
          </button>

          {/* The input is always here, because it is what triggers the scan.
              Hiding it until a list existed was only possible while the panel
              scanned on open; now the user has to be able to reach it first. */}
          <SuggestInput
            value={componentSearchValue}
            options={componentOptions}
            onChange={handleComponentSearch}
            onFocus={ensureComponentsScanned}
            placeholder={
              componentsScan === "scanning"
                ? "Scanning file..."
                : "Search component..."
            }
            style={inputStyle}
          />

          {componentsScan === "idle" && (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              Click the box to search this file&rsquo;s components.
            </div>
          )}
          {componentsScan === "scanning" && (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              Scanning this file&rsquo;s components&hellip;
            </div>
          )}
          {/* Only ever said once the scan has actually looked. Before that,
              an empty list means "not asked yet", not "none here". */}
          {componentsScan === "done" && (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              {components.length > 0
                ? `Found ${components.length} component(s)`
                : "No components found in this file."}
            </div>
          )}

          {selectedComponentId && (
            <button
              onClick={() => handleComponentSelect(null)}
              className="secondary win-button"
            ></button>
          )}
        </div>
      </Card>

      {/* Release Notes Section */}
      <Card title="Release Notes" className="relative-element">
        <div className="card-icon">
          <IconNote />
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            paddingTop: "16px",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <button
            onClick={handleOpenAddNote}
            disabled={!canAddNote}
            className="secondary win-button"
            tool-tip="Add new note"
          >
            <IconPlus size={16} />
          </button>

          {!canAddNote && (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              Select a sprint, and a Foundation page or component, to add notes.
            </div>
          )}

          {currentSprintNotes.length === 0 && selectedSprintId && (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              No notes yet. Click "Add Note" to create one.
            </div>
          )}

          {currentSprintNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onView={handleViewNoteSubject}
              onEdit={handleOpenEditNote}
              onDelete={handleOpenDeleteNoteConfirm}
              deleteDisabled={isDestructiveActionBusy}
            />
          ))}
        </div>
      </Card>

      {/* Card Appearance: set once per file, so it sits below the daily path of
          pick a sprint, pick a subject, write a note, publish. */}
      <Card title="Card Appearance" className="relative-element">
        <IconBrush className="card-icon" />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <div style={{ fontSize: "11px", opacity: 0.6, lineHeight: 1.4 }}>
            Applies to every card in this file, for everyone who opens it. Text
            colours follow the background automatically.
          </div>

          <FormControl label="Font">
            <SuggestInput
              value={fontDraft ?? appearance.fontFamily}
              options={availableFonts}
              onChange={handleFontChange}
              onBlur={handleFontBlur}
              placeholder="Search font..."
              style={inputStyle}
            />
          </FormControl>

          {fontDraft !== null && (
            <div style={{ fontSize: "11px", opacity: 0.7, lineHeight: 1.4 }}>
              Still set to {appearance.fontFamily}. Only fonts with Regular,
              Medium and Bold are offered, which is every style a card draws
              with.
            </div>
          )}

          {fontDraft === null && fontMissingHere && (
            <div style={{ fontSize: "11px", opacity: 0.7, lineHeight: 1.4 }}>
              {appearance.fontFamily} is not installed here, so cards you
              publish will be drawn in Inter.
            </div>
          )}

          <FormControl label="Background">
            <div style={{ display: "flex", gap: "var(--pixel-8, 8px)" }}>
              <input
                type="color"
                value={`#${appearance.background}`}
                onChange={(e) => handleBackgroundChange(e.target.value)}
                style={{
                  width: "48px",
                  height: "40px",
                  flexShrink: 0,
                  borderRadius: "var(--pixel-8, 8px)",
                  border: "var(--pixel-1, 1px) solid var(--border-light)",
                  padding: "0 var(--pixel-4, 4px)",
                }}
              />
              <input
                type="text"
                value={`#${backgroundDraft ?? appearance.background}`}
                onChange={(e) => handleBackgroundChange(e.target.value)}
                onBlur={handleBackgroundBlur}
                spellCheck={false}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </FormControl>
        </div>
      </Card>

      {/* Font fallback: stays until the next publish fixes it, unlike the
          transient status pill. */}
      {fontNotice && (
        <div
          style={{
            fontSize: "11px",
            lineHeight: 1.4,
            padding: "var(--pixel-8, 8px)",
            border: "1px solid #FFA629",
            borderRadius: "var(--pixel-6, 6px)",
          }}
        >
          ⚠ {fontNotice}
        </div>
      )}

      {/* Pre-stamp frames a publish refused to guess about. Persists like the
          font notice: it needs an action, not an acknowledgement. */}
      {legacyNotice && (
        <div
          style={{
            fontSize: "11px",
            lineHeight: 1.4,
            padding: "var(--pixel-8, 8px)",
            border: "1px solid #FFA629",
            borderRadius: "var(--pixel-6, 6px)",
          }}
        >
          ⚠ {legacyNotice}
        </div>
      )}

      {/* Status Messages */}
      {(statusMessage || errorMessage) && (
        <div
          className="status-pill"
          style={{
            cursor: "pointer",
            ["--pillBtnColor" as any]: statusMessage ? "#059669" : "#dc2626",
          }}
          onClick={() => {
            setStatusMessage(null);
            setErrorMessage(null);
          }}
        >
          {statusMessage || errorMessage}
        </div>
      )}

      {/* Clear Canvas Review Modal */}
      <Modal
        isOpen={isClearCanvasReviewOpen}
        title="Review frames before deleting"
        onClose={handleCloseClearCanvasReview}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <div style={{ fontSize: "13px", lineHeight: 1.4 }}>
            Review every candidate before deletion.
          </div>
          <div style={{ fontSize: "12px", opacity: 0.7, lineHeight: 1.4 }}>
            Verified stamped output was created by Release Notes and is selected
            by default. Unverified legacy-name matches only have an old output
            name. They may be designer-owned frames, so they are not selected.
            Select each unverified frame only when you want to delete that exact
            frame.
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--pixel-8, 8px)",
              maxHeight: "280px",
              overflowY: "auto",
            }}
          >
            {clearCanvasCandidates.map((candidate) => {
              const isSelected = selectedClearCanvasIds.includes(candidate.id);
              const ownershipLabel = clearCanvasOwnershipLabel(
                candidate.ownership,
              );

              return (
                <div
                  key={candidate.id}
                  style={{
                    display: "flex",
                    gap: "var(--pixel-8, 8px)",
                    alignItems: "flex-start",
                    padding: "var(--pixel-8, 8px)",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--pixel-6, 6px)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isClearingCanvas}
                    aria-label={`Select ${candidate.name} (${candidate.id})`}
                    onChange={(event) =>
                      handleToggleClearCanvasCandidate(
                        candidate.id,
                        event.target.checked,
                      )
                    }
                  />
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--pixel-4, 4px)",
                      fontSize: "12px",
                      lineHeight: 1.35,
                    }}
                  >
                    <strong>{candidate.name}</strong>
                    <span>Page: {candidate.pageName}</span>
                    <span>Node ID: {candidate.id}</span>
                    <span>Ownership: {ownershipLabel}</span>
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={isClearingCanvas}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleViewClearCanvasCandidate(candidate.id);
                    }}
                    style={{ flexShrink: 0, alignSelf: "center" }}
                  >
                    View on canvas
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            {selectedClearCanvasIds.length} frame(s) selected.
          </div>
          <div style={{ display: "flex", gap: "var(--pixel-8, 8px)" }}>
            <button
              onClick={handleConfirmClearCanvas}
              disabled={isClearingCanvas || selectedClearCanvasIds.length === 0}
              style={{
                flex: 1,
                backgroundColor: "#dc2626",
                color: "white",
                border: "none",
              }}
            >
              Delete selected
            </button>
            <button
              onClick={handleCloseClearCanvasReview}
              disabled={isClearingCanvas}
              style={{
                flex: 1,
                backgroundColor: "transparent",
                border: "1px solid var(--border-light)",
                color: "var(--figma-color-text, #333)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Sprint Confirmation Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        title="Delete Sprint"
        onClose={() => setIsDeleteConfirmOpen(false)}
      >
        <div style={{ fontSize: "13px" }}>
          Are you sure you want to delete sprint "
          <strong>{selectedSprint?.name}</strong>"?
        </div>
        <div
          style={{
            fontSize: "12px",
            opacity: 0.6,
            marginTop: "var(--pixel-8, 8px)",
          }}
        >
          This action cannot be undone. All release notes in this sprint will be
          lost.
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--pixel-8, 8px)",
            marginTop: "var(--pixel-16, 16px)",
          }}
        >
          <button
            onClick={handleConfirmDeleteSprint}
            style={{
              flex: 1,
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
            }}
          >
            Delete
          </button>
          <button
            onClick={() => setIsDeleteConfirmOpen(false)}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "1px solid var(--border-light)",
              color: "var(--figma-color-text, #333)",
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Add/Edit Note Modal */}
      {/* Add/Edit Note Modal */}
      <Modal
        isOpen={isNoteModalOpen}
        title={editingNote ? "Edit Note" : "Add Note"}
        onClose={handleCloseNoteModal}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <FormControl label="Description">
            <textarea
              value={noteDescription}
              onChange={(e) => setNoteDescription(e.target.value)}
              placeholder="Describe the change..."
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </FormControl>

          <FormControl label="Tag">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--pixel-8, 8px)",
              }}
            >
              {TAG_OPTIONS.map((option) => {
                const isSelected = noteTag === option.value;
                const tagColor = TAG_COLORS[option.value as NoteTag];

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNoteTag(option.value as NoteTag)}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      border: `1px solid ${tagColor}`,
                      backgroundColor: isSelected ? tagColor : "white",
                      color: isSelected ? "white" : tagColor,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </FormControl>

          <FormControl
            label={
              (editingNote?.subject.kind ?? activeSubject?.kind) ===
              "foundation-page"
                ? "Foundation page"
                : "Component set"
            }
          >
            <div style={{ fontSize: "13px", opacity: 0.6 }}>
              {editingNote
                ? editingNote.subject.name
                : (activeSubject?.name ?? "None selected")}
            </div>
          </FormControl>

          {editingNote && (
            <div style={{ fontSize: "11px", opacity: 0.6 }}>
              Created: {formatDate(editingNote.createdAt)} by{" "}
              {editingNote.authorName}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "var(--pixel-8, 8px)",
              marginTop: "var(--pixel-8, 8px)",
            }}
          >
            <button
              onClick={handleSaveNote}
              disabled={!noteDescription.trim()}
              style={{ flex: 1 }}
            >
              {editingNote ? "Save Changes" : "Add Note"}
            </button>
            <button
              onClick={handleCloseNoteModal}
              style={{
                flex: 1,
                backgroundColor: "transparent",
                border: "1px solid var(--border-light)",
                color: "var(--figma-color-text, #333)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Note Confirmation Modal */}
      <Modal
        isOpen={isDeleteNoteConfirmOpen}
        title="Delete Note"
        onClose={handleCancelDeleteNote}
      >
        <div style={{ fontSize: "13px" }}>
          Are you sure you want to delete this note?
        </div>
        <div
          style={{
            fontSize: "12px",
            opacity: 0.6,
            marginTop: "var(--pixel-8, 8px)",
          }}
        >
          This action cannot be undone.
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--pixel-8, 8px)",
            marginTop: "var(--pixel-16, 16px)",
          }}
        >
          <button
            onClick={handleConfirmDeleteNote}
            style={{
              flex: 1,
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
            }}
          >
            Delete
          </button>
          <button
            onClick={handleCancelDeleteNote}
            style={{
              flex: 1,
              backgroundColor: "transparent",
              border: "1px solid var(--border-light)",
              color: "var(--figma-color-text, #333)",
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
