import { useCallback, useEffect, useRef, useState } from "react";
import { Card, FormControl } from "@shell/components";
import { postToFigma } from "@shared/bridge";
import type {
  AuditAction,
  SeverityLevel,
  DropdownOption,
  CsvData,
} from "./types";
import { dropdownOptions } from "./utils/dropdownOptions";
import { exportCsv } from "./utils/exportCsv";
import { createMultiPagePdf, downloadPdf } from "./utils/createMultiPagePdf";

interface PendingRequest {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  onFinally?: () => void;
}

// Severity button config
const SEVERITY_BUTTONS: {
  severity: SeverityLevel;
  label: string;
  bgColor: string;
}[] = [
  { severity: "low", label: "Low", bgColor: "#C4FA8E" },
  { severity: "medium", label: "Medium", bgColor: "#FFFF02" },
  { severity: "high", label: "High", bgColor: "#FFBF01" },
  { severity: "critical", label: "Critical", bgColor: "#FD8181" },
];

export function AuditUI() {
  // State
  const [note, setNote] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<DropdownOption | null>(
    null,
  );
  const [predefinedNotes, setPredefinedNotes] = useState<DropdownOption[]>([]);
  const [selectedNote, setSelectedNote] = useState<DropdownOption | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingRequests = useRef(new Map<string, PendingRequest>());

  // Build section options from dropdown options
  const sections: DropdownOption[] = dropdownOptions.map((options, index) => {
    const sectionTitle = Object.keys(options)[0];
    return {
      id: index,
      name: sectionTitle,
    };
  });

  // Update predefined notes when section changes
  useEffect(() => {
    if (selectedSection) {
      const sectionName = selectedSection.name;
      const notesSection = dropdownOptions.find(
        (element) => Object.keys(element)[0] === sectionName,
      );
      if (!notesSection) return;

      const sectionData = (
        notesSection[sectionName as keyof typeof notesSection] as {
          value: string;
        }[]
      ).map((element, index) => ({
        id: index,
        name: element.value,
      }));
      setPredefinedNotes(sectionData);
      setSelectedNote(null);
    }
  }, [selectedSection]);

  // Send request helper
  const sendRequest = useCallback(
    (action: AuditAction, payload: any, handlers: PendingRequest = {}) => {
      const requestId = `audit-${action}-${Date.now()}`;
      pendingRequests.current.set(requestId, handlers);
      postToFigma({
        target: "audit",
        action,
        payload,
        requestId,
      });
      return requestId;
    },
    [],
  );

  // Message handler
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage || event.data;
      if (!message?.requestId) return;

      const handlers = pendingRequests.current.get(message.requestId);
      if (!handlers) return;
      pendingRequests.current.delete(message.requestId);

      if (message.type === "error") {
        handlers.onError?.(message.error ?? "Unknown error");
      } else {
        handlers.onSuccess?.(message.result);
      }
      handlers.onFinally?.();
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Clear messages after delay
  const showStatus = (message: string) => {
    setStatusMessage(message);
    setErrorMessage(null);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    setStatusMessage(null);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  // Handle adding a severity note
  const handleAddNote = useCallback(
    (severity: SeverityLevel) => {
      if (isProcessing) return;

      setIsProcessing(severity);

      sendRequest(
        "add-note",
        {
          severity,
          title: selectedSection?.name,
          selectedNote: selectedNote?.name,
          note,
        },
        {
          onSuccess: (result) => {
            if (result?.success) {
              showStatus(result.message);
            } else {
              showError(result?.message ?? "Failed to add note");
            }
          },
          onError: showError,
          onFinally: () => setIsProcessing(null),
        },
      );
    },
    [isProcessing, sendRequest, selectedSection, selectedNote, note],
  );

  // Handle quick win
  const handleQuickWin = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("quick-win");

    sendRequest(
      "add-quick-win",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to mark as quick win");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle generate report
  const handleGenerateReport = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("report");

    sendRequest(
      "generate-report",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to generate report");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle export PDF
  const handleExportPdf = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("export-pdf");

    sendRequest(
      "export-pdf",
      {},
      {
        onSuccess: (result) => {
          if (result?.success && result.data) {
            downloadPdf(new Uint8Array(result.data), "audit-report.pdf");
            showStatus("PDF exported successfully");
          } else {
            showError(result?.message ?? "Failed to export PDF");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle export multi-page PDF
  const handleExportMultipagePdf = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("export-multipage-pdf");

    sendRequest(
      "export-multipage-pdf",
      {},
      {
        onSuccess: async (result) => {
          if (result?.success && result.pages) {
            const pages = result.pages.map((p: number[]) => new Uint8Array(p));
            await createMultiPagePdf(pages);
            showStatus("Multi-page PDF exported successfully");
          } else {
            showError(result?.message ?? "Failed to export multi-page PDF");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle export CSV
  const handleExportCsv = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("export-csv");

    sendRequest(
      "export-csv",
      {},
      {
        onSuccess: (result) => {
          if (result?.success && result.data) {
            exportCsv(result.data as CsvData);
            showStatus("CSV exported successfully");
          } else {
            showError(result?.message ?? "Failed to export CSV");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle update from canvas
  const handleUpdateFromCanvas = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("update");

    sendRequest(
      "update-from-canvas",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to update from canvas");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle erase notes on canvas
  const handleEraseNotesOnCanvas = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("erase-notes");

    sendRequest(
      "erase-notes-on-canvas",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to erase notes");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  // Handle erase report (double-click)
  const handleEraseReport = useCallback(() => {
    if (isProcessing) return;

    setIsProcessing("erase-report");

    sendRequest(
      "erase-report",
      {},
      {
        onSuccess: (result) => {
          if (result?.success) {
            showStatus(result.message);
          } else {
            showError(result?.message ?? "Failed to erase report");
          }
        },
        onError: showError,
        onFinally: () => setIsProcessing(null),
      },
    );
  }, [isProcessing, sendRequest]);

  const inputStyle = {
    width: "100%",
  };

  const buttonStyle = (bgColor: string) => ({
    flex: 1,
    padding: "10px 8px",
    backgroundColor: bgColor,
    color: "#515151",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
  });

  const actionButtonStyle = (bgColor: string) => ({
    width: "100%",
    padding: "10px 16px",
    backgroundColor: bgColor,
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
      }}
    >
      {/* Note Input Card */}
      <Card title="Add Note">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <FormControl label="Category">
            <select
              value={selectedSection?.id ?? ""}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                const section = sections.find((s) => s.id === id);
                setSelectedSection(section || null);
              }}
              style={inputStyle}
            >
              <option value="">Select category...</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </FormControl>

          {predefinedNotes.length > 0 && (
            <FormControl label="Predefined Note">
              <select
                value={selectedNote?.id ?? ""}
                onChange={(e) => {
                  const id = parseInt(e.target.value);
                  const noteOption = predefinedNotes.find((n) => n.id === id);
                  setSelectedNote(noteOption || null);
                }}
                style={inputStyle}
              >
                <option value="">Select note...</option>
                {predefinedNotes.map((noteOption) => (
                  <option key={noteOption.id} value={noteOption.id}>
                    {noteOption.name.length > 60
                      ? noteOption.name.substring(0, 60) + "..."
                      : noteOption.name}
                  </option>
                ))}
              </select>
            </FormControl>
          )}

          <FormControl label="Additional Notes">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add your custom notes here..."
              style={{
                ...inputStyle,
                minHeight: "80px",
                resize: "vertical",
              }}
            />
          </FormControl>
        </div>
      </Card>

      {/* Severity Buttons Card */}
      <Card title="Severity">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            {SEVERITY_BUTTONS.map(({ severity, label, bgColor }) => (
              <button
                key={severity}
                onClick={() => handleAddNote(severity)}
                disabled={isProcessing !== null}
                style={{
                  ...buttonStyle(bgColor),
                  opacity: isProcessing && isProcessing !== severity ? 0.5 : 1,
                }}
              >
                {isProcessing === severity ? "..." : label}
              </button>
            ))}
          </div>

          <button
            onClick={handleQuickWin}
            disabled={isProcessing !== null}
            style={{
              ...actionButtonStyle("#ffcc84"),
              color: "#2d2d2d",
            }}
          >
            {isProcessing === "quick-win" ? "Processing..." : "Quick Win 🏆"}
          </button>
        </div>
      </Card>

      {/* Report Actions Card */}
      <Card title="Report">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={handleGenerateReport}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#374151")}
          >
            {isProcessing === "report" ? "Generating..." : "Generate Report"}
          </button>

          <button
            onClick={handleExportPdf}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#468079")}
          >
            {isProcessing === "export-pdf"
              ? "Exporting..."
              : "Export PDF (Single Page)"}
          </button>

          <button
            onClick={handleExportMultipagePdf}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#417EAA")}
          >
            {isProcessing === "export-multipage-pdf"
              ? "Exporting..."
              : "Export PDF (Multi-Page)"}
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#1f1ab5")}
          >
            {isProcessing === "export-csv" ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </Card>

      {/* Cleanup Actions Card */}
      <Card title="Manage">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={handleUpdateFromCanvas}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#800582")}
          >
            {isProcessing === "update" ? "Updating..." : "Update from Canvas ↑"}
          </button>

          <button
            onClick={handleEraseNotesOnCanvas}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#c15400")}
          >
            {isProcessing === "erase-notes"
              ? "Erasing..."
              : "Erase Notes on Canvas"}
          </button>

          <button
            onDoubleClick={handleEraseReport}
            disabled={isProcessing !== null}
            style={actionButtonStyle("#C11700")}
            title="Double-click to erase all report data"
          >
            {isProcessing === "erase-report"
              ? "Erasing..."
              : "Erase Report Data (Double-click)"}
          </button>
        </div>
      </Card>

      {/* Status Messages */}
      {(statusMessage || errorMessage) && (
        <div
          style={{
            padding: "12px",
            borderRadius: "8px",
            fontSize: "12px",
            backgroundColor: statusMessage
              ? "rgba(5, 150, 105, 0.1)"
              : "rgba(220, 38, 38, 0.1)",
            color: statusMessage ? "#059669" : "#dc2626",
          }}
        >
          {statusMessage || errorMessage}
        </div>
      )}
    </div>
  );
}
