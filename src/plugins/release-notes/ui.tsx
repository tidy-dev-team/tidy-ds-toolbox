import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Card, FormControl } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import {
  IconFocus2,
  IconEdit,
  IconTrash,
  IconTable,
} from "@tabler/icons-react";
import type {
  ComponentSetInfo,
  ComponentSetsPayload,
  Sprint,
  SprintsPayload,
  ReleaseNote,
  NoteTag,
  AddNotePayload,
  EditNotePayload,
  DeleteNotePayload,
  RenameSprintPayload,
} from "./types";
import { TAG_OPTIONS, TAG_COLORS, TAG_LABELS } from "./utils/constants";

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
}

function NoteCard({ note, onView, onEdit, onDelete }: NoteCardProps) {
  const tagColor = TAG_COLORS[note.tag];
  const tagLabel = TAG_LABELS[note.tag];

  return (
    <div
      style={{
        border: "1px solid var(--border-light)",
        borderRadius: "var(--pixel-6, 6px)",
        padding: "var(--pixel-12, 12px)",
        marginBottom: "var(--pixel-8, 8px)",
        backgroundColor: "var(--light-color)",
      }}
    >
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

      {/* Component */}
      <div style={{ marginBottom: "4px", fontSize: "12px" }}>
        <span style={{ opacity: 0.6 }}>Component: </span>
        <span style={{ color: "#9747FF" }}>{note.componentSetName}</span>
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
          title="View component"
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
          title="Edit note"
        >
          <IconEdit size={16} />
        </button>
        <button
          onClick={() => onDelete(note.id)}
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
          title="Delete note"
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
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--light-color)",
          borderRadius: "var(--pixel-8, 8px)",
          padding: "var(--pixel-16, 16px)",
          width: "90%",
          maxWidth: "320px",
          maxHeight: "80%",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 var(--pixel-16, 16px) 0", fontSize: "14px" }}>
          {title}
        </h3>
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
  const [componentSets, setComponentSets] = useState<ComponentSetInfo[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(
    null,
  );

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

  // ===================
  // UI State
  // ===================
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  // ===================
  // Derived State
  // ===================
  const selectedSprint = useMemo(
    () => sprints.find((s) => s.id === selectedSprintId),
    [sprints, selectedSprintId],
  );

  const selectedComponent = useMemo(
    () => componentSets.find((cs) => cs.id === selectedComponentId),
    [componentSets, selectedComponentId],
  );

  const currentSprintNotes = useMemo(() => {
    if (!selectedSprint) return [];
    return [...selectedSprint.notes].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [selectedSprint]);

  const filteredComponentSets = useMemo(() => {
    return componentSets
      .filter((cs) => !cs.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [componentSets]);

  const canAddNote = selectedSprintId && selectedComponentId;

  // ===================
  // Request Helper
  // ===================
  const sendRequest = useCallback(
    (action: string, payload: unknown, handlers: PendingRequest = {}) => {
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

    // Load data on startup
    sendRequest(
      "load-components",
      {},
      {
        onSuccess: (result) => {
          const payload = result as ComponentSetsPayload;
          setComponentSets(payload.componentSets);
          setSelectedComponentId(payload.lastSelectedComponentSetId);
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

    return () => window.removeEventListener("message", handleMessage);
  }, [sendRequest]);

  // ===================
  // Component Set Handlers
  // ===================
  const handleScanComponents = useCallback(() => {
    sendRequest(
      "scan-components",
      {},
      {
        onSuccess: (result) => {
          const payload = result as ComponentSetsPayload;
          setComponentSets(payload.componentSets);
          setSelectedComponentId(payload.lastSelectedComponentSetId);
          setStatusMessage(
            `Found ${payload.componentSets.length} component sets`,
          );
        },
        onError: (error) => setErrorMessage(error),
      },
    );
  }, [sendRequest]);

  const handleComponentSelect = useCallback(
    (id: string) => {
      setSelectedComponentId(id);
      sendRequest("select-component", id);
    },
    [sendRequest],
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
    if (!selectedSprintId) return;

    setIsPublishing(true);
    sendRequest("publish-notes", selectedSprintId, {
      onSuccess: () => {
        setStatusMessage("Release notes published to canvas");
      },
      onError: (error) => setErrorMessage(error),
      onFinally: () => setIsPublishing(false),
    });
  }, [selectedSprintId, sendRequest]);

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

  const handleViewNoteComponent = useCallback(
    (note: ReleaseNote) => {
      sendRequest("view-component", note.componentSetId);
    },
    [sendRequest],
  );

  const handleSaveNote = useCallback(() => {
    const trimmedDescription = noteDescription.trim();
    if (
      !trimmedDescription ||
      !selectedSprintId ||
      !selectedComponentId ||
      !selectedComponent
    ) {
      return;
    }

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
        componentSetId: selectedComponentId,
        componentSetName: selectedComponent.name,
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
    selectedComponentId,
    selectedComponent,
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

  const iconButtonStyle: React.CSSProperties = {
    flex: 1,
    padding: "var(--pixel-8, 8px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    border: "1px solid var(--border-light)",
    borderRadius: "var(--pixel-4, 4px)",
    cursor: "pointer",
    color: "var(--figma-color-text, #333)",
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
      <Card title="🗓️ Sprints">
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
              style={{ whiteSpace: "nowrap" }}
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
            <div style={buttonRowStyle}>
              <button
                onClick={handlePublishNotes}
                disabled={isPublishing || currentSprintNotes.length === 0}
                style={iconButtonStyle}
                title="Publish notes to canvas"
              >
                <IconTable size={16} />
              </button>
              <button
                onClick={handleStartRename}
                style={iconButtonStyle}
                title="Rename sprint"
              >
                <IconEdit size={16} />
              </button>
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                style={iconButtonStyle}
                title="Delete sprint"
              >
                <IconTrash size={16} />
              </button>
            </div>
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

      {/* Component Sets Section */}
      <Card title="🧩 Component Sets">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <button onClick={handleScanComponents} className="morePadding">
            Scan for new components
          </button>

          {componentSets.length > 0 && (
            <>
              <div style={{ fontSize: "12px", opacity: 0.6 }}>
                Found {componentSets.length} component set(s)
              </div>
              <select
                value={selectedComponentId || ""}
                onChange={(e) => handleComponentSelect(e.target.value)}
                style={selectStyle}
              >
                <option value="" disabled>
                  Select a component set
                </option>
                {filteredComponentSets.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {componentSets.length === 0 && (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              No component sets found. Click "Scan for new components" to
              search.
            </div>
          )}
        </div>
      </Card>

      {/* Release Notes Section */}
      <Card title="📝 Release Notes">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--pixel-12, 12px)",
          }}
        >
          <button
            onClick={handleOpenAddNote}
            disabled={!canAddNote}
            className="morePadding"
          >
            + Add Note
          </button>

          {!canAddNote && (
            <div style={{ fontSize: "12px", opacity: 0.6 }}>
              Select a sprint and component to add notes.
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
              onView={handleViewNoteComponent}
              onEdit={handleOpenEditNote}
              onDelete={handleOpenDeleteNoteConfirm}
            />
          ))}
        </div>
      </Card>

      {/* Status Messages */}
      {(statusMessage || errorMessage) && (
        <div
          style={{
            padding: "var(--pixel-12, 12px)",
            borderRadius: "var(--pixel-8, 8px)",
            fontSize: "12px",
            backgroundColor: statusMessage
              ? "rgba(5, 150, 105, 0.1)"
              : "rgba(220, 38, 38, 0.1)",
            color: statusMessage ? "#059669" : "#dc2626",
          }}
          onClick={() => {
            setStatusMessage(null);
            setErrorMessage(null);
          }}
        >
          {statusMessage || errorMessage}
        </div>
      )}

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
            <select
              value={noteTag}
              onChange={(e) => setNoteTag(e.target.value as NoteTag)}
              style={selectStyle}
            >
              {TAG_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>

          <FormControl label="Component Set">
            <div style={{ fontSize: "13px", opacity: 0.6 }}>
              {editingNote
                ? editingNote.componentSetName
                : (selectedComponent?.name ?? "None selected")}
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
